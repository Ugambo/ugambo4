import { Global, Module } from '@nestjs/common';
import { RateLimiterService } from './rate-limit/rate-limiter.service';

@Global()
@Module({ providers: [RateLimiterService], exports: [RateLimiterService] })
export class CommonModule {}
