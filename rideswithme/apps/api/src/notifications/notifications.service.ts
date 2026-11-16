import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type NotificationView } from '@rideswithme/shared-types';
import type { PushTokenInput } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider';
import { PUSH_PROVIDER, type PushProvider } from './push.provider';
import { type NotificationKind, render } from './templates';

export interface NotifyOptions {
  /** Keep it in the person's inbox (default true). */
  inbox?: boolean;
  push?: boolean;
  sms?: boolean;
  /** What the app opens (ids only). */
  data?: Record<string, string>;
}

/**
 * Tells people about things: the in-app inbox, push to their phones, and SMS
 * for what must not be missed. Never throws: a notification failing must not
 * undo what it is about. Call after the change has committed.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(PUSH_PROVIDER) private readonly push: PushProvider,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async notify(
    userId: string,
    kind: NotificationKind,
    values: Record<string, string | number> = {},
    opts: NotifyOptions = {},
  ): Promise<void> {
    try {
      const user = await this.db
        .selectFrom('users')
        .select(['preferred_language', 'phone_e164', 'status'])
        .where('id', '=', userId)
        .executeTakeFirst();
      if (!user || user.status === 'deleted') return;
      const { title, body } = render(kind, user.preferred_language, values);
      const data = opts.data ?? {};
      if (opts.inbox !== false)
        await this.db
          .insertInto('notifications')
          .values({ user_id: userId, kind, title, body, data: JSON.stringify(data) })
          .execute();
      if (opts.push !== false) await this.sendPush(userId, title, body, { ...data, kind });
      if (opts.sms && user.phone_e164)
        await this.sms.send({ to: user.phone_e164, text: `RideswithMe: ${title}. ${body}` });
    } catch (err) {
      this.logger.warn({ err: (err as Error).message, userId, kind }, 'Notification not delivered');
    }
  }

  /** Texts staff phones directly (SOS); never throws. */
  async textPhones(phones: string[], text: string): Promise<void> {
    await Promise.all(
      phones.map((to) =>
        this.sms
          .send({ to, text })
          .catch((err: unknown) =>
            this.logger.error({ err: (err as Error).message, to }, 'Staff SMS failed'),
          ),
      ),
    );
  }

  private async sendPush(
    userId: string,
    title: string,
    body: string,
    data: Record<string, string>,
  ) {
    const tokens = await this.db
      .selectFrom('push_tokens')
      .select('token')
      .where('user_id', '=', userId)
      .execute();
    if (tokens.length === 0) return;
    const { invalidTokens } = await this.push.send({
      tokens: tokens.map((t) => t.token),
      title,
      body,
      data,
    });
    if (invalidTokens.length)
      await this.db.deleteFrom('push_tokens').where('token', 'in', invalidTokens).execute();
  }

  // --- The person's own inbox and devices ---

  async list(userId: string): Promise<{ items: NotificationView[]; unread: number }> {
    const rows = await this.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(50)
      .execute();
    const unread = await this.db
      .selectFrom('notifications')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirstOrThrow();
    return {
      items: rows.map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        data: n.data as Record<string, string>,
        read: n.read_at !== null,
        createdAt: n.created_at.toISOString(),
      })),
      unread: Number(unread.n),
    };
  }

  async markRead(userId: string, ids: string[] | 'all'): Promise<void> {
    let q = this.db
      .updateTable('notifications')
      .set({ read_at: new Date() })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null);
    if (ids !== 'all') {
      if (ids.length === 0) return;
      q = q.where('id', 'in', ids);
    }
    await q.execute();
  }

  async registerToken(userId: string, input: PushTokenInput): Promise<void> {
    // A token moves to whoever signed in on the device last.
    await this.db
      .insertInto('push_tokens')
      .values({ user_id: userId, token: input.token, app: input.app, platform: input.platform })
      .onConflict((oc) =>
        oc.column('token').doUpdateSet({
          user_id: userId,
          app: input.app,
          platform: input.platform,
          last_seen_at: new Date(),
        }),
      )
      .execute();
  }

  async forgetToken(userId: string, token: string): Promise<void> {
    const r = await this.db
      .deleteFrom('push_tokens')
      .where('user_id', '=', userId)
      .where('token', '=', token)
      .executeTakeFirst();
    if (Number(r.numDeletedRows) === 0)
      throw new AppException(ErrorCode.NOT_FOUND, 'Device not registered');
  }
}
