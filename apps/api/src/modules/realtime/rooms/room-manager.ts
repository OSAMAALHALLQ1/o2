import { randomUUID } from 'node:crypto';
import {
  type PlayerRoomProjection,
  type PublicRoomProjection,
  type RoomAction,
  type RoomGameMode,
  type RoomParticipant,
  type RoomState,
  RECOVERY_CONSTANTS,
  ROOM_CAPACITIES,
  ROOM_GAME_MODES,
  ROOM_LIMITS,
  RoomErrorCodes,
  RoomSystemEvents,
} from '@o2/types';
import type { RealtimeServer } from '../transport/realtime-server.interface';

// ============================================================================
// 1. ROOM STATE MACHINE
// ============================================================================

export class InvalidRoomStateTransitionError extends Error {
  readonly from: RoomState;
  readonly to: RoomState;

  constructor(from: RoomState, to: RoomState) {
    super(`Invalid room state transition from ${from} to ${to}`);
    this.name = 'InvalidRoomStateTransitionError';
    this.from = from;
    this.to = to;
  }
}

const VALID_ROOM_TRANSITIONS: Record<RoomState, readonly RoomState[]> = {
  CREATING: ['WAITING', 'CLOSED'],
  WAITING: ['READY', 'CLOSED'],
  READY: ['RUNNING', 'WAITING', 'CLOSED'],
  RUNNING: ['ENDING', 'CLOSED'],
  ENDING: ['ENDED', 'CLOSED'],
  ENDED: ['CLOSED'],
  CLOSED: [], // terminal state
};

export function isValidRoomTransition(from: RoomState, to: RoomState): boolean {
  if (from === to) return true;
  return VALID_ROOM_TRANSITIONS[from].includes(to);
}

export function assertValidRoomTransition(from: RoomState, to: RoomState): void {
  if (!isValidRoomTransition(from, to)) {
    throw new InvalidRoomStateTransitionError(from, to);
  }
}

// ============================================================================
// 2. PER-ROOM SEQUENTIAL EXECUTOR
// ============================================================================

export type RoomTask<T = unknown> = () => Promise<T> | T;

export class RoomSequentialExecutor {
  readonly roomId: string;
  private queue: Promise<void> = Promise.resolve();
  private pendingCount = 0;
  private isDisposed = false;

  constructor(roomId: string) {
    this.roomId = roomId;
  }

  get queueLength(): number {
    return this.pendingCount;
  }

  execute<T>(task: RoomTask<T>): Promise<T> {
    if (this.isDisposed) {
      return Promise.reject(new Error(`Room executor for ${this.roomId} is disposed`));
    }

    this.pendingCount += 1;

    return new Promise<T>((resolve, reject) => {
      this.queue = this.queue
        .then(async () => {
          try {
            const result = await task();
            resolve(result);
          } catch (err) {
            reject(err);
          } finally {
            this.pendingCount = Math.max(0, this.pendingCount - 1);
          }
        })
        .catch(() => {
          this.pendingCount = Math.max(0, this.pendingCount - 1);
        });
    });
  }

  dispose(): void {
    this.isDisposed = true;
  }
}

// ============================================================================
// 3. ROOM ACTION IDEMPOTENCY
// ============================================================================

interface IdempotencyRecord<T = unknown> {
  actionId: string;
  result: T;
  timestamp: number;
}

export class RoomActionIdempotency {
  readonly roomId: string;
  private readonly records = new Map<string, IdempotencyRecord>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(
    roomId: string,
    ttlMs: number = ROOM_LIMITS.ACTION_DEDUP_TTL_MS,
    maxEntries: number = ROOM_LIMITS.ACTION_DEDUP_MAX_ENTRIES,
  ) {
    this.roomId = roomId;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
  }

  has(actionId: string, now = Date.now()): boolean {
    const record = this.records.get(actionId);
    if (!record) return false;
    if (now - record.timestamp > this.ttlMs) {
      this.records.delete(actionId);
      return false;
    }
    return true;
  }

