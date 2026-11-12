import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  type DocumentRequirement,
  type DocumentType,
  type DocumentTypeInfo,
  type DriverDocumentView,
  type DriverOnboardingView,
  type DriverVehicleView,
  ErrorCode,
  type OnlineBlocker,
  type SubmissionGap,
  type VehicleCategorySummary,
} from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import { isExpired } from '../common/dates';
import { DB } from '../database/database.module';
import type { Database, DriverDocumentsTable } from '../database/types';
import type { Selectable } from 'kysely';

type DocumentRow = Selectable<DriverDocumentsTable>;

export interface DriverState {
  view: DriverOnboardingView;
  accountStatus: 'active' | 'suspended' | 'deleted';
  phone: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  documents: DocumentRow[];
}

/**
 * Builds the driver's onboarding picture: what is filled in, which documents
 * are required for their vehicle category and where each stands, whether they
 * can submit, and whether they may go online. Shared by the driver app and the
 * admin review screen so both always agree.
 */
@Injectable()
export class DriverViewService {
  constructor(@Inject(DB) private readonly db: Kysely<Database>) {}

  async listCategories(): Promise<VehicleCategorySummary[]> {
    const rows = await this.db
      .selectFrom('vehicle_categories as c')
      .leftJoin('vehicle_category_document_requirements as r', 'r.vehicle_category_id', 'c.id')
      .leftJoin('document_types as d', 'd.key', 'r.document_type')
      .select(['c.key', 'c.name', 'c.description', 'c.seats', 'd.key as documentType'])
      .where('c.is_enabled', '=', true)
      .orderBy('c.sort_order')
      .orderBy('d.sort_order')
      .execute();
    const byKey = new Map<string, VehicleCategorySummary>();
    for (const r of rows) {
      const c = byKey.get(r.key) ?? {
        key: r.key,
        name: r.name,
        description: r.description,
        seats: r.seats,
        requiredDocuments: [],
      };
      if (r.documentType) c.requiredDocuments.push(r.documentType as DocumentType);
      byKey.set(r.key, c);
    }
    return [...byKey.values()];
  }

  async load(
    userId: string,
    trx: Kysely<Database> = this.db,
    now = new Date(),
  ): Promise<DriverState> {
    const profile = await trx
      .selectFrom('driver_profiles as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .select([
        'p.user_id',
        'p.status',
        'p.nin_last4',
        'p.payout_bank_code',
        'p.payout_account_last4',
        'p.payout_account_name',
        'p.submitted_at',
        'p.approved_at',
        'p.rejection_reason',
        'p.reviewed_by',
        'p.reviewed_at',
        'u.full_name',
        'u.status as account_status',
        'u.phone_e164',
      ])
      .where('p.user_id', '=', userId)
      .executeTakeFirst();
    if (!profile)
      throw new AppException(ErrorCode.DRIVER_NOT_REGISTERED, 'Driver registration not started');

    const vehicleRow = await trx
      .selectFrom('vehicles as v')
      .innerJoin('vehicle_categories as c', 'c.id', 'v.vehicle_category_id')
      .select([
        'v.id',
        'v.plate_number',
        'v.make',
        'v.model',
        'v.colour',
        'v.year',
        'v.vehicle_category_id',
        'c.key as category_key',
        'c.name as category_name',
        'c.is_enabled as category_enabled',
      ])
      .where('v.driver_user_id', '=', userId)
      .where('v.status', '=', 'active')
      .executeTakeFirst();

