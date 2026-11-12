import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type MeResponse } from '@rideswithme/shared-types';
import type { UpdateMeInput } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import { DB, isUniqueViolation } from '../database/database.module';
import type { Database } from '../database/types';
import { AccessService } from './access.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly access: AccessService,
  ) {}

  async getMe(
    userId: string,
    mfaVerifiedForSession: boolean,
    trx: Kysely<Database> = this.db,
  ): Promise<MeResponse> {
    const user = await trx
      .selectFrom('users')
      .selectAll()
      .where('id', '=', userId)
      .executeTakeFirst();
    if (!user || !user.phone_e164) throw new AppException(ErrorCode.NOT_FOUND, 'User not found');
    const access = await this.access.load(userId, trx);
    return {
      id: user.id,
      phone: user.phone_e164,
      email: user.email,
      emailVerified: user.email_verified_at !== null,
      fullName: user.full_name,
      preferredLanguage: user.preferred_language,
      status: user.status,
      roles: access.roles,
      permissions: [...access.permissions].sort(),
      mfa: {
        required: access.mfaRequired,
        enrolled: user.totp_enabled_at !== null,
        verifiedForSession: mfaVerifiedForSession,
      },
      createdAt: user.created_at.toISOString(),
    };
  }

  async updateMe(userId: string, input: UpdateMeInput, mfaVerified: boolean): Promise<MeResponse> {
    const current = await this.db
      .selectFrom('users')
      .select('email')
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    const emailChanged = input.email !== undefined && input.email !== current.email;
    try {
      await this.db
        .updateTable('users')
        .set({
          ...(input.fullName !== undefined && { full_name: input.fullName }),
          ...(input.preferredLanguage !== undefined && {
            preferred_language: input.preferredLanguage,
          }),
          // A new email address starts unverified (verification arrives with email sending).
          ...(emailChanged && { email: input.email ?? null, email_verified_at: null }),
        })
        .where('id', '=', userId)
        .execute();
    } catch (err) {
      if (isUniqueViolation(err, 'users_email_key')) {
        throw new AppException(ErrorCode.CONFLICT, 'Email is already in use', {
          details: { field: 'email' },
        });
      }
      throw err;
    }
    return this.getMe(userId, mfaVerified);
  }
}