  get<T = unknown>(actionId: string, now = Date.now()): T | undefined {
    const record = this.records.get(actionId);
    if (!record) return undefined;
    if (now - record.timestamp > this.ttlMs) {
      this.records.delete(actionId);
      return undefined;
    }
    return record.result as T;
  }

  set<T = unknown>(actionId: string, result: T, now = Date.now()): void {
    if (this.records.size >= this.maxEntries) {
      const oldestKey = this.records.keys().next().value;
      if (oldestKey) this.records.delete(oldestKey);
    }
    this.records.set(actionId, {
      actionId,
      result,
      timestamp: now,
    });
  }

  cleanup(now = Date.now()): number {
    let evicted = 0;
    for (const [key, record] of this.records.entries()) {
      if (now - record.timestamp > this.ttlMs) {
        this.records.delete(key);
        evicted += 1;
      }
    }
    return evicted;
  }

  clear(): void {
    this.records.clear();
  }
}

// ============================================================================
// 4. SERVER-OWNED ROOM TIMERS
// ============================================================================

export type RoomTimerCallback = () => Promise<void> | void;

interface ActiveTimer {
  timerId: string;
  timeoutHandle: NodeJS.Timeout;
  expiresAt: number;
}

export class RoomTimerRegistry {
  readonly roomId: string;
  private readonly executor: RoomSequentialExecutor;
  private readonly timers = new Map<string, ActiveTimer>();
  private isDisposed = false;

  constructor(roomId: string, executor: RoomSequentialExecutor) {
    this.roomId = roomId;
    this.executor = executor;
  }

  schedule(
    timerId: string,
    delayMs: number,
    callback: RoomTimerCallback,
  ): void {
    if (this.isDisposed) return;

    this.cancel(timerId);

    const expiresAt = Date.now() + delayMs;
    const timeoutHandle = setTimeout(async () => {
      this.timers.delete(timerId);
      if (this.isDisposed) return;

      try {
        await this.executor.execute(async () => {
          if (!this.isDisposed) {
            await callback();
          }
        });
      } catch {
        // Safe catch for timer failures
      }
    }, delayMs);

    this.timers.set(timerId, {
      timerId,
      timeoutHandle,
      expiresAt,
    });
  }

  cancel(timerId: string): boolean {
    const timer = this.timers.get(timerId);
    if (!timer) return false;

    clearTimeout(timer.timeoutHandle);
    this.timers.delete(timerId);
    return true;
  }

  has(timerId: string): boolean {
    return this.timers.has(timerId);
  }

  clear(): void {
    for (const timer of this.timers.values()) {
      clearTimeout(timer.timeoutHandle);
    }
    this.timers.clear();
  }

  dispose(): void {
    this.isDisposed = true;
    this.clear();
  }
}

// ============================================================================
// 5. GAME ENGINE ADAPTER INTERFACE & GENERIC ENGINE
// ============================================================================

export interface EngineActionResult<TState = unknown> {
  nextState: TState;
  events?: Array<{ recipient: 'ALL' | string; event: string; data: unknown }>;
  actionResponse?: unknown;
}

export interface IRoomEngineAdapter<TState = unknown, TPlayerProj = unknown> {
  readonly gameMode: RoomGameMode;
  createInitialState(config?: unknown): TState;
  validateAction(state: TState, action: RoomAction): { isValid: boolean; errorMessage?: string };
  applyAction(state: TState, action: RoomAction): EngineActionResult<TState>;
  getPublicProjection(state: TState): unknown;
  getPlayerProjection(state: TState, userId: string): TPlayerProj;
}

export interface GenericRoomState {
  gameMode: RoomGameMode;
  metadata: Record<string, unknown>;
  readyPlayerIds: string[];
}

export class GenericRoomEngine implements IRoomEngineAdapter<GenericRoomState, { readyCount: number }> {
  readonly gameMode: RoomGameMode;

  constructor(gameMode: RoomGameMode) {
    this.gameMode = gameMode;
  }

  createInitialState(config?: Record<string, unknown>): GenericRoomState {
    return {
      gameMode: this.gameMode,
      metadata: { ...config },
      readyPlayerIds: [],
    };
  }

