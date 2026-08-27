import { Injectable } from '@nestjs/common';

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptimeSeconds: number;
  environment: string;
  service: string;
  version: string;
}

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  getHealth(): HealthCheckResult {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      environment: process.env.NODE_ENV || 'development',
      service: 'o2-api',
      version: '0.1.0',
    };
  }
}
