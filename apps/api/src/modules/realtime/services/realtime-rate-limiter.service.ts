import { Injectable } from '@nestjs/common';
import { RealtimeRateLimiter } from './realtime-rate-limiter';

@Injectable()
export class RealtimeRateLimiterService extends RealtimeRateLimiter {}
