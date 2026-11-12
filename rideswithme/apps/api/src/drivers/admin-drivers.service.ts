import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import {
  type AdminDriverDetail,
  type AdminDriverListItem,
  type DocumentViewUrl,
  type DriverDocumentView,
  ErrorCode,
  type Paginated,
} from '@rideswithme/shared-types';
import { type ListDriversQuery, normalizeNigerianPhone } from '@rideswithme/validation';
import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app-exception';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { isExpired } from '../common/dates';
import type { RequestContext } from '../common/request-context';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { ObjectStorageService } from '../storage/object-storage.service';
import { DriverNotifier } from './driver-notifier';
import { DriverViewService } from './driver-view.service';

export interface Reviewer {
  userId: string;
  context: Partial<RequestContext>;
}

/** The admin verification queue and review decisions. */
@Injectable()
export class AdminDriversService {
  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly views: DriverViewService,
    private readonly storage: ObjectStorageService,
    private readonly audit: AuditService,
    private readonly notifier: DriverNotifier,
  ) {}

  /**
   * "review" queue: applications awaiting a decision and approved drivers with
   * new documents (renewals), oldest first so nobody waits longest by accident.
   * "all": every driver, newest first.
   */
  async list(q: ListDriversQuery): Promise<Paginated<AdminDriverListItem>> {
    const base = this.db
      .selectFrom('driver_profiles as p')
      .innerJoin('users as u', 'u.id', 'p.user_id')
      .leftJoin('vehicles as v', (j) =>
        j.onRef('v.driver_user_id', '=', 'p.user_id').on('v.status', '=', 'active'),
      )
      .leftJoin('vehicle_categories as c', 'c.id', 'v.vehicle_category_id')
      .select((eb) => [
        'p.user_id',
        'p.status',
        'p.submitted_at',
        'p.created_at',
        'u.full_name',
        'u.phone_e164',
        'c.key as category_key',
        'v.plate_number',
        eb
          .selectFrom('driver_documents as d')
          .select(eb.fn.countAll<string>().as('n'))
          .whereRef('d.driver_user_id', '=', 'p.user_id')
          .where('d.status', '=', 'pending')
          .as('pending_documents'),
        // Waiting on a reviewer: a submitted application (since submission), or an
        // approved driver's renewal (since the oldest pending upload). Applications
        // being filled in or sent back are waiting on the driver, not on us.
        sql<Date | null>`case
          when p.status = 'pending_review' then p.submitted_at
          when p.status = 'approved' then (select min(d.created_at) from driver_documents d
                                           where d.driver_user_id = p.user_id and d.status = 'pending')
        end`.as('waiting_since'),
      ]);

    let query = this.db
      .selectFrom(base.as('x'))
      .selectAll()
      .select(sql<string>`waiting_since::text`.as('ws_text'))
      .select(sql<string>`created_at::text`.as('created_text'));

    if (q.status) query = query.where('x.status', '=', q.status);
    if (q.search) {
      const phone = normalizeNigerianPhone(q.search);
      const like = `%${q.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      const plate = q.search.toUpperCase().replace(/[\s-]/g, '');
      query = query.where((eb) =>
        eb.or([
          ...(phone ? [eb('x.phone_e164', '=', phone)] : []),
          eb('x.full_name', 'ilike', like),
          ...(plate ? [eb('x.plate_number', '=', plate)] : []),
        ]),
      );
    }
    const cursor = decodeCursor(q.cursor);
    if (q.queue === 'review') {
      query = query
        .where('x.waiting_since', 'is not', null)
        .orderBy('x.waiting_since', 'asc')
        .orderBy('x.user_id', 'asc');
      if (cursor)
        query = query.where(
          sql<boolean>`(x.waiting_since, x.user_id) > (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
        );
    } else {
      query = query.orderBy('x.created_at', 'desc').orderBy('x.user_id', 'desc');
      if (cursor)
        query = query.where(
          sql<boolean>`(x.created_at, x.user_id) < (${cursor.ts}::timestamptz, ${cursor.id}::uuid)`,
        );
    }

    const rows = await query.limit(q.limit + 1).execute();
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        userId: r.user_id,
        fullName: r.full_name,
        phone: r.phone_e164,
        status: r.status,
        vehicleCategory: r.category_key,
        plateNumber: r.plate_number,
        pendingDocuments: Number(r.pending_documents ?? 0),
        waitingSince: r.waiting_since ? new Date(r.waiting_since).toISOString() : null,
        submittedAt: r.submitted_at?.toISOString() ?? null,
      })),
      nextCursor:
        rows.length > q.limit && last
          ? encodeCursor({
              ts: q.queue === 'review' ? last.ws_text : last.created_text,
              id: last.user_id,
            })
          : null,
    };
  }

  async detail(driverUserId: string): Promise<AdminDriverDetail> {
    const state = await this.views.load(driverUserId);
    return {
      ...state.view,
      phone: state.phone,
      accountStatus: state.accountStatus,
      documentHistory: state.documents.map((d) => this.views.documentView(d)),
      reviewedBy: state.reviewedBy,
      reviewedAt: state.reviewedAt,
    };
  }

  /** A 60-second link to one document. Every view is written to the audit log. */
  async documentUrl(
    reviewer: Reviewer,
    driverUserId: string,
    documentId: string,
  ): Promise<DocumentViewUrl> {
    const doc = await this.findDocument(this.db, driverUserId, documentId);
    const url = await this.storage.presignView(doc.object_key, doc.content_type);
    await this.audit.record({
      actor: { type: 'user', userId: reviewer.userId },
      action: 'admin.driver_document.viewed',
      target: { type: 'driver_document', id: doc.id },
      metadata: { driverUserId, documentType: doc.document_type },
      context: reviewer.context,
    });
    return {
      url,
      contentType: doc.content_type,
      expiresAt: new Date(Date.now() + this.config.DOWNLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    };
  }

  async approveDocument(
    reviewer: Reviewer,
    driverUserId: string,
    documentId: string,
    expiresOn?: string,
  ): Promise<DriverDocumentView> {
    assertNotSelf(reviewer, driverUserId);
    const row = await this.db.transaction().execute(async (trx) => {
      const doc = await this.findDocument(trx, driverUserId, documentId, true);
      if (doc.status !== 'pending') {
        throw new AppException(ErrorCode.INVALID_STATE, 'Only pending documents can be approved', {
          details: { status: doc.status },
        });
      }
      const type = await trx
        .selectFrom('document_types')
        .select('requires_expiry')
        .where('key', '=', doc.document_type)
        .executeTakeFirstOrThrow();
      const finalExpiry = expiresOn ?? doc.expires_on;
      if (type.requires_expiry && !finalExpiry) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          'Enter the expiry date shown on the document',
          { details: { field: 'expiresOn' } },
        );
      }
      if (isExpired(finalExpiry)) {
        throw new AppException(
          ErrorCode.VALIDATION_FAILED,
          'The document has expired; reject it instead',
          { details: { field: 'expiresOn' } },
        );
      }
      const updated = await trx
        .updateTable('driver_documents')
        .set({
          status: 'approved',
          expires_on: finalExpiry,
          reviewed_by: reviewer.userId,
          reviewed_at: new Date(),
          rejection_reason: null,
        })
        .where('id', '=', doc.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.audit.record(
        {
          actor: { type: 'user', userId: reviewer.userId },
          action: 'admin.driver_document.approved',
          target: { type: 'driver_document', id: doc.id },
          metadata: {
            driverUserId,
            documentType: doc.document_type,
            expiresOn: finalExpiry,
            expiryChanged: finalExpiry !== doc.expires_on,
          },
          context: reviewer.context,
        },
        trx,
      );
      return updated;
    });
    return this.views.documentView(row);
  }

  /** Rejects a pending document, or withdraws approval from one found to be invalid. */
  async rejectDocument(
    reviewer: Reviewer,
    driverUserId: string,
    documentId: string,
    reason: string,
    withdrawApproval = false,
  ): Promise<DriverDocumentView> {
    assertNotSelf(reviewer, driverUserId);
    const row = await this.db.transaction().execute(async (trx) => {
      const doc = await this.findDocument(trx, driverUserId, documentId, true);
      const allowed = doc.status === 'pending' || (doc.status === 'approved' && withdrawApproval);
      if (!allowed) {
        throw new AppException(ErrorCode.INVALID_STATE, 'Document cannot be rejected now', {
          details: { status: doc.status },
        });
      }
      const updated = await trx
        .updateTable('driver_documents')
        .set({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_by: reviewer.userId,
          reviewed_at: new Date(),
        })
        .where('id', '=', doc.id)
        .returningAll()
        .executeTakeFirstOrThrow();
      await this.audit.record(
        {
          actor: { type: 'user', userId: reviewer.userId },
          action: 'admin.driver_document.rejected',
          target: { type: 'driver_document', id: doc.id },
          metadata: {
            driverUserId,
            documentType: doc.document_type,
            reason,
            previousStatus: doc.status,
          },
          context: reviewer.context,
        },
        trx,
      );
      return updated;
    });
    return this.views.documentView(row);
  }

  /** Approves an application. Every required document must already be approved and in date. */
  async approveDriver(reviewer: Reviewer, driverUserId: string): Promise<AdminDriverDetail> {
    assertNotSelf(reviewer, driverUserId);
    await this.db.transaction().execute(async (trx) => {
      await this.lockStatus(trx, driverUserId, 'pending_review');
      const { view } = await this.views.load(driverUserId, trx);
      const outstanding = view.eligibility.blockers.filter((b) => b.code !== 'DRIVER_NOT_APPROVED');
      const gaps = view.submission.gaps;
      if (outstanding.length || gaps.length) {
        throw new AppException(
          ErrorCode.DRIVER_INCOMPLETE,
          'Approve every required document first',
          {
            details: { blockers: outstanding, gaps },
          },
        );
      }
      const now = new Date();
      await trx
        .updateTable('driver_profiles')
        .set({
          status: 'approved',
          approved_at: now,
          reviewed_at: now,
          reviewed_by: reviewer.userId,
          rejection_reason: null,
        })
        .where('user_id', '=', driverUserId)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: reviewer.userId },
          action: 'admin.driver.approved',
          target: { type: 'user', id: driverUserId },
          context: reviewer.context,
        },
        trx,
      );
    });
    await this.notifier.notify(driverUserId, 'sms.driver_approved');
    return this.detail(driverUserId);
  }

  /** Sends an application back to the driver with a reason; they can fix it and resubmit. */
  async rejectDriver(
    reviewer: Reviewer,
    driverUserId: string,
    reason: string,
  ): Promise<AdminDriverDetail> {
    assertNotSelf(reviewer, driverUserId);
    await this.db.transaction().execute(async (trx) => {
      await this.lockStatus(trx, driverUserId, 'pending_review');
      await trx
        .updateTable('driver_profiles')
        .set({
          status: 'rejected',
          rejection_reason: reason,
          reviewed_at: new Date(),
          reviewed_by: reviewer.userId,
        })
        .where('user_id', '=', driverUserId)
        .execute();
      await this.audit.record(
        {
          actor: { type: 'user', userId: reviewer.userId },
          action: 'admin.driver.rejected',
          target: { type: 'user', id: driverUserId },
          metadata: { reason },
          context: reviewer.context,
        },
        trx,
      );
    });
    await this.notifier.notify(driverUserId, 'sms.driver_rejected');
    return this.detail(driverUserId);
  }

  private async lockStatus(
    trx: Kysely<Database>,
    driverUserId: string,
    expected: 'pending_review',
  ) {
    const profile = await trx
      .selectFrom('driver_profiles')
      .select('status')
      .where('user_id', '=', driverUserId)
      .forUpdate()
      .executeTakeFirst();
    if (!profile) throw new AppException(ErrorCode.NOT_FOUND, 'Driver not found');
    if (profile.status !== expected) {
      throw new AppException(ErrorCode.INVALID_STATE, `Application is ${profile.status}`, {
        details: { status: profile.status },
      });
    }
  }

  private async findDocument(
    trx: Kysely<Database>,
    driverUserId: string,
    documentId: string,
    forUpdate = false,
  ) {
    let q = trx
      .selectFrom('driver_documents')
      .selectAll()
      .where('id', '=', documentId)
      .where('driver_user_id', '=', driverUserId);
    if (forUpdate) q = q.forUpdate();
    const doc = await q.executeTakeFirst();
    if (!doc) throw new AppException(ErrorCode.NOT_FOUND, 'Document not found');
    return doc;
  }
}

function assertNotSelf(reviewer: Reviewer, driverUserId: string) {
  if (reviewer.userId === driverUserId) {
    throw new AppException(ErrorCode.FORBIDDEN, 'You cannot review your own driver application');
  }
}
