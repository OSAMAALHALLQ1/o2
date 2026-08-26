export interface SpatialGameClientProps {
  roomId: string;
  sessionToken: string;
  playerRole: string;
  onGameEvent: (event: string, payload: any) => void;
  onLeave: () => void;
}

export interface IGameRuntimeAdapter {
  mountSpatialGame(containerRef: any, props: SpatialGameClientProps): void;
  unmountSpatialGame(): void;
  sendSpatialAction(action: string, payload: any): void;
}
