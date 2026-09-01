import { Injectable } from '@nestjs/common';
import { RealtimeServerEngine } from './realtime-server';

@Injectable()
export class RealtimeServerService extends RealtimeServerEngine {}
