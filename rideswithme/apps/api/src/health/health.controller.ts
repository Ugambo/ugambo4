import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { type Kysely, sql } from 'kysely';
import { Public } from '../auth/principal';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { REDIS } from '../redis/redis.module';

@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /** Process is up. Used by the container orchestrator to restart a hung process. */
  @Get('live')
  live() {
    return { status: 'ok' };
  }

  /** Dependencies reachable. Used by the load balancer to route traffic. */
  @Get('ready')
  async ready() {
    const checks = await Promise.allSettled([sql`select 1`.execute(this.db), this.redis.ping()]);
    const [database, redis] = checks.map((c) => (c.status === 'fulfilled' ? 'ok' : 'down'));
    const body = {
      status: database === 'ok' && redis === 'ok' ? 'ok' : 'degraded',
      database,
      redis,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
