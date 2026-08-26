export interface GameAction<TPayload = any> {
  actionId: string;
  userId: string;
  type: string;
  payload: TPayload;
  clientActionSeq: number;
  serverTimestamp: number;
}

export interface GameValidationResult {
  isValid: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface IGameEngine<TState, TConfig, TPlayerProjection = any> {
  initializeState(config: TConfig, players: string[]): TState;
  validateAction(state: TState, action: GameAction): GameValidationResult;
  processAction(
    state: TState,
    action: GameAction,
  ): {
    nextState: TState;
    events: Array<{ recipient: 'ALL' | string; event: string; data: any }>;
  };
  projectStateForPlayer(state: TState, userId: string): TPlayerProjection;
  checkWinCondition(state: TState): {
    isFinished: boolean;
    winnerTeamOrPlayer?: string;
    scores?: Record<string, number>;
  };
  onTimerTick(state: TState, deltaMs: number): { nextState: TState; phaseChanged: boolean };
}
