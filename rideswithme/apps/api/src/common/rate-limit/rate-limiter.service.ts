import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { ErrorCode } from '@rideswithme/shared-types';
import { REDIS } from '../../redis/redis.module';
import { AppException } from '../app-exception';

export interface RateLimitRule {
  /** Short name, part of the Redis key, e.g. "otp_phone". */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Fixed-window counter in Redis. Simple and good enough for abuse control on
 * OTP, login and booking endpoints; counters expire with their window.
 */
@Injectable()
export class RateLimiterService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async consume(rule: RateLimitRule, identifier: string): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const windowStart = nowSeconds - (nowSeconds % rule.windowSeconds);
    const key = `rl:${rule.name}:${identifier}:${windowStart}`;
    const result = await this.redis
      .multi()
      .incr(key)
      .expire(key, rule.windowSeconds + 1)
      .exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    if (count > rule.limit) {
      throw new AppException(ErrorCode.RATE_LIMITED, `Rate limit exceeded (${rule.name})`, {
        retryAfterSeconds: windowStart + rule.windowSeconds - nowSeconds,
      });
    }
  }
}
