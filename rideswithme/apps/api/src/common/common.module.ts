import { Global, Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { RateLimiterService } from './rate-limit/rate-limiter.service';

@Global()
@Module({
  providers: [RateLimiterService, IdempotencyService],
  exports: [RateLimiterService, IdempotencyService],
})
export class CommonModule {}
