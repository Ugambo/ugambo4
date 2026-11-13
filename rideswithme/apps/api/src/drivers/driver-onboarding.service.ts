import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  type DocumentUploadTicket,
  type DriverDocumentView,
  type DriverOnboardingView,
  ErrorCode,
  MAX_DOCUMENT_UPLOAD_BYTES,
  PHOTO_CONTENT_TYPES,
} from '@rideswithme/shared-types';
import type { z } from 'zod';
import type {
  payoutAccountSchema,
  requestDocumentUploadSchema,
  submitDocumentSchema,
  updateDriverProfileSchema,
  upsertVehicleSchema,
} from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { FieldEncryption } from '../common/crypto/field-encryption';
import { LookupHash } from '../common/crypto/lookup-hash';
import { isExpired } from '../common/dates';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB, isUniqueViolation } from '../database/database.module';
import type { Database } from '../database/types';
import { sniffContentType } from '../storage/content-sniffing';
import { ObjectStorageService } from '../storage/object-storage.service';
import { DriverViewService } from './driver-view.service';

type UpdateProfile = z.output<typeof updateDriverProfileSchema>;
type UpsertVehicle = z.output<ReturnType<typeof upsertVehicleSchema>>;
type PayoutAccount = z.output<typeof payoutAccountSchema>;
type RequestUpload = z.output<typeof requestDocumentUploadSchema>;
type SubmitDocument = z.output<typeof submitDocumentSchema>;

export const ninContext = (userId: string) => `driver_profiles.nin_encrypted:${userId}`;
export const payoutContext = (userId: string) =>
  `driver_profiles.payout_account_number_encrypted:${userId}`;
export const documentNumberContext = (documentId: string) =>
  `driver_documents.document_number_encrypted:${documentId}`;