  validateAction(state: GenericRoomState, action: RoomAction): { isValid: boolean; errorMessage?: string } {
    if (!action.type || typeof action.type !== 'string') {
      return { isValid: false, errorMessage: 'Action type is required' };
    }
    return { isValid: true };
  }

  applyAction(state: GenericRoomState, action: RoomAction): EngineActionResult<GenericRoomState> {
    if (action.type === 'SET_READY') {
      const isReady = Boolean((action.payload as any)?.isReady);
      const current = new Set(state.readyPlayerIds);
      if (isReady) {
        current.add(action.userId);
      } else {
        current.delete(action.userId);
      }
      const nextState: GenericRoomState = {
        ...state,
        readyPlayerIds: Array.from(current),
      };
      return {
        nextState,
        actionResponse: { userId: action.userId, isReady },
      };
    }

    if (action.type === 'SET_METADATA') {
      const patch = (action.payload as any)?.metadata || {};
      const nextState: GenericRoomState = {
        ...state,
        metadata: { ...state.metadata, ...patch },
      };
      return {
        nextState,
        actionResponse: { metadata: nextState.metadata },
      };
    }

    return {
      nextState: state,
      actionResponse: { processed: true },
    };
  }

  getPublicProjection(state: GenericRoomState): unknown {
    return {
      gameMode: state.gameMode,
      readyCount: state.readyPlayerIds.length,
      metadata: state.metadata,
    };
  }

  getPlayerProjection(state: GenericRoomState, userId: string): { readyCount: number; isSelfReady: boolean } {
    return {
      readyCount: state.readyPlayerIds.length,
      isSelfReady: state.readyPlayerIds.includes(userId),
    };
  }
}

// ============================================================================
// 6. IN-MEMORY ROOM ENTITY
// ============================================================================

export class RoomError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'RoomError';
    this.code = code;
  }
}

export class Room {
  readonly roomId: string;
  readonly gameMode: RoomGameMode;
  readonly capacity: number;
  readonly creatorUserId: string;
  readonly createdAt: number;
  readonly executor: RoomSequentialExecutor;
  readonly idempotency: RoomActionIdempotency;
  readonly timers: RoomTimerRegistry;
  readonly engineAdapter: IRoomEngineAdapter;

  private _state: RoomState = 'CREATING';
  private _version = 1;
  private _updatedAt: number;
  private readonly _participants = new Map<string, RoomParticipant>();
  private _engineState: unknown;

  constructor(
    roomId: string,
    gameMode: RoomGameMode,
    creatorUserId: string,
    engineAdapter?: IRoomEngineAdapter,
    customCapacity?: number,
  ) {
    this.roomId = roomId;
    this.gameMode = gameMode;
    this.capacity = customCapacity ?? ROOM_CAPACITIES[gameMode];
    this.creatorUserId = creatorUserId;
    this.createdAt = Date.now();
    this._updatedAt = Date.now();

    this.executor = new RoomSequentialExecutor(roomId);
    this.idempotency = new RoomActionIdempotency(roomId);
    this.timers = new RoomTimerRegistry(roomId, this.executor);

    this.engineAdapter = engineAdapter ?? new GenericRoomEngine(gameMode);
    this._engineState = this.engineAdapter.createInitialState();
  }

  get state(): RoomState {
    return this._state;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): number {
    return this._updatedAt;
  }

  get participantCount(): number {
    return this._participants.size;
  }

  get participants(): RoomParticipant[] {
    return Array.from(this._participants.values());
  }

  hasParticipant(userId: string): boolean {
    return this._participants.has(userId);
  }

  getParticipant(userId: string): RoomParticipant | undefined {
    return this._participants.get(userId);
  }

  setState(nextState: RoomState): void {
    assertValidRoomTransition(this._state, nextState);
    this._state = nextState;
    this._version += 1;
    this._updatedAt = Date.now();
  }

