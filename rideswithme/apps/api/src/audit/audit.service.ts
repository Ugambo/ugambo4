import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import type { RequestContext } from '../common/request-context';

export interface AuditEntry {
  actor: { type: 'user'; userId: string } | { type: 'system' };
  /** Dotted verb, e.g. "admin.user.role_assigned". */
  action: string;
  target?: { type: string; id: string };
  metadata?: Record<string, unknown>;
  context?: Partial<RequestContext>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  /** Pass the transaction when the audited change is in one, so both commit or neither. */
  async record(entry: AuditEntry, trx: Kysely<Database> = this.db): Promise<void> {
    await trx
      .insertInto('audit_logs')
      .values({
        actor_type: entry.actor.type,
        actor_user_id: entry.actor.type === 'user' ? entry.actor.userId : null,
        action: entry.action,
        target_type: entry.target?.type ?? null,
        target_id: entry.target?.id ?? null,
        metadata: JSON.stringify(entry.metadata ?? {}),
        ip: entry.context?.ip ?? null,
        user_agent: entry.context?.userAgent ?? null,
        request_id: entry.context?.requestId ?? null,
      })
      .execute();
  }
}