/** What a driver does to get approved: details, vehicle, payout account, documents, submit. */
@Injectable()
export class DriverOnboardingService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly views: DriverViewService,
    private readonly storage: ObjectStorageService,
    private readonly encryption: FieldEncryption,
    private readonly lookup: LookupHash,
    private readonly audit: AuditService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  /** Starts (or resumes) a driver application and gives the user the driver role. Idempotent. */
  async register(userId: string, ctx: RequestContext): Promise<DriverOnboardingView> {
    await this.db.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('driver_profiles')
        .values({ user_id: userId })
        .onConflict((oc) => oc.column('user_id').doNothing())
        .returning('user_id')
        .executeTakeFirst();
      await trx
        .insertInto('user_roles')
        .values((eb) => ({
          user_id: userId,
          role_id: eb.selectFrom('roles').select('id').where('key', '=', 'driver'),
        }))
        .onConflict((oc) => oc.columns(['user_id', 'role_id']).doNothing())
        .execute();
      if (created) {
        await this.audit.record(
          {
            actor: { type: 'user', userId },
            action: 'driver.registration.started',
            target: { type: 'user', id: userId },
            context: ctx,
          },
          trx,
        );
      }
    });
    return (await this.views.load(userId)).view;
  }

  async getView(userId: string): Promise<DriverOnboardingView> {
    return (await this.views.load(userId)).view;
  }

  async updateProfile(userId: string, input: UpdateProfile): Promise<DriverOnboardingView> {
    await this.db.transaction().execute(async (trx) => {
      await this.lockEditable(trx, userId);
      if (input.fullName !== undefined) {
        await trx
          .updateTable('users')
          .set({ full_name: input.fullName })
          .where('id', '=', userId)
          .execute();
      }
      if (input.nin !== undefined) {
        try {
          await trx
            .updateTable('driver_profiles')
            .set({
              nin_encrypted: this.encryption.encrypt(input.nin, ninContext(userId)),
              nin_lookup_hash: this.lookup.hash('nin', input.nin),
              nin_last4: input.nin.slice(-4),
            })
            .where('user_id', '=', userId)
            .execute();
        } catch (err) {
          if (isUniqueViolation(err))
            throw new AppException(ErrorCode.NIN_ALREADY_REGISTERED, 'NIN already registered');
          throw err;
        }
      }
    });
    return this.getView(userId);
  }

  async upsertVehicle(userId: string, input: UpsertVehicle): Promise<DriverOnboardingView> {
    await this.db.transaction().execute(async (trx) => {
      await this.lockEditable(trx, userId);
      const category = await trx
        .selectFrom('vehicle_categories')
        .select(['id', 'is_enabled'])
        .where('key', '=', input.categoryKey)
        .executeTakeFirst();
      if (!category?.is_enabled) {
        throw new AppException(
          ErrorCode.VEHICLE_CATEGORY_UNAVAILABLE,
          'Vehicle category not available',
          {
            details: { categoryKey: input.categoryKey },
          },
        );
      }
      const values = {
        vehicle_category_id: category.id,
        plate_number: input.plateNumber,
        make: input.make,
        model: input.model,
        colour: input.colour,
        year: input.year,
      };
      try {
        const existing = await trx
          .selectFrom('vehicles')
          .select('id')
          .where('driver_user_id', '=', userId)
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (existing)
          await trx.updateTable('vehicles').set(values).where('id', '=', existing.id).execute();
        else
          await trx
            .insertInto('vehicles')
            .values({ ...values, driver_user_id: userId })
            .execute();
      } catch (err) {
        if (isUniqueViolation(err, 'vehicles_active_plate_key')) {
          throw new AppException(
            ErrorCode.PLATE_ALREADY_REGISTERED,
            'Plate number already registered',
          );
        }
        throw err;
      }
    });
    return this.getView(userId);
  }

  async setPayoutAccount(userId: string, input: PayoutAccount): Promise<DriverOnboardingView> {
    await this.db.transaction().execute(async (trx) => {
      await this.lockEditable(trx, userId);
      const before = await trx
        .selectFrom('driver_profiles')
        .select('payout_account_last4')
        .where('user_id', '=', userId)
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('driver_profiles')
        .set({
          // Replacing an account pauses payouts for a while (account takeover protection).
          ...(before.payout_account_last4 && { payout_account_changed_at: new Date() }),
          payout_recipient_code: null,
          payout_bank_code: input.bankCode,
          payout_account_number_encrypted: this.encryption.encrypt(
            input.accountNumber,
            payoutContext(userId),
          ),
          payout_account_last4: input.accountNumber.slice(-4),
          payout_account_name: input.accountName,
        })
        .where('user_id', '=', userId)
        .execute();
    });
    return this.getView(userId);
  }

  /** Authorises one upload and returns a signed URL for it. */
  async requestUpload(userId: string, input: RequestUpload): Promise<DocumentUploadTicket> {
    await this.rateLimiter.consume({ name: 'doc_upload', limit: 40, windowSeconds: 3600 }, userId);
    const state = await this.views.load(userId);
    if (state.view.status === 'suspended')
      throw new AppException(ErrorCode.INVALID_STATE, 'Driver is suspended');

    const requirement = state.view.requirements.find((r) => r.key === input.documentType);
    if (!requirement) {
      // Vehicle documents need a vehicle first, so the right category rules apply.
      if (!state.view.vehicle) {
        throw new AppException(
          ErrorCode.DRIVER_INCOMPLETE,
          'Add your vehicle before its documents',
          {
            details: { gaps: [{ code: 'VEHICLE' }] },
          },
        );
      }
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'This document is not needed for your vehicle',
        {
          details: { field: 'documentType' },
        },
      );
    }
    if (requirement.media === 'photo' && !PHOTO_CONTENT_TYPES.includes(input.contentType)) {
      throw new AppException(
        ErrorCode.VALIDATION_FAILED,
        'This document must be a photo (JPEG or PNG)',
        {
          details: { field: 'contentType' },
        },
      );
    }

    const objectKey = `driver-documents/${userId}/${input.documentType}/${randomUUID()}`;
    const expiresAt = new Date(Date.now() + this.config.UPLOAD_URL_TTL_SECONDS * 1000);
    const signed = await this.storage.presignUpload(objectKey, input.contentType, input.sizeBytes);
    const upload = await this.db
      .insertInto('file_uploads')
      .values({
        owner_user_id: userId,
        purpose: 'driver_document',
        object_key: objectKey,
        content_type: input.contentType,
        declared_size: input.sizeBytes,
        metadata: JSON.stringify({
          documentType: input.documentType,
          vehicleId: requirement.scope === 'vehicle' ? state.view.vehicle?.id : null,
        }),
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

  /** Attaches an uploaded file as a document, after checking the file really is what was declared. */
  async submitDocument(
    userId: string,
    input: SubmitDocument,
    ctx: RequestContext,
  ): Promise<DriverDocumentView> {
    const upload = await this.db
      .selectFrom('file_uploads')
      .selectAll()
      .where('id', '=', input.uploadId)
      .where('owner_user_id', '=', userId)
      .where('purpose', '=', 'driver_document')
      .executeTakeFirst();
    if (!upload) throw uploadInvalid('not_found');
    if (upload.status !== 'pending') throw uploadInvalid('already_used');
    // Allow a little extra time after the URL expires for the upload to finish.
    if (upload.expires_at.getTime() + 15 * 60_000 < Date.now()) throw uploadInvalid('expired');

    const meta = upload.metadata as { documentType: string; vehicleId: string | null };
    const docType = await this.db
      .selectFrom('document_types')
      .selectAll()
      .where('key', '=', meta.documentType)
      .executeTakeFirstOrThrow();

    if (docType.requires_number && !input.documentNumber) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Document number is required', {
        details: { field: 'documentNumber' },
      });
    }
    if (docType.requires_expiry && !input.expiresOn) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'Expiry date is required', {
        details: { field: 'expiresOn' },
      });
    }
    if (input.expiresOn && isExpired(input.expiresOn)) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, 'This document has already expired', {
        details: { field: 'expiresOn' },
      });
    }

    const info = await this.storage.head(upload.object_key);
    if (!info) throw uploadInvalid('not_found');
    if (info.sizeBytes > MAX_DOCUMENT_UPLOAD_BYTES) throw uploadInvalid('too_large');
    if (info.sizeBytes !== upload.declared_size) throw uploadInvalid('size_mismatch');
    const sniffed = sniffContentType(await this.storage.readHead(upload.object_key));
    if (sniffed !== upload.content_type) throw uploadInvalid('wrong_type');

    const documentId = randomUUID();
    const row = await this.db.transaction().execute(async (trx) => {
      const profile = await trx
        .selectFrom('driver_profiles')
        .select('status')
        .where('user_id', '=', userId)
        .forUpdate()
        .executeTakeFirst();
      if (!profile)
        throw new AppException(ErrorCode.DRIVER_NOT_REGISTERED, 'Driver registration not started');
      if (profile.status === 'suspended')
        throw new AppException(ErrorCode.INVALID_STATE, 'Driver is suspended');

      if (meta.vehicleId) {
        const vehicle = await trx
          .selectFrom('vehicles')
          .select('id')
          .where('id', '=', meta.vehicleId)
          .where('driver_user_id', '=', userId)
          .where('status', '=', 'active')
          .executeTakeFirst();
        if (!vehicle)
          throw new AppException(
            ErrorCode.INVALID_STATE,
            'Vehicle changed since the upload started',
          );
      }

      // Claim the upload; a second concurrent submit of the same upload matches no row.
      const claimed = await trx
        .updateTable('file_uploads')
        .set({ status: 'completed', completed_at: new Date() })
        .where('id', '=', upload.id)
        .where('status', '=', 'pending')
        .executeTakeFirst();
      if (claimed.numUpdatedRows === 0n) throw uploadInvalid('already_used');

      const inserted = await trx
        .insertInto('driver_documents')
        .values({
          id: documentId,
          driver_user_id: userId,
          vehicle_id: meta.vehicleId,
          document_type: docType.key,
          file_upload_id: upload.id,
          object_key: upload.object_key,
          content_type: upload.content_type,
          size_bytes: info.sizeBytes,
          document_number_encrypted: input.documentNumber
            ? this.encryption.encrypt(input.documentNumber, documentNumberContext(documentId))
            : null,
          document_number_last4: input.documentNumber
            ? input.documentNumber.replace(/[^A-Z0-9]/g, '').slice(-4)
            : null,
          expires_on: input.expiresOn ?? null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.audit.record(
        {
          actor: { type: 'user', userId },
          action: 'driver.document.uploaded',
          target: { type: 'driver_document', id: documentId },
          metadata: { documentType: docType.key },
          context: ctx,
        },
        trx,
      );
      return inserted;
    });
    return this.views.documentView(row);
  }

  /** Sends the application for review once nothing is missing. */
  async submitForReview(userId: string, ctx: RequestContext): Promise<DriverOnboardingView> {
    await this.db.transaction().execute(async (trx) => {
      await this.lockEditable(trx, userId);
      const { view } = await this.views.load(userId, trx);
      if (!view.submission.ready) {
        throw new AppException(ErrorCode.DRIVER_INCOMPLETE, 'Application is incomplete', {
          details: { gaps: view.submission.gaps },
        });
      }
      await trx
        .updateTable('driver_profiles')
        .set({ status: 'pending_review', submitted_at: new Date(), rejection_reason: null })
        .where('user_id', '=', userId)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId },
          action: 'driver.application.submitted',
          target: { type: 'user', id: userId },
          context: ctx,
        },
        trx,
      );
    });
    return this.getView(userId);
  }

  /** Locks the profile row and checks the application can still be edited. */
  private async lockEditable(trx: Kysely<Database>, userId: string) {
    const profile = await trx
      .selectFrom('driver_profiles')
      .select('status')
      .where('user_id', '=', userId)
      .forUpdate()
      .executeTakeFirst();
    if (!profile)
      throw new AppException(ErrorCode.DRIVER_NOT_REGISTERED, 'Driver registration not started');
    if (profile.status !== 'onboarding' && profile.status !== 'rejected') {
      throw new AppException(
        ErrorCode.DRIVER_PROFILE_LOCKED,
        'Application can no longer be edited',
        {
          details: { status: profile.status },
        },
      );
    }
  }
}

function uploadInvalid(
  reason: 'not_found' | 'already_used' | 'expired' | 'too_large' | 'size_mismatch' | 'wrong_type',
) {
  return new AppException(ErrorCode.UPLOAD_INVALID, `Upload cannot be used (${reason})`, {
    details: { reason },
  });
}