  addParticipant(participant: RoomParticipant): void {
    if (this._state === 'CLOSED') {
      throw new RoomError(RoomErrorCodes.ROOM_CLOSED, 'الغرفة مغلقة');
    }

    if (this._participants.has(participant.userId)) {
      throw new RoomError(RoomErrorCodes.ROOM_ALREADY_JOINED, 'اللاعب منضم بالفعل إلى هذه الغرفة');
    }

    if (this._participants.size >= this.capacity) {
      throw new RoomError(RoomErrorCodes.ROOM_FULL, 'اكتمل العدد الأقصى للاعبين في الغرفة');
    }

    this._participants.set(participant.userId, participant);
    this._version += 1;
    this._updatedAt = Date.now();

    // If room is WAITING and reaches capacity, transition to READY
    if (this._state === 'WAITING' && this._participants.size >= this.capacity) {
      this.setState('READY');
    }
  }

  removeParticipant(userId: string): RoomParticipant {
    const participant = this._participants.get(userId);
    if (!participant) {
      throw new RoomError(RoomErrorCodes.NOT_ROOM_MEMBER, 'المستخدم ليس عضواً في هذه الغرفة');
    }

    this._participants.delete(userId);
    this._version += 1;
    this._updatedAt = Date.now();

    // If room was READY and falls below capacity, transition back to WAITING
    if (this._state === 'READY' && this._participants.size < this.capacity) {
      this.setState('WAITING');
    }

    return participant;
  }

  executeAction(action: RoomAction): unknown {
    if (this._state === 'CLOSED') {
      throw new RoomError(RoomErrorCodes.ROOM_CLOSED, 'الغرفة مغلقة');
    }

    if (!this._participants.has(action.userId)) {
      throw new RoomError(RoomErrorCodes.NOT_ROOM_MEMBER, 'غير مسموح للاعبين من خارج الغرفة بتنفيذ إجراءات');
    }

    if (this.idempotency.has(action.actionId)) {
      return this.idempotency.get(action.actionId);
    }

    const validation = this.engineAdapter.validateAction(this._engineState, action);
    if (!validation.isValid) {
      throw new RoomError(
        RoomErrorCodes.INVALID_ROOM_ACTION,
        validation.errorMessage ?? 'إجراء غير صالح',
      );
    }

    const { nextState, actionResponse } = this.engineAdapter.applyAction(
      this._engineState,
      action,
    );

    this._engineState = nextState;
    this._version += 1;
    this._updatedAt = Date.now();

    const responseWithMeta = {
      actionId: action.actionId,
      ...(typeof actionResponse === 'object' && actionResponse !== null ? actionResponse : { result: actionResponse }),
    };

    this.idempotency.set(action.actionId, responseWithMeta);

    return responseWithMeta;
  }

  dispatchAction(action: RoomAction): Promise<unknown> {
    return this.executor.execute(() => this.executeAction(action));
  }

  getPublicProjection(): PublicRoomProjection {
    return {
      roomId: this.roomId,
      gameMode: this.gameMode,
      state: this._state,
      capacity: this.capacity,
      participantCount: this._participants.size,
      participants: Array.from(this._participants.values()).map((p) => ({
        userId: p.userId,
        username: p.username,
        displayName: p.displayName,
        isReady: p.isReady,
        joinedAt: p.joinedAt,
        status: p.status ?? 'CONNECTED',
      })),
      version: this._version,
      createdAt: this.createdAt,
      updatedAt: this._updatedAt,
    };
  }

  handleParticipantDisconnect(userId: string): void {
    const participant = this._participants.get(userId);
    if (!participant) return;

    participant.status = 'DISCONNECTED_GRACE';
    this._version += 1;
    this._updatedAt = Date.now();

    // Schedule 60-second grace cancellation timer
    this.timers.schedule(
      `grace_${userId}`,
      RECOVERY_CONSTANTS.ROOM_DISCONNECT_GRACE_MS,
      () => {
        const current = this._participants.get(userId);
        if (current && current.status === 'DISCONNECTED_GRACE') {
          if (this._state === 'WAITING' || this._state === 'READY') {
            this.removeParticipant(userId);
          }
        }
      },
    );
  }

  recoverParticipant(userId: string): PlayerRoomProjection {
    const participant = this._participants.get(userId);
    if (!participant) {
      throw new RoomError(RoomErrorCodes.NOT_ROOM_MEMBER, 'المستخدم ليس عضواً في الغرفة');
    }

    // Cancel pending grace timer
    this.timers.cancel(`grace_${userId}`);

    participant.status = 'CONNECTED';
    this._version += 1;
    this._updatedAt = Date.now();

    return this.getPlayerProjection(userId);
  }

