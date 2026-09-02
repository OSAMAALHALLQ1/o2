import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface PersistMatchHistoryParams {
  matchId: string;
  roomId: string;
  winnerUserId: string;
  participants: Array<{
    userId: string;
    username: string;
    displayName?: string;
    finalScore: number;
  }>;
  finalScores: Record<string, number>;
  totalRounds: number;
}

@Injectable()
export class GameHistoryService {
  private readonly logger = new Logger(GameHistoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  async recordMatchHistory(params: PersistMatchHistoryParams): Promise<void> {
    try {
      await this.prisma.gameMatchHistory.upsert({
        where: { matchId: params.matchId },
        create: {
          matchId: params.matchId,
          gameMode: 'ATRASH',
          roomId: params.roomId,
          winnerUserId: params.winnerUserId,
          participants: params.participants as any,
          finalScores: params.finalScores as any,
          totalRounds: params.totalRounds,
          completedAt: new Date(),
        },
        update: {
          winnerUserId: params.winnerUserId,
          finalScores: params.finalScores as any,
          totalRounds: params.totalRounds,
        },
      });

      this.logger.log(`Recorded match history for match ${params.matchId} (Winner: ${params.winnerUserId})`);
    } catch (err: any) {
      this.logger.error(`Failed to record match history for ${params.matchId}: ${err.message}`, err.stack);
      // Non-blocking error: ephemeral gameplay must never crash due to analytics/history logging
    }
  }
}
