import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type Language, type VerifyOtpResponse } from '@rideswithme/shared-types';
import { maskPhone, type verifyOtpSchema } from '@rideswithme/validation';
import type { z } from 'zod';
import { AppException } from '../common/app-exception';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { UsersService } from '../users/users.service';
import { OtpService } from './otp.service';
import { SessionService } from './session.service';

type VerifyOtpInput = z.output<typeof verifyOtpSchema>;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly otp: OtpService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {}

  async requestOtp(phone: string, language: Language | undefined, ctx: RequestContext) {
    // Use the account's saved language when there is one. The response is the
    // same either way, so it does not reveal whether the number is registered.
    const existing = await this.db
      .selectFrom('users')
      .select('preferred_language')
      .where('phone_e164', '=', phone)
      .executeTakeFirst();
    return this.otp.request(phone, ctx.ip, language ?? existing?.preferred_language ?? 'en');
  }

  async verifyOtp(
    input: VerifyOtpInput,
    language: Language,
    ctx: RequestContext,
  ): Promise<VerifyOtpResponse> {
    if (input.acceptedPolicyVersion !== this.config.CURRENT_POLICY_VERSION) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Policy version is out of date', {
        details: {
          field: 'acceptedPolicyVersion',
          currentPolicyVersion: this.config.CURRENT_POLICY_VERSION,
        },
      });
    }
    await this.otp.verify(input.phone, input.code, ctx.ip);

    const result = await this.db.transaction().execute(async (trx) => {
      const now = new Date();
      const inserted = await trx
        .insertInto('users')
        .values({ phone_e164: input.phone, phone_verified_at: now, preferred_language: language })
        .onConflict((oc) => oc.column('phone_e164').where('phone_e164', 'is not', null).doNothing())
        .returning('id')
        .executeTakeFirst();
      const isNewUser = inserted !== undefined;

      const user = await trx
        .selectFrom('users')
        .select(['id', 'status', 'phone_verified_at'])
        .where('phone_e164', '=', input.phone)
        .executeTakeFirstOrThrow();
      if (user.status !== 'active') {
        throw new AppException(ErrorCode.ACCOUNT_SUSPENDED, 'Account suspended');
      }

      if (isNewUser) {
        await trx
          .insertInto('user_roles')
          .values((eb) => ({
            user_id: user.id,
            role_id: eb.selectFrom('roles').select('id').where('key', '=', 'passenger'),
          }))
          .execute();
      }

      await trx
        .insertInto('user_consents')
        .values({
          user_id: user.id,
          consent_type: 'terms_and_privacy',
          version: input.acceptedPolicyVersion,
          ip: ctx.ip,
          user_agent: ctx.userAgent,
        })
        .onConflict((oc) => oc.columns(['user_id', 'consent_type', 'version']).doNothing())
        .execute();

      await trx
        .updateTable('users')
        .set({
          last_login_at: now,
          ...(user.phone_verified_at === null && { phone_verified_at: now }),
        })
        .where('id', '=', user.id)
        .execute();

      const tokens = await this.sessions.create(trx, user.id, input.device, ctx);
      const me = await this.users.getMe(user.id, false, trx);
      return { tokens, user: me, isNewUser };
    });

    this.logger.log(
      { userId: result.user.id, phone: maskPhone(input.phone), isNewUser: result.isNewUser },
      'Signed in',
    );
    return result;
  }
}