  getPlayerProjection(userId: string): PlayerRoomProjection {
    const publicProj = this.getPublicProjection();
    const self = this._participants.get(userId);

    if (!self) {
      throw new RoomError(RoomErrorCodes.NOT_ROOM_MEMBER, 'المستخدم ليس عضواً في الغرفة');
    }

    const playerData = this.engineAdapter.getPlayerProjection(
      this._engineState,
      userId,
    );

    return {
      ...publicProj,
      self,
      playerData,
    };
  }

  close(_reason?: string): void {
    if (this._state !== 'CLOSED') {
      try {
        this.setState('CLOSED');
      } catch {
        this._state = 'CLOSED';
      }
    }
    this.timers.dispose();
    this.executor.dispose();
  }
}

// ============================================================================
// 7. ROOM MANAGER & REGISTRY
// ============================================================================

export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly userToRoomId = new Map<string, string>();
  private readonly realtimeServer: RealtimeServer;

  constructor(realtimeServer: RealtimeServer) {
    this.realtimeServer = realtimeServer;
  }

  get roomCount(): number {
    return this.rooms.size;
  }

  getAllRooms(): Room[] {
    return Array.from(this.rooms.values());
  }

  getRoom(roomId: string): Room | undefined {
    const room = this.rooms.get(roomId);
    if (!room || room.state === 'CLOSED') return undefined;
    return room;
  }

  getUserRoom(userId: string): Room | undefined {
    const roomId = this.userToRoomId.get(userId);
    if (!roomId) return undefined;
    return this.getRoom(roomId);
  }

  handleParticipantDisconnect(userId: string): void {
    const room = this.getUserRoom(userId);
    if (!room) return;

    room.handleParticipantDisconnect(userId);

    this.broadcastToRoom(
      room.roomId,
      RoomSystemEvents.STATE_SYNC,
      {
        actionType: 'PARTICIPANT_DISCONNECTED',
        actorUserId: userId,
        version: room.version,
        publicProjection: room.getPublicProjection(),
      },
    );
  }

  async recoverRoom(userId: string): Promise<PlayerRoomProjection> {
    const room = this.getUserRoom(userId);
    if (!room || room.state === 'CLOSED') {
      throw new RoomError(
        RoomErrorCodes.ROOM_UNAVAILABLE,
        'الغرفة غير متاحة أو تم إعادة تعيينها',
      );
    }

    return room.executor.execute(async () => {
      const projection = room.recoverParticipant(userId);

      this.broadcastToRoom(
        room.roomId,
        RoomSystemEvents.STATE_SYNC,
        {
          actionType: 'PARTICIPANT_RECOVERED',
          actorUserId: userId,
          version: room.version,
          publicProjection: room.getPublicProjection(),
        },
      );

      return projection;
    });
  }

  async createRoom(
    creator: { userId: string; username: string; displayName?: string },
    gameMode: RoomGameMode,
    customCapacity?: number,
  ): Promise<PublicRoomProjection> {
    if (!creator || !creator.userId) {
      throw new RoomError(RoomErrorCodes.NOT_AUTHORIZED, 'يجب تسجيل الدخول لإنشاء غرفة');
    }

    if (!ROOM_GAME_MODES[gameMode]) {
      throw new RoomError(
        RoomErrorCodes.INVALID_GAME_MODE,
        `نمط اللعبة غير مدعوم: ${gameMode}`,
      );
    }

    const roomId = `room_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const room = new Room(
      roomId,
      gameMode,
      creator.userId,
      undefined,
      customCapacity,
    );

    // Initial transition CREATING -> WAITING
    room.setState('WAITING');

    // Add creator as first participant
    const creatorParticipant: RoomParticipant = {
      userId: creator.userId,
      username: creator.username,
      displayName: creator.displayName,
      joinedAt: Date.now(),
      isReady: true,
      role: 'HOST',
    };

    room.addParticipant(creatorParticipant);

    this.rooms.set(roomId, room);
    this.userToRoomId.set(creator.userId, roomId);

    const projection = room.getPublicProjection();
    return projection;
  }

  async joinRoom(
    roomId: string,
    user: { userId: string; username: string; displayName?: string },
  ): Promise<PlayerRoomProjection> {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new RoomError(RoomErrorCodes.ROOM_NOT_FOUND, 'الغرفة غير موجودة أو مغلقة');
    }

    return room.executor.execute(async () => {
      const participant: RoomParticipant = {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        joinedAt: Date.now(),
        isReady: false,
      };

      room.addParticipant(participant);
      this.userToRoomId.set(user.userId, roomId);

      // Broadcast updated public projection to all room participants
      this.broadcastToRoom(
        roomId,
        RoomSystemEvents.PLAYER_JOINED,
        {
          joinedUser: {
            userId: user.userId,
            username: user.username,
            displayName: user.displayName,
          },
          roomProjection: room.getPublicProjection(),
        },
      );

      return room.getPlayerProjection(user.userId);
    });
  }

  async leaveRoom(
    roomId: string,
    userId: string,
  ): Promise<{ left: boolean; roomClosed: boolean }> {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new RoomError(RoomErrorCodes.ROOM_NOT_FOUND, 'الغرفة غير موجودة');
    }

    return room.executor.execute(async () => {
      const removed = room.removeParticipant(userId);
      this.userToRoomId.delete(userId);

      let roomClosed = false;

      // If room has no more participants, close it immediately
      if (room.participantCount === 0) {
        this.closeRoom(roomId, 'ALL_PARTICIPANTS_LEFT');
        roomClosed = true;
      } else {
        this.broadcastToRoom(
          roomId,
          RoomSystemEvents.PLAYER_LEFT,
          {
            leftUser: {
              userId: removed.userId,
              username: removed.username,
            },
            roomProjection: room.getPublicProjection(),
          },
        );
      }

      return { left: true, roomClosed };
    });
  }

  async dispatchAction(
    roomId: string,
    action: RoomAction,
  ): Promise<unknown> {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new RoomError(RoomErrorCodes.ROOM_NOT_FOUND, 'الغرفة غير موجودة');
    }

    return room.executor.execute(async () => {
      const result = room.executeAction(action);

      // Broadcast state synchronization to all participants
      this.broadcastToRoom(
        roomId,
        RoomSystemEvents.STATE_SYNC,
        {
          actionType: action.type,
          actorUserId: action.userId,
          version: room.version,
          publicProjection: room.getPublicProjection(),
        },
      );

      return result;
    });
  }

  broadcastToRoom<T>(
    roomId: string,
    event: string,
    payload: T,
  ): void {
    if (!this.realtimeServer) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    for (const participant of room.participants) {
      this.realtimeServer.sendToUser(participant.userId, event, payload);
    }
  }

  sendToParticipant<T>(
    roomId: string,
    userId: string,
    event: string,
    payload: T,
  ): void {
    if (!this.realtimeServer) return;
    const room = this.rooms.get(roomId);
    if (!room || !room.hasParticipant(userId)) return;

    this.realtimeServer.sendToUser(userId, event, payload);
  }

  closeRoom(roomId: string, reason = 'HOST_CLOSED'): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    this.broadcastToRoom(roomId, RoomSystemEvents.ROOM_CLOSED, {
      roomId,
      reason,
      closedAt: Date.now(),
    });

    for (const participant of room.participants) {
      this.userToRoomId.delete(participant.userId);
    }

    room.close(reason);
  }

  sweepStaleRooms(now = Date.now()): { closedCount: number } {
    let closedCount = 0;
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.state === 'CLOSED') {
        this.rooms.delete(roomId);
        closedCount += 1;
        continue;
      }

      if (
        (room.state === 'CREATING' || room.state === 'WAITING') &&
        now - room.updatedAt > ROOM_LIMITS.IDLE_ROOM_TIMEOUT_MS
      ) {
        this.closeRoom(roomId, 'IDLE_TIMEOUT');
        closedCount += 1;
      }
    }
    return { closedCount };
  }
}