    const requiredTypes = await this.requiredDocumentTypes(
      trx,
      vehicleRow?.vehicle_category_id ?? null,
    );
    const documents = await trx
      .selectFrom('driver_documents')
      .selectAll()
      .where('driver_user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .execute();

    // Vehicle documents count only if they were uploaded for the current vehicle.
    const relevant = new Map(
      requiredTypes.map((t) => [
        t.key,
        documents.filter(
          (d) =>
            d.document_type === t.key && (t.scope === 'driver' || d.vehicle_id === vehicleRow?.id),
        ),
      ]),
    );
    const requirements = requiredTypes.map((t) =>
      this.requirement(t, relevant.get(t.key) ?? [], now),
    );

    const vehicle: DriverVehicleView | null = vehicleRow
      ? {
          id: vehicleRow.id,
          category: { key: vehicleRow.category_key, name: vehicleRow.category_name },
          plateNumber: vehicleRow.plate_number,
          make: vehicleRow.make,
          model: vehicleRow.model,
          colour: vehicleRow.colour,
          year: vehicleRow.year,
        }
      : null;

    const gaps: SubmissionGap[] = [];
    if (!profile.full_name) gaps.push({ code: 'FULL_NAME' });
    if (!profile.nin_last4) gaps.push({ code: 'NIN' });
    if (!profile.payout_account_last4) gaps.push({ code: 'PAYOUT_ACCOUNT' });
    if (!vehicle) gaps.push({ code: 'VEHICLE' });
    for (const r of requirements) {
      if (!r.hasValidApproval && r.status !== 'pending')
        gaps.push({ code: 'DOCUMENT', documentType: r.key });
    }

    const blockers: OnlineBlocker[] = [];
    if (profile.account_status !== 'active') blockers.push({ code: 'ACCOUNT_NOT_ACTIVE' });
    if (profile.status !== 'approved') blockers.push({ code: 'DRIVER_NOT_APPROVED' });
    if (!vehicleRow) blockers.push({ code: 'NO_ACTIVE_VEHICLE' });
    else if (!vehicleRow.category_enabled) blockers.push({ code: 'VEHICLE_CATEGORY_DISABLED' });
    for (const r of requirements) {
      if (r.hasValidApproval) continue;
      const lapsed = (relevant.get(r.key) ?? []).some(
        (d) => d.status === 'expired' || (d.status === 'approved' && isExpired(d.expires_on, now)),
      );
      blockers.push({
        code: lapsed ? 'DOCUMENT_EXPIRED' : 'DOCUMENT_NOT_APPROVED',
        documentType: r.key,
      });
    }

    return {
      view: {
        userId,
        status: profile.status,
        rejectionReason: profile.status === 'rejected' ? profile.rejection_reason : null,
        submittedAt: profile.submitted_at?.toISOString() ?? null,
        approvedAt: profile.approved_at?.toISOString() ?? null,
        profile: { fullName: profile.full_name, ninLast4: profile.nin_last4 },
        payoutAccount:
          profile.payout_bank_code && profile.payout_account_name && profile.payout_account_last4
            ? {
                bankCode: profile.payout_bank_code,
                accountName: profile.payout_account_name,
                accountNumberLast4: profile.payout_account_last4,
              }
            : null,
        vehicle,
        requirements,
        editable: profile.status === 'onboarding' || profile.status === 'rejected',
        submission: { ready: gaps.length === 0, gaps },
        eligibility: { canGoOnline: blockers.length === 0, blockers },
      },
      accountStatus: profile.account_status,
      phone: profile.phone_e164,
      reviewedBy: profile.reviewed_by,
      reviewedAt: profile.reviewed_at?.toISOString() ?? null,
      documents,
    };
  }

  documentView(d: DocumentRow, now = new Date()): DriverDocumentView {
    return {
      id: d.id,
      documentType: d.document_type as DocumentType,
      status: d.status === 'approved' && isExpired(d.expires_on, now) ? 'expired' : d.status,
      contentType: d.content_type,
      sizeBytes: d.size_bytes,
      numberLast4: d.document_number_last4,
      expiresOn: d.expires_on,
      rejectionReason: d.rejection_reason,
      createdAt: d.created_at.toISOString(),
      reviewedAt: d.reviewed_at?.toISOString() ?? null,
    };
  }

  /** Document types required for the category; with no vehicle yet, the person-level ones. */
  async requiredDocumentTypes(
    trx: Kysely<Database>,
    categoryId: string | null,
  ): Promise<DocumentTypeInfo[]> {
    let q = trx
      .selectFrom('document_types as d')
      .select(['d.key', 'd.name', 'd.scope', 'd.media', 'd.requires_expiry', 'd.requires_number'])
      .orderBy('d.sort_order');
    if (categoryId) {
      q = q.where(({ exists, selectFrom }) =>
        exists(
          selectFrom('vehicle_category_document_requirements as r')
            .select('r.document_type')
            .whereRef('r.document_type', '=', 'd.key')
            .where('r.vehicle_category_id', '=', categoryId),
        ),
      );
    } else {
      q = q
        .where('d.scope', '=', 'driver')
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom('vehicle_category_document_requirements as r')
              .innerJoin('vehicle_categories as c', 'c.id', 'r.vehicle_category_id')
              .select('r.document_type')
              .whereRef('r.document_type', '=', 'd.key')
              .where('c.is_enabled', '=', true),
          ),
        );
    }
    const rows = await q.execute();
    return rows.map((r) => ({
      key: r.key as DocumentType,
      name: r.name,
      scope: r.scope,
      media: r.media,
      requiresExpiry: r.requires_expiry,
      requiresNumber: r.requires_number,
    }));
  }

  private requirement(type: DocumentTypeInfo, docs: DocumentRow[], now: Date): DocumentRequirement {
    const latest = docs[0] ? this.documentView(docs[0], now) : null;
    const hasValidApproval = docs.some(
      (d) => d.status === 'approved' && !isExpired(d.expires_on, now),
    );
    return { ...type, status: latest?.status ?? 'missing', latest, hasValidApproval };
  }
}
