import { Injectable } from '@nestjs/common';
import { RealtimeAuth, RealtimeAuthError } from './realtime-auth';

export { RealtimeAuthError };

@Injectable()
export class RealtimeAuthService extends RealtimeAuth {}
