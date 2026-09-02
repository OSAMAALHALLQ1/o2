import {
  type AtrashPlayerPrivateState,
  type AtrashPublicState,
  type RoomAction,
  type RoomGameMode,
  AtrashActionTypes,
  AtrashSystemEvents,
} from '@o2/types';
import {
  AtrashEngineError,
  AtrashGameEngine,
  type AtrashInternalState,
} from '@o2/game-core';
import type { RealtimeServer } from '../../transport/realtime-server.interface';
import type {
  EngineActionResult,
  IRoomEngineAdapter,
  Room,
  RoomTimerRegistry,
} from '../room-manager';

export class AtrashRoomAdapter
  implements IRoomEngineAdapter<AtrashInternalState, AtrashPlayerPrivateState>
{
  readonly gameMode: RoomGameMode = 'ATRASH';
  readonly roomId: string;
  private readonly engine: AtrashGameEngine;
  private realtimeServer?: RealtimeServer;
  private timerRegistry?: RoomTimerRegistry;
  private onMatchCompletedCallback?: (result: AtrashInternalState['roundResultData']) => Promise<void> | void;

  constructor(
    roomId: string,
    realtimeServer?: RealtimeServer,
    timerRegistry?: RoomTimerRegistry,
    testSeed?: number,
  ) {
    this.roomId = roomId;
    this.realtimeServer = realtimeServer;
    this.timerRegistry = timerRegistry;
    this.engine = new AtrashGameEngine({
      roomId,
      matchId: `match_${roomId.replace('room_', '')}`,
      testSeed,
    });
  }

  bindRoom(room: Room): void {
    this.setTimerRegistry(room.timers);
  }

  onRoomReady(room: Room): void {
    if (this.engine.internalState.phase !== 'LOBBY') {
      return;
    }
    this.engine.setParticipants(
      room.participants.map((p) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
      })),
    );
    if (room.state === 'WAITING') {
      room.setState('READY');
    }
    if (room.state === 'READY') {
      room.setState('RUNNING');
    }
    this.engine.startGame();
    this.scheduleTurnTimer();
  }

  onParticipantDisconnect(userId: string): void {
    this.engine.handleParticipantDisconnect(userId);
  }

  onParticipantReconnect(userId: string): void {
    this.engine.handleParticipantReconnect(userId);
  }

  setTimerRegistry(timerRegistry: RoomTimerRegistry): void {
    this.timerRegistry = timerRegistry;
  }

  setRealtimeServer(realtimeServer: RealtimeServer): void {
    this.realtimeServer = realtimeServer;
  }

  setOnMatchCompleted(cb: (result: AtrashInternalState['roundResultData']) => Promise<void> | void): void {
    this.onMatchCompletedCallback = cb;
  }

  getEngine(): AtrashGameEngine {
    return this.engine;
  }

  createInitialState(): AtrashInternalState {
    return this.engine.internalState;
  }

  validateAction(
    state: AtrashInternalState,
    action: RoomAction,
  ): { isValid: boolean; errorMessage?: string } {
    if (!action.type || typeof action.type !== 'string') {
      return { isValid: false, errorMessage: 'نوع الإجراء مطلوب' };
    }

    // Verify user is in match
    const isMember = state.participants.some((p) => p.userId === action.userId);
    if (state.participants.length > 0 && !isMember) {
      return { isValid: false, errorMessage: 'المستخدم ليس عضواً في هذه المباراة' };
    }

    const payload = (action.payload as any) || {};

    switch (action.type) {
      case AtrashActionTypes.START_GAME:
        if (state.phase !== 'LOBBY') {
          return { isValid: false, errorMessage: 'المباراة قد بدأت بالفعل' };
        }
        if (state.participants.length !== 5) {
          return { isValid: false, errorMessage: 'يجب توفر 5 لاعبين لبدء المباراة' };
        }
        break;

      case AtrashActionTypes.SUBMIT_QUESTION:
        if (state.phase !== 'QUESTION_PHASE') {
          return { isValid: false, errorMessage: 'ليست مرحلة طرح الأسئلة' };
        }
        if (action.userId !== state.currentAskerId) {
          return { isValid: false, errorMessage: 'ليس دورك لطرح السؤال' };
        }
        if (state.turnStage !== 'ASKING') {
          return { isValid: false, errorMessage: 'تم طرح السؤال بالفعل وبانتظار الإجابة' };
        }
        if (!payload.questionText || typeof payload.questionText !== 'string') {
          return { isValid: false, errorMessage: 'نص السؤال مطلوب' };
        }
        break;

      case AtrashActionTypes.SUBMIT_ANSWER:
        if (state.phase !== 'QUESTION_PHASE') {
          return { isValid: false, errorMessage: 'ليست مرحلة الإجابة' };
        }
        if (action.userId !== state.currentAnswererId) {
          return { isValid: false, errorMessage: 'ليس دورك للإجابة' };
        }
        if (state.turnStage !== 'ANSWERING') {
          return { isValid: false, errorMessage: 'يجب طرح السؤال أولاً قبل الإجابة' };
        }
        if (!payload.answerText || typeof payload.answerText !== 'string') {
          return { isValid: false, errorMessage: 'نص الإجابة مطلوب' };
        }
        break;

      case AtrashActionTypes.CAST_VOTE:
        if (state.phase !== 'VOTING') {
          return { isValid: false, errorMessage: 'التصويت غير متاح في هذه المرحلة' };
        }
        if (!payload.targetUserId || typeof payload.targetUserId !== 'string') {
          return { isValid: false, errorMessage: 'الهدف المطلوب التصويت له غير محدد' };
        }
        if (payload.targetUserId === action.userId) {
          return { isValid: false, errorMessage: 'لا يمكنك التصويت لنفسك' };
        }
        if (state.votes.has(action.userId)) {
          return { isValid: false, errorMessage: 'لقد قمت بالتصويت بالفعل' };
        }
        break;

      case AtrashActionTypes.SUBMIT_LAST_CHANCE:
        if (state.phase !== 'ATRASH_LAST_CHANCE') {
          return { isValid: false, errorMessage: 'ليست مرحلة الفرصة الأخيرة للأطرش' };
        }
        if (action.userId !== state.atrashUserId) {
          return { isValid: false, errorMessage: 'فقط الأطرش يمكنه اختيار الكلمة في الفرصة الأخيرة' };
        }
        if (!payload.selectedWord || typeof payload.selectedWord !== 'string') {
          return { isValid: false, errorMessage: 'يجب اختيار كلمة من الخيارات' };
        }
        break;

      case AtrashActionTypes.ADVANCE_PHASE:
        // System or host controlled advance
        break;

      default:
        return { isValid: false, errorMessage: `نوع الإجراء غير معروف أو غير مصرح به: ${action.type}` };
    }

    return { isValid: true };
  }

  applyAction(
    _state: AtrashInternalState,
    action: RoomAction,
  ): EngineActionResult<AtrashInternalState> {
    const payload = (action.payload as any) || {};
    const events: Array<{ recipient: 'ALL' | string; event: string; data: unknown }> = [];
    let actionResponse: unknown = { success: true };

    try {
      switch (action.type) {
        case AtrashActionTypes.START_GAME: {
          this.engine.startGame();
          this.scheduleTurnTimer();

          events.push({
            recipient: 'ALL',
            event: AtrashSystemEvents.ROUND_STARTED,
            data: {
              roundNumber: this.engine.internalState.roundNumber,
              categorySlug: this.engine.internalState.categorySlug,
            },
          });
          break;
        }

        case AtrashActionTypes.SUBMIT_QUESTION: {
          this.engine.submitQuestion(action.userId, payload.questionText);
          this.scheduleTurnTimer();

          events.push({
            recipient: 'ALL',
            event: AtrashSystemEvents.QUESTION_SUBMITTED,
            data: {
              turnIndex: this.engine.internalState.currentTurnIndex,
              askerUserId: action.userId,
              questionText: payload.questionText,
            },
          });
          break;
        }

        case AtrashActionTypes.SUBMIT_ANSWER: {
          this.engine.submitAnswer(action.userId, payload.answerText);

          events.push({
            recipient: 'ALL',
            event: AtrashSystemEvents.ANSWER_SUBMITTED,
            data: {
              turnIndex: this.engine.internalState.currentTurnIndex,
              answererUserId: action.userId,
              answerText: payload.answerText,
            },
          });

          if (this.engine.internalState.phase === 'DISCUSSION_PHASE') {
            this.scheduleDiscussionTimer();
            events.push({
              recipient: 'ALL',
              event: AtrashSystemEvents.DISCUSSION_STARTED,
              data: {
                deadline: this.engine.internalState.discussionDeadline,
              },
            });
          } else {
            this.scheduleTurnTimer();
          }
          break;
        }

        case AtrashActionTypes.CAST_VOTE: {
          const { allVoted } = this.engine.castVote(action.userId, payload.targetUserId);

          events.push({
            recipient: 'ALL',
            event: AtrashSystemEvents.VOTE_CAST,
            data: {
              voterUserId: action.userId,
              votedCount: this.engine.internalState.votes.size,
              totalExpected: this.engine.internalState.participants.length,
            },
          });

          if (allVoted) {
            this.handleVotingCompleted(events);
          }
          break;
        }

        case AtrashActionTypes.SUBMIT_LAST_CHANCE: {
          const { isCorrect } = this.engine.submitLastChance(action.userId, payload.selectedWord);
          actionResponse = { isCorrect, selectedWord: payload.selectedWord };

          // Finalize round immediately after Atrash guess
          this.handleRoundFinalization(events);
          break;
        }

        case AtrashActionTypes.ADVANCE_PHASE: {
          if (this.engine.internalState.phase === 'DISCUSSION_PHASE') {
            this.engine.advanceFromDiscussionToVoting();
            this.scheduleVotingTimer();
            events.push({
              recipient: 'ALL',
              event: AtrashSystemEvents.VOTING_STARTED,
              data: {
                deadline: this.engine.internalState.votingDeadline,
                isRevote: this.engine.internalState.isRevote,
              },
            });
          } else if (this.engine.internalState.phase === 'ROUND_RESULT') {
            this.engine.startNewRound();
            this.scheduleTurnTimer();
            events.push({
              recipient: 'ALL',
              event: AtrashSystemEvents.ROUND_STARTED,
              data: {
                roundNumber: this.engine.internalState.roundNumber,
                categorySlug: this.engine.internalState.categorySlug,
              },
            });
          }
          break;
        }
      }
    } catch (err: any) {
      if (err instanceof AtrashEngineError) {
        throw err;
      }
      throw new AtrashEngineError('ACTION_FAILED', err.message ?? 'فشل تنفيذ الإجراء');
    }

    return {
      nextState: this.engine.internalState,
      events,
      actionResponse,
    };
  }

  private handleVotingCompleted(
    events: Array<{ recipient: 'ALL' | string; event: string; data: unknown }>,
  ): void {
    if (this.timerRegistry) {
      this.timerRegistry.cancel(`voting_${this.roomId}`);
    }

    const voteRes = this.engine.resolveVoting();

    events.push({
      recipient: 'ALL',
      event: AtrashSystemEvents.VOTE_REVEAL,
      data: this.engine.internalState.voteRevealData,
    });

    if (voteRes.requiresRevote) {
      // First tie -> Revote phase
      this.scheduleVotingTimer();
      events.push({
        recipient: 'ALL',
        event: AtrashSystemEvents.VOTING_STARTED,
        data: {
          deadline: this.engine.internalState.votingDeadline,
          isRevote: true,
          tiedCandidates: this.engine.internalState.tiedCandidateIds,
        },
      });
    } else if (voteRes.nextPhase === 'ATRASH_LAST_CHANCE') {
      // Pause 5 seconds on reveal before starting last chance
      if (this.timerRegistry) {
        this.timerRegistry.schedule(`reveal_pause_${this.roomId}`, 5000, () => {
          const { options, deadline } = this.engine.startLastChance();
          this.scheduleLastChanceTimer();

          this.broadcast(AtrashSystemEvents.ATRASH_LAST_CHANCE_STARTED, {
            atrashUserId: this.engine.internalState.atrashUserId,
            options,
            deadline,
          });
        });
      }
    } else {
      // Atrash survived or second tie -> Finalize round
      if (this.timerRegistry) {
        this.timerRegistry.schedule(`reveal_pause_${this.roomId}`, 5000, () => {
          this.handleRoundFinalization();
        });
      }
    }
  }

  private handleRoundFinalization(
    events?: Array<{ recipient: 'ALL' | string; event: string; data: unknown }>,
  ): void {
    if (this.timerRegistry) {
      this.timerRegistry.cancel(`last_chance_${this.roomId}`);
    }

    const { roundResult, matchFinished, winnerUserId } = this.engine.finalizeRoundResult();

    const roundEvent = {
      recipient: 'ALL' as const,
      event: AtrashSystemEvents.ROUND_RESULT,
      data: roundResult,
    };

    if (events) {
      events.push(roundEvent);
    } else {
      this.broadcast(roundEvent.event, roundEvent.data);
    }

    if (matchFinished && winnerUserId) {
      const matchEvent = {
        recipient: 'ALL' as const,
        event: AtrashSystemEvents.MATCH_RESULT,
        data: this.getPublicProjection().matchResult,
      };
      if (events) {
        events.push(matchEvent);
      } else {
        this.broadcast(matchEvent.event, matchEvent.data);
      }

      if (this.onMatchCompletedCallback) {
        void this.onMatchCompletedCallback(roundResult);
      }
    } else {
      // Auto advance to next round after 8 seconds pause
      if (this.timerRegistry) {
        this.timerRegistry.schedule(`next_round_${this.roomId}`, 8000, () => {
          if (this.engine.internalState.phase === 'ROUND_RESULT') {
            this.engine.startNewRound();
            this.scheduleTurnTimer();
            this.broadcast(AtrashSystemEvents.ROUND_STARTED, {
              roundNumber: this.engine.internalState.roundNumber,
              categorySlug: this.engine.internalState.categorySlug,
            });
          }
        });
      }
    }
  }

  // ==========================================
  // SERVER-OWNED TIMERS
  // ==========================================

  private scheduleTurnTimer(): void {
    if (!this.timerRegistry) return;
    this.timerRegistry.cancel(`turn_${this.roomId}`);

    this.timerRegistry.schedule(`turn_${this.roomId}`, this.engine.turnTimerMs, () => {
      const res = this.engine.handleTurnTimeout();
      if (res.phaseChanged && this.engine.internalState.phase === 'DISCUSSION_PHASE') {
        this.scheduleDiscussionTimer();
        this.broadcast(AtrashSystemEvents.DISCUSSION_STARTED, {
          deadline: this.engine.internalState.discussionDeadline,
        });
      } else {
        this.scheduleTurnTimer();
      }
    });
  }

  private scheduleDiscussionTimer(): void {
    if (!this.timerRegistry) return;
    this.timerRegistry.cancel(`discussion_${this.roomId}`);

    this.timerRegistry.schedule(`discussion_${this.roomId}`, this.engine.discussionTimerMs, () => {
      if (this.engine.internalState.phase === 'DISCUSSION_PHASE') {
        this.engine.advanceFromDiscussionToVoting();
        this.scheduleVotingTimer();
        this.broadcast(AtrashSystemEvents.VOTING_STARTED, {
          deadline: this.engine.internalState.votingDeadline,
          isRevote: false,
        });
      }
    });
  }

  private scheduleVotingTimer(): void {
    if (!this.timerRegistry) return;
    this.timerRegistry.cancel(`voting_${this.roomId}`);

    this.timerRegistry.schedule(`voting_${this.roomId}`, this.engine.votingTimerMs, () => {
      if (this.engine.internalState.phase === 'VOTING') {
        this.handleVotingCompleted([]);
      }
    });
  }

  private scheduleLastChanceTimer(): void {
    if (!this.timerRegistry) return;
    this.timerRegistry.cancel(`last_chance_${this.roomId}`);

    this.timerRegistry.schedule(`last_chance_${this.roomId}`, this.engine.lastChanceTimerMs, () => {
      if (this.engine.internalState.phase === 'ATRASH_LAST_CHANCE') {
        this.handleRoundFinalization();
      }
    });
  }

  private broadcast(event: string, payload: unknown): void {
    if (!this.realtimeServer) return;
    for (const p of this.engine.internalState.participants) {
      this.realtimeServer.sendToUser(p.userId, event, payload);
    }
  }

  // ==========================================
  // PROJECTION BOUNDARIES (ZERO SECRET LEAKAGE)
  // ==========================================

  getPublicProjection(): AtrashPublicState {
    return this.engine.getPublicProjection();
  }

  getPlayerProjection(_state: AtrashInternalState, userId: string): AtrashPlayerPrivateState {
    return this.engine.getPlayerProjection(userId);
  }
}
