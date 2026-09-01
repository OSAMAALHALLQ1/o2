import { REALTIME_CONSTANTS } from '@o2/types';

interface RateLimitBucket {
  timestamps: number[];
  malformedCount: number;
}

export class RealtimeRateLimiter {
  private readonly buckets = new Map<string, RateLimitBucket>();

  checkPayloadSize(rawPayload: unknown): boolean {
    if (rawPayload === undefined || rawPayload === null) return true;
    try {
      const serialized =
        typeof rawPayload === 'string'
          ? rawPayload
          : JSON.stringify(rawPayload);
      const byteLength = Buffer.byteLength(serialized, 'utf8');
      return byteLength <= REALTIME_CONSTANTS.MAX_PAYLOAD_BYTES;
    } catch {
      return false;
    }
  }

  recordEvent(
    connectionId: string,
    now = Date.now(),
  ): { allowed: boolean; remaining: number } {
    let bucket = this.buckets.get(connectionId);
    if (!bucket) {
      bucket = { timestamps: [], malformedCount: 0 };
      this.buckets.set(connectionId, bucket);
    }

    const windowStart = now - REALTIME_CONSTANTS.RATE_LIMIT_WINDOW_MS;
    bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

    if (bucket.timestamps.length >= REALTIME_CONSTANTS.RATE_LIMIT_MAX_EVENTS) {
      return { allowed: false, remaining: 0 };
    }

    bucket.timestamps.push(now);
    return {
      allowed: true,
      remaining:
        REALTIME_CONSTANTS.RATE_LIMIT_MAX_EVENTS - bucket.timestamps.length,
    };
  }

  recordMalformed(
    connectionId: string,
    _now = Date.now(),
  ): { disconnectRequired: boolean } {
    let bucket = this.buckets.get(connectionId);
    if (!bucket) {
      bucket = { timestamps: [], malformedCount: 0 };
      this.buckets.set(connectionId, bucket);
    }

    bucket.malformedCount += 1;
    return {
      disconnectRequired:
        bucket.malformedCount >= REALTIME_CONSTANTS.RATE_LIMIT_MAX_MALFORMED,
    };
  }

  cleanup(connectionId: string): void {
    this.buckets.delete(connectionId);
  }
}
