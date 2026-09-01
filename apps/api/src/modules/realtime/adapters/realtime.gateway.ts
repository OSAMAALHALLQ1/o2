import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { REALTIME_PROTOCOL_VERSION, RealtimeSystemEvents } from '@o2/types';
import { RealtimeAuthError, RealtimeAuthService } from '../services/realtime-auth.service';
import { RealtimeServerService } from '../services/realtime-server.service';
import { SocketIoRealtimeConnection } from './socket-io.adapter';
import { REALTIME_CONSTANTS } from '../realtime.constants';

@Injectable()
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly socketToConnection = new Map<string, string>();
  private readonly authService: RealtimeAuthService;
  private readonly realtimeServer: RealtimeServerService;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  @WebSocketServer()
  server!: Server;

  constructor(
    authService: RealtimeAuthService,
    realtimeServer: RealtimeServerService,
  ) {
    this.authService = authService;
    this.realtimeServer = realtimeServer;
  }

  afterInit(): void {
    this.logger.log('Realtime WebSocket Gateway initialized');
    this.heartbeatTimer = setInterval(() => {
      this.realtimeServer.checkHeartbeats();
    }, REALTIME_CONSTANTS.HEARTBEAT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  async handleConnection(socket: Socket): Promise<void> {
    const rawToken =
      socket.handshake.auth?.token ||
      (socket.handshake.headers?.authorization as string | undefined);

    try {
      const identity = await this.authService.authenticateHandshake(rawToken);

      const connection = new SocketIoRealtimeConnection(socket, identity);
      this.socketToConnection.set(socket.id, identity.connectionId);
      this.realtimeServer.registerConnection(connection);

      // Listen for envelopes emitted via 'message' or 'action'
      socket.on('message', async (data: unknown) => {
        await this.realtimeServer.handleClientMessage(identity.connectionId, data);
      });

      socket.on('action', async (data: unknown) => {
        await this.realtimeServer.handleClientMessage(identity.connectionId, data);
      });

      this.logger.debug(
        `Socket ${socket.id} authenticated as user ${identity.userId} (conn: ${identity.connectionId})`,
      );
    } catch (err) {
      const authError =
        err instanceof RealtimeAuthError
          ? err
          : new RealtimeAuthError('UNAUTHORIZED', 'فشل مصادقة الاتصال في الوقت الحقيقي');

      socket.emit(RealtimeSystemEvents.ERROR, {
        protocolVersion: REALTIME_PROTOCOL_VERSION,
        code: authError.code,
        message: authError.message,
      });

      socket.disconnect(true);
    }
  }

  handleDisconnect(socket: Socket): void {
    const connectionId = this.socketToConnection.get(socket.id);
    if (connectionId) {
      this.realtimeServer.removeConnection(connectionId, 'TRANSPORT_DISCONNECT');
      this.socketToConnection.delete(socket.id);
      this.logger.debug(`Socket ${socket.id} disconnected (conn: ${connectionId})`);
    }
  }
}
