import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  type AdminPassengerVerificationDetail,
  type AdminPassengerVerificationItem,
  ErrorCode,
  type KycUploadTicket,
  MAX_DOCUMENT_UPLOAD_BYTES,
  type PassengerVerificationView,
} from '@rideswithme/shared-types';
import type {
  RequestKycUploadInput,
  SubmitKycInput,
  submitKycSchema,
} from '@rideswithme/validation';
import type { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { LookupHash } from '../common/crypto/lookup-hash';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import type { Database } from '../database/types';
import { NotificationsService } from '../notifications/notifications.service';
import { sniffContentType } from '../storage/content-sniffing';
import { ObjectStorageService } from '../storage/object-storage.service';

export const passengerNinContext = (userId: string) =>
  `passenger_verifications.nin_encrypted:${userId}`;

type Submit = z.output<typeof submitKycSchema>;

/**
 * Passenger details and identity checks (DECISIONS D-083). A passenger gives
 * their name, gender, date of birth and an emergency contact (PATCH /v1/me),
 * then their NIN with a photo of an ID and a selfie; staff approve or reject.
 * While PASSENGER_KYC_REQUIRED is on, rides and bus bookings wait for approval.
 */
@Injectable()
export class KycService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly storage: ObjectStorageService,
    private readonly encryption: FieldEncryption,
    private readonly lookup: LookupHash,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async view(userId: string): Promise<PassengerVerificationView> {
    const user = await this.db
      .selectFrom('users')
      .select([
        'full_name',
        'gender',
        'date_of_birth',
        'emergency_contact_name',
        'emergency_contact_phone',
      ])
      .where('id', '=', userId)
      .executeTakeFirstOrThrow();
    const v = await this.db
      .selectFrom('passenger_verifications')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    const missingDetails = [
      ...(user.full_name ? [] : ['fullName']),
      ...(user.gender ? [] : ['gender']),
      ...(user.date_of_birth ? [] : ['dateOfBirth']),
      ...(user.emergency_contact_name && user.emergency_contact_phone ? [] : ['emergencyContact']),
    ];
    const required = this.config.PASSENGER_KYC_REQUIRED;
    const status = v?.status ?? 'not_started';
    return {
      required,
      canBook: !required || (status === 'approved' && missingDetails.length === 0),
      missingDetails,
      status,
      idType: v?.id_type ?? null,
      ninLast4: v?.nin_last4 ?? null,
      submittedAt: v?.submitted_at.toISOString() ?? null,
      reviewedAt: v?.reviewed_at?.toISOString() ?? null,
      rejectionReason: v?.status === 'rejected' ? v.rejection_reason : null,
    };
  }

  /** Refuses a booking until the passenger is verified (when the setting is on). */
  async assertCanBook(userId: string): Promise<void> {
    if (!this.config.PASSENGER_KYC_REQUIRED) return;
    const v = await this.view(userId);
    if (v.canBook) return;
    throw new AppException(
      ErrorCode.KYC_REQUIRED,
      v.status === 'pending'
        ? 'Your identity check is being reviewed; you can book once it is approved'
        : 'Complete your details and identity check before your first ride',
      { details: { status: v.status, missingDetails: v.missingDetails } },
    );
  }

  /** A signed upload address for the ID photo or the selfie. */
  async requestUpload(userId: string, input: RequestKycUploadInput): Promise<KycUploadTicket> {
    await this.rateLimiter.consume({ name: 'kyc_upload', limit: 20, windowSeconds: 3600 }, userId);
    const current = await this.db
      .selectFrom('passenger_verifications')
      .select('status')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (current?.status === 'approved')
      throw new AppException(ErrorCode.INVALID_STATE, 'Your identity is already verified');
    const objectKey = `passenger-kyc/${userId}/${input.kind}/${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.config.UPLOAD_URL_TTL_SECONDS * 1000);
    const signed = await this.storage.presignUpload(objectKey, input.contentType, input.sizeBytes);
    const upload = await this.db
      .insertInto('file_uploads')
      .values({
        owner_user_id: userId,
        purpose: 'passenger_kyc',
        object_key: objectKey,
        content_type: input.contentType,
        declared_size: input.sizeBytes,
        metadata: JSON.stringify({ kind: input.kind }),
        expires_at: expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return {
      uploadId: upload.id,
      uploadUrl: signed.url,
      method: 'PUT',
      headers: signed.headers,
      expiresAt: expiresAt.toISOString(),
    };
  }

  /** Sends the NIN and the two photos for review (again, after a rejection). */
  async submit(
    userId: string,
    input: SubmitKycInput | Submit,
    ctx: Partial<RequestContext>,
  ): Promise<PassengerVerificationView> {
    const before = await this.view(userId);
    if (before.status === 'approved')
      throw new AppException(ErrorCode.INVALID_STATE, 'Your identity is already verified');
    if (before.status === 'pending')
      throw new AppException(ErrorCode.INVALID_STATE, 'Your identity check is already with us');
    if (before.missingDetails.length)
      throw new AppException(ErrorCode.KYC_REQUIRED, 'Complete your details first', {
        details: { missingDetails: before.missingDetails },
      });

    const idFile = await this.checkedUpload(userId, input.idUploadId, 'id');
    const selfie = await this.checkedUpload(userId, input.selfieUploadId, 'selfie');
    const nin = input.nin;
    try {
      await this.db.transaction().execute(async (trx) => {
        const row = {
          status: 'pending' as const,
          id_type: input.idType,
          nin_encrypted: this.encryption.encrypt(nin, passengerNinContext(userId)),
          nin_lookup_hash: this.lookup.hash('nin', nin),
          nin_last4: nin.slice(-4),
          id_object_key: idFile.object_key,
          id_content_type: idFile.content_type,
          selfie_object_key: selfie.object_key,
          selfie_content_type: selfie.content_type,
          submitted_at: new Date(),
          reviewed_at: null,
          reviewed_by: null,
          rejection_reason: null,
        };
        await trx
          .insertInto('passenger_verifications')
          .values({ user_id: userId, ...row })
          .onConflict((oc) => oc.column('user_id').doUpdateSet(row))
          .execute();
        await trx
          .updateTable('file_uploads')
          .set({ status: 'completed', completed_at: new Date() })
          .where('id', 'in', [idFile.id, selfie.id])
          .execute();
        await this.audit.record(
          {
            actor: { type: 'user', userId },
            action: 'passenger.kyc.submitted',
            target: { type: 'user', id: userId },
            metadata: { idType: input.idType },
            context: ctx,
          },
          trx,
        );
      });
    } catch (err) {
      if (isUniqueViolation(err))
        throw new AppException(
          ErrorCode.NIN_ALREADY_REGISTERED,
          'This NIN is already used by another account',
        );
      throw err;
    }
    return this.view(userId);
  }

  // --- Staff ---

  async list(
    status: 'pending' | 'approved' | 'rejected',
  ): Promise<AdminPassengerVerificationItem[]> {
    const rows = await this.db
      .selectFrom('passenger_verifications as v')
      .innerJoin('users as u', 'u.id', 'v.user_id')
      .select([
        'v.user_id',
        'u.full_name',
        'u.phone_e164',
        'v.status',
        'v.id_type',
        'v.nin_last4',
        'v.submitted_at',
        'v.reviewed_at',
      ])
      .where('v.status', '=', status)
      .orderBy('v.submitted_at', status === 'pending' ? 'asc' : 'desc')
      .limit(200)
      .execute();
    return rows.map((r) => ({
      userId: r.user_id,
      name: r.full_name,
      phone: r.phone_e164,
      status: r.status,
      idType: r.id_type,
      ninLast4: r.nin_last4,
      submittedAt: r.submitted_at.toISOString(),
      reviewedAt: r.reviewed_at?.toISOString() ?? null,
    }));
  }

  async detail(userId: string): Promise<AdminPassengerVerificationDetail> {
    const r = await this.db
      .selectFrom('passenger_verifications as v')
      .innerJoin('users as u', 'u.id', 'v.user_id')
      .leftJoin('users as staff', 'staff.id', 'v.reviewed_by')
      .select([
        'v.user_id',
        'u.full_name',
        'u.phone_e164',
        'u.email',
        'u.gender',
        'u.date_of_birth',
        'u.emergency_contact_name',
        'u.emergency_contact_phone',
        'v.status',
        'v.id_type',
        'v.nin_last4',
        'v.submitted_at',
        'v.reviewed_at',
        'v.reviewed_by',
        'v.rejection_reason',
        'staff.full_name as staff_name',
      ])
      .where('v.user_id', '=', userId)
      .executeTakeFirst();
    if (!r) throw new AppException(ErrorCode.NOT_FOUND, 'No identity check for this passenger');
    return {
      userId: r.user_id,
      name: r.full_name,
      phone: r.phone_e164,
      email: r.email,
      gender: r.gender,
      dateOfBirth: r.date_of_birth,
      emergencyContact:
        r.emergency_contact_name && r.emergency_contact_phone
          ? { name: r.emergency_contact_name, phone: r.emergency_contact_phone }
          : null,
      status: r.status,
      idType: r.id_type,
      ninLast4: r.nin_last4,
      submittedAt: r.submitted_at.toISOString(),
      reviewedAt: r.reviewed_at?.toISOString() ?? null,
      reviewedBy: r.reviewed_by ? { id: r.reviewed_by, name: r.staff_name } : null,
      rejectionReason: r.rejection_reason,
    };
  }

  /** A link to see the ID photo or selfie for a minute; each view is audited. */
  async viewUrl(
    userId: string,
    which: 'id' | 'selfie',
    staff: { userId: string },
    ctx: Partial<RequestContext>,
  ): Promise<{ url: string; expiresAt: string }> {
    const v = await this.db
      .selectFrom('passenger_verifications')
      .select(['id_object_key', 'id_content_type', 'selfie_object_key', 'selfie_content_type'])
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'No identity check for this passenger');
    const [key, type] =
      which === 'id'
        ? [v.id_object_key, v.id_content_type]
        : [v.selfie_object_key, v.selfie_content_type];
    const url = await this.storage.presignView(key, type);
    await this.audit.record({
      actor: { type: 'user', userId: staff.userId },
      action: 'admin.passenger_kyc.photo_viewed',
      target: { type: 'user', id: userId },
      metadata: { which },
      context: ctx,
    });
    return {
      url,
      expiresAt: new Date(Date.now() + this.config.DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  async approve(userId: string, staff: { userId: string }, ctx: Partial<RequestContext>) {
    await this.decide(userId, 'approved', null, staff, ctx);
    await this.notifications.notify(userId, 'kyc_approved', {}, { sms: true });
    return this.detail(userId);
  }

  async reject(
    userId: string,
    reason: string,
    staff: { userId: string },
    ctx: Partial<RequestContext>,
  ) {
    await this.decide(userId, 'rejected', reason, staff, ctx);
    await this.notifications.notify(userId, 'kyc_rejected', { reason }, { sms: true });
    return this.detail(userId);
  }

  private async decide(
    userId: string,
    status: 'approved' | 'rejected',
    reason: string | null,
    staff: { userId: string },
    ctx: Partial<RequestContext>,
  ) {
    await this.db.transaction().execute(async (trx) => {
      const v = await trx
        .selectFrom('passenger_verifications')
        .select('status')
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!v) throw new AppException(ErrorCode.NOT_FOUND, 'No identity check for this passenger');
      if (v.status !== 'pending')
        throw new AppException(ErrorCode.INVALID_STATE, `Already ${v.status}`);
      if (staff.userId === userId)
        throw new AppException(ErrorCode.FORBIDDEN, 'You cannot review your own identity check');
      await trx
        .updateTable('passenger_verifications')
        .set({
          status,
          rejection_reason: reason,
          reviewed_at: new Date(),
          reviewed_by: staff.userId,
        })
        .where('user_id', '=', userId)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: staff.userId },
          action: `admin.passenger_kyc.${status}`,
          target: { type: 'user', id: userId },
          metadata: reason ? { reason } : {},
          context: ctx,
        },
        trx,
      );
    });
  }

  /** The upload must be this passenger's, unused, of the right kind, and really the photo declared. */
  private async checkedUpload(userId: string, uploadId: string, kind: 'id' | 'selfie') {
    const invalid = (reason: string) =>
      new AppException(ErrorCode.UPLOAD_INVALID, 'Upload the photo again', {
        details: { reason, kind },
      });
    const upload = await this.db
      .selectFrom('file_uploads')
      .selectAll()
      .where('id', '=', uploadId)
      .where('owner_user_id', '=', userId)
      .where('purpose', '=', 'passenger_kyc')
      .executeTakeFirst();
    if (!upload) throw invalid('not_found');
    if (upload.status !== 'pending') throw invalid('already_used');
    if ((upload.metadata as { kind?: string }).kind !== kind) throw invalid('wrong_kind');
    if (upload.expires_at.getTime() + 15 * 60_000 < Date.now()) throw invalid('expired');
    const info = await this.storage.head(upload.object_key);
    if (!info) throw invalid('not_uploaded');
    if (info.sizeBytes > MAX_DOCUMENT_UPLOAD_BYTES) throw invalid('too_large');
    if (info.sizeBytes !== upload.declared_size) throw invalid('size_mismatch');
    const sniffed = sniffContentType(await this.storage.readHead(upload.object_key));
    if (sniffed !== upload.content_type) throw invalid('wrong_type');
    return upload;
  }
}
