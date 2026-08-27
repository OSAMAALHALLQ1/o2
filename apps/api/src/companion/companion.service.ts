import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CompanionActionResponseDto,
  CompanionCareStateDto,
} from '@o2/types';
import {
  applyCareAction,
  calculateEffectiveCareState,
  DEFAULT_COMPANION_TUNING_CONFIG,
  RawCareState,
} from '@o2/game-core';
import { CompanionActionDto } from './dto/companion-action.dto';

@Injectable()
export class CompanionService {
  private readonly logger = new Logger(CompanionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Retrieves the current effective care state for the player's permanent companion.
   * Pure deterministic calculation using Server Time.
   * ZERO continuous writes / tick jobs needed on read!
   */
  async getCompanionCareState(userId: string): Promise<CompanionCareStateDto> {
    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { selectedCharacter: true },
    });

    if (!profile || !profile.selectedCharacter) {
      throw new NotFoundException('لم يتم اختيار رفيق البداية الدائم بعد');
    }

    let careState = await this.prisma.companionCareState.findUnique({
      where: { userId },
    });

    if (!careState) {
      // First-time lazy initialization of care snapshot
      careState = await this.prisma.companionCareState.create({
        data: {
          userId,
          hunger: 80.0,
          cleanliness: 80.0,
          energy: 80.0,
          mood: 80.0,
          isSleeping: false,
        },
      });
    }

    const raw: RawCareState = {
      hunger: careState.hunger,
      cleanliness: careState.cleanliness,
      energy: careState.energy,
      mood: careState.mood,
      isSleeping: careState.isSleeping,
      sleepStartedAt: careState.sleepStartedAt,
      lastSimulatedAt: careState.lastSimulatedAt,
      lastInteractionAt: careState.lastInteractionAt,
    };

    const simulated = calculateEffectiveCareState(raw, Date.now());

