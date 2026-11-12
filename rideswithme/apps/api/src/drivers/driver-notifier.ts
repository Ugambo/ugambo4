import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { maskPhone } from '@rideswithme/validation';
import { type MessageKey, translate } from '@rideswithme/utilities';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { SMS_PROVIDER, type SmsProvider } from '../sms/sms.provider';

/**
 * Tells drivers about decisions by SMS in their language. Best effort: a failed
 * SMS is logged and never undoes the decision (the app shows the same status).
 * Push notifications join this in a later phase.
 */
@Injectable()
export class DriverNotifier {
  private readonly logger = new Logger(DriverNotifier.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {}

  async notify(userId: string, key: Extract<MessageKey, `sms.driver_${string}`>): Promise<void> {
    const user = await this.db
      .selectFrom('users')
      .select(['phone_e164', 'preferred_language'])
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user?.phone_e164) return;
    try {
      await this.sms.send({ to: user.phone_e164, text: translate(user.preferred_language, key) });
    } catch (err) {
      this.logger.warn(
        { err, phone: maskPhone(user.phone_e164), key },
        'Driver notification SMS failed',
      );
    }
  }
}
