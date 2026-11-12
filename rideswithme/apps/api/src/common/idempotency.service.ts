import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { ErrorCode } from '@rideswithme/shared-types';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { AppException } from './app-exception';

const KEY = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Makes a create request safe to retry. The client sends an Idempotency-Key
 * header (a random id per user action). The first request with a key runs; a
 * retry with the same key and body gets the stored response instead of
 * creating a second ride. A retry while the first is still running gets 409
 * (try again shortly); the same key with a different body is refused.
 * Failed requests are forgotten, so a corrected retry can run.
 */
@Injectable()
export class IdempotencyService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async run<T>(
    userId: string,
    key: string | undefined,
    scope: string,
    body: unknown,
    fn: () => Promise<T>,
  ): Promise<T> {
    if (!key || !KEY.test(key)) {
      throw new AppException(
        ErrorCode.IDEMPOTENCY_KEY_REQUIRED,
        'Send an Idempotency-Key header (8-128 letters, digits, - or _)',
      );
    }
    const requestHash = createHash('sha256')
      .update(`${scope}\n${JSON.stringify(body)}`)
      .digest('hex');
    const inserted = await this.db
      .insertInto('idempotency_keys')
      .values({ user_id: userId, key, scope, request_hash: requestHash })
      .onConflict((oc) => oc.columns(['user_id', 'key']).doNothing())
      .returning('key')
      .executeTakeFirst();

    if (!inserted) {
      const existing = await this.db
        .selectFrom('idempotency_keys')
        .selectAll()
        .where('user_id', '=', userId)
        .where('key', '=', key)
        .executeTakeFirst();
      if (!existing) return this.run(userId, key, scope, body, fn); // forgotten in between: try again
      if (existing.scope !== scope || existing.request_hash !== requestHash) {
        throw new AppException(
          ErrorCode.IDEMPOTENCY_CONFLICT,
          'This Idempotency-Key was used for a different request',
          { status: 422 },
        );
      }
      if (existing.status === 'in_progress') {
        throw new AppException(
          ErrorCode.IDEMPOTENCY_CONFLICT,
          'The first request with this key is still running',
          { retryAfterSeconds: 1 },
        );
      }
      return existing.response_body as T;
    }

    try {
      const result = await fn();
      await this.db
        .updateTable('idempotency_keys')
        .set({ status: 'completed', response_status: 200, response_body: JSON.stringify(result) })
        .where('user_id', '=', userId)
        .where('key', '=', key)
        .execute();
      return result;
    } catch (err) {
      await this.db
        .deleteFrom('idempotency_keys')
        .where('user_id', '=', userId)
        .where('key', '=', key)
        .execute();
      throw err;
    }
  }

  /** Keys are kept for 24 hours. */
  async purgeOld(): Promise<void> {
    await this.db
      .deleteFrom('idempotency_keys')
      .where('created_at', '<', sql<Date>`now() - interval '24 hours'`)
      .execute();
  }
}