    return {
      userId,
      characterId: profile.selectedCharacter.id,
      characterSlug: profile.selectedCharacter.slug,
      nameAr: profile.selectedCharacter.nameAr,
      nameEn: profile.selectedCharacter.nameEn,
      archetype: profile.selectedCharacter.archetype,
      placeholderAsset: profile.selectedCharacter.placeholderAsset,
      hunger: simulated.hunger,
      cleanliness: simulated.cleanliness,
      energy: simulated.energy,
      mood: simulated.mood,
      isSleeping: simulated.isSleeping,
      sleepStartedAt: simulated.sleepStartedAt ? new Date(simulated.sleepStartedAt).toISOString() : null,
      lastSimulatedAt: new Date(simulated.lastSimulatedAt).toISOString(),
      lastInteractionAt: new Date(simulated.lastInteractionAt).toISOString(),
      expression: simulated.expression,
      updatedAt: careState.updatedAt.toISOString(),
    };
  }

  /**
   * Executes an authoritative care action with strict idempotency, cooldown enforcement,
   * and PostgreSQL FOR UPDATE row-locking to guarantee serialized execution without lost updates.
   */
  async performCareAction(
    userId: string,
    dto: CompanionActionDto,
  ): Promise<CompanionActionResponseDto> {
    // 1. Idempotency Pre-Check: Return cached response if this clientActionId was already executed
    const existingLog = await this.prisma.companionActionLog.findUnique({
      where: {
        userId_clientActionId: {
          userId,
          clientActionId: dto.clientActionId,
        },
      },
    });

    if (existingLog) {
      this.logger.log(
        `Idempotent retry detected for user [${userId}] clientActionId [${dto.clientActionId}]. Returning cached response.`,
      );
      return existingLog.responsePayload as unknown as CompanionActionResponseDto;
    }

    const profile = await this.prisma.playerProfile.findUnique({
      where: { userId },
      include: { selectedCharacter: true },
    });

    if (!profile || !profile.selectedCharacter) {
      throw new NotFoundException('لم يتم اختيار رفيق البداية الدائم بعد');
    }

    const nowMs = Date.now();
    const nowDate = new Date(nowMs);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // 2. PostgreSQL Row Lock: Explicit SELECT ... FOR UPDATE on companion care state
        // Guarantees concurrent different actions (e.g. FEED + PLAY) serialize without lost updates
        await tx.$queryRawUnsafe(
          'SELECT "id" FROM "companion_care_states" WHERE "userId" = $1 FOR UPDATE',
          userId,
        ).catch(() => null);

        // 3. Action Cooldown Verification
        const actionConfig = DEFAULT_COMPANION_TUNING_CONFIG.actions[dto.action];
        const cooldownMs = actionConfig ? (actionConfig as any).cooldownMs ?? 0 : 0;
        if (cooldownMs > 0) {
          const lastAction = await tx.companionActionLog.findFirst({
            where: { userId, actionType: dto.action },
            orderBy: { appliedAt: 'desc' },
          });

          if (lastAction) {
            const elapsedMs = nowMs - new Date(lastAction.appliedAt).getTime();
            if (elapsedMs < cooldownMs) {
              const remainingSec = Math.ceil((cooldownMs - elapsedMs) / 1000);
              throw new ConflictException(
                `يرجى الانتظار ${remainingSec} ثوانٍ قبل تكرار هذا الإجراء`,
              );
            }
          }
        }

        // Find or create current state
        let careState = await tx.companionCareState.findUnique({
          where: { userId },
        });

        if (!careState) {
          careState = await tx.companionCareState.create({
            data: {
              userId,
              hunger: 80.0,
              cleanliness: 80.0,
              energy: 80.0,
              mood: 80.0,
              isSleeping: false,
            },
          });
        }

        const raw: RawCareState = {
          hunger: careState.hunger,
          cleanliness: careState.cleanliness,
          energy: careState.energy,
          mood: careState.mood,
          isSleeping: careState.isSleeping,
          sleepStartedAt: careState.sleepStartedAt,
          lastSimulatedAt: careState.lastSimulatedAt,
          lastInteractionAt: careState.lastInteractionAt,
        };

        let actionResult;
        try {
          actionResult = applyCareAction(raw, dto.action, nowMs);
        } catch (err: any) {
          if (err.message === 'COMPANION_IS_SLEEPING') {
            throw new ConflictException('الرفيق نائم حالياً. يجب إيقاظه أولاً للقيام بهذا النشاط');
          }
          if (err.message === 'ALREADY_SLEEPING') {
            throw new ConflictException('الرفيق نائم بالفعل');
          }
          if (err.message === 'ALREADY_AWAKE') {
            throw new ConflictException('الرفيق مستيقظ بالفعل');
          }
          if (err.message === 'INSUFFICIENT_ENERGY') {
            throw new BadRequestException('طاقة الرفيق منخفضة جداً للعب. دعه يستريح أو ينام');
          }
          throw new BadRequestException(err.message || 'فشل تطبيق الإجراء');
        }

        // Persist updated authoritative snapshot
        const updatedRecord = await tx.companionCareState.update({
          where: { userId },
          data: {
            hunger: actionResult.updatedState.hunger,
            cleanliness: actionResult.updatedState.cleanliness,
            energy: actionResult.updatedState.energy,
            mood: actionResult.updatedState.mood,
            isSleeping: actionResult.updatedState.isSleeping,
            sleepStartedAt: actionResult.updatedState.sleepStartedAt
              ? new Date(actionResult.updatedState.sleepStartedAt)
              : null,
            lastSimulatedAt: nowDate,
            lastInteractionAt: nowDate,
          },
        });

        const response: CompanionActionResponseDto = {
          success: true,
          action: dto.action,
          clientActionId: dto.clientActionId,
          reaction: actionResult.reaction,
          statDeltas: actionResult.statDeltas,
          state: {
            userId,
            characterId: profile.selectedCharacter.id,
            characterSlug: profile.selectedCharacter.slug,
            nameAr: profile.selectedCharacter.nameAr,
            nameEn: profile.selectedCharacter.nameEn,
            archetype: profile.selectedCharacter.archetype,
            placeholderAsset: profile.selectedCharacter.placeholderAsset,
            hunger: updatedRecord.hunger,
            cleanliness: updatedRecord.cleanliness,
            energy: updatedRecord.energy,
            mood: updatedRecord.mood,
            isSleeping: updatedRecord.isSleeping,
            sleepStartedAt: updatedRecord.sleepStartedAt
              ? updatedRecord.sleepStartedAt.toISOString()
              : null,
            lastSimulatedAt: updatedRecord.lastSimulatedAt.toISOString(),
            lastInteractionAt: updatedRecord.lastInteractionAt.toISOString(),
            expression: actionResult.updatedState.expression,
            updatedAt: updatedRecord.updatedAt.toISOString(),
          },
        };

        // Record in Idempotency Log table
        await tx.companionActionLog.create({
          data: {
            userId,
            clientActionId: dto.clientActionId,
            actionType: dto.action,
            appliedAt: nowDate,
            responsePayload: response as any,
          },
        });

        this.logger.log(
          `User [${userId}] applied care action [${dto.action}], reaction: [${actionResult.reaction}]`,
        );

        return response;
      });
    } catch (err: any) {
      // 4. Idempotency Race Recovery: If a concurrent duplicate request hit unique constraint (userId, clientActionId)
      if (
        err?.code === 'P2002' ||
        err?.message?.includes('companion_action_logs_userId_clientActionId_key') ||
        err?.message?.includes('unique constraint')
      ) {
        const savedLog = await this.prisma.companionActionLog.findUnique({
          where: {
            userId_clientActionId: {
              userId,
              clientActionId: dto.clientActionId,
            },
          },
        });
        if (savedLog) {
          this.logger.log(
            `Recovered from concurrent idempotency race for user [${userId}] clientActionId [${dto.clientActionId}]`,
          );
          return savedLog.responsePayload as unknown as CompanionActionResponseDto;
        }
      }
      throw err;
    }
  }
}
