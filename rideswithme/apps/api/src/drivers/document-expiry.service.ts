import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import type Redis from 'ioredis';
import type { Kysely } from 'kysely';
import { AuditService } from '../audit/audit.service';
import { nigeriaToday } from '../common/dates';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { REDIS } from '../redis/redis.module';

/**
 * Marks approved documents past their expiry date as expired, so lists and
 * reports show the right status. Eligibility does not depend on this job: it
 * compares expiry dates live, so a late or missed sweep never lets an expired
 * licence through. Runs on every API replica; a Redis lock lets one do the work.
 */
@Injectable()
export class DocumentExpiryService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(DocumentExpiryService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    const minutes = this.config.DOCUMENT_EXPIRY_SWEEP_MINUTES;
    if (minutes === 0) return;
    this.timer = setInterval(() => void this.runWithLock(), minutes * 60_000);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }

  async runWithLock(): Promise<number> {
    const lock = await this.redis.set('lock:document_expiry', '1', 'EX', 300, 'NX');
    if (lock !== 'OK') return 0;
    try {
      return await this.sweep();
    } catch (err) {
      this.logger.error({ err }, 'Document expiry sweep failed');
      return 0;
    } finally {
      await this.redis.del('lock:document_expiry');
    }
  }

  async sweep(now = new Date()): Promise<number> {
    return this.db.transaction().execute(async (trx) => {
      const expired = await trx
        .updateTable('driver_documents')
        .set({ status: 'expired' })
        .where('status', '=', 'approved')
        .where('expires_on', '<', nigeriaToday(now))
        .returning(['id', 'driver_user_id', 'document_type', 'expires_on'])
        .execute();
      for (const d of expired) {
        await this.audit.record(
          {
            actor: { type: 'system' },
            action: 'driver_document.expired',
            target: { type: 'driver_document', id: d.id },
            metadata: {
              driverUserId: d.driver_user_id,
              documentType: d.document_type,
              expiresOn: d.expires_on,
            },
          },
          trx,
        );
      }
      if (expired.length) this.logger.log(`Marked ${expired.length} driver document(s) expired`);
      return expired.length;
    });
  }
}
