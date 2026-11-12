import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { type Kysely, sql } from 'kysely';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { REDIS } from '../redis/redis.module';

/**
 * Keeps trip_locations' daily partitions ready (2 days back to 7 ahead) and
 * drops days older than TRIP_LOCATION_RETENTION_DAYS. Runs at start-up and
 * every MAINTENANCE_INTERVAL_MINUTES; a Redis lock lets one API copy do it.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onModuleInit() {
    if (this.config.MAINTENANCE_INTERVAL_MINUTES === 0) return;
    void this.runWithLock();
    this.timer = setInterval(
      () => void this.runWithLock(),
      this.config.MAINTENANCE_INTERVAL_MINUTES * 60_000,
    );
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runWithLock() {
    if ((await this.redis.set('lock:maintenance', '1', 'EX', 600, 'NX')) !== 'OK') return;
    try {
      await this.maintainPartitions();
    } catch (err) {
      this.logger.error({ err }, 'Maintenance failed');
    } finally {
      await this.redis.del('lock:maintenance');
    }
  }

  async maintainPartitions(now = new Date()): Promise<{ created: number; dropped: number }> {
    const day = (offsetDays: number) =>
      new Date(now.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
    const created = await sql<{
      n: number;
    }>`SELECT ensure_trip_location_partitions(${day(-2)}::date, ${day(7)}::date) AS n`.execute(
      this.db,
    );
    const dropped = await sql<{
      n: number;
    }>`SELECT drop_trip_location_partitions(${day(-this.config.TRIP_LOCATION_RETENTION_DAYS)}::date) AS n`.execute(
      this.db,
    );
    const result = { created: created.rows[0]?.n ?? 0, dropped: dropped.rows[0]?.n ?? 0 };
    if (result.created || result.dropped)
      this.logger.log(result, 'trip_locations partitions maintained');
    return result;
  }
}
