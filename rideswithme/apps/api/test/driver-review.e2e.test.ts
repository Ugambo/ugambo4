import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AdminDriverDetail, DriverOnboardingView } from '@rideswithme/shared-types';
import { DocumentExpiryService } from '../src/drivers/document-expiry.service';
import { addDocument, completeApplication, inDays } from './driver-fixtures';
import {
  createHarness,
  grantRole,
  type Harness,
  nextPhone,
  resetState,
  signIn,
  signInWithMfa,
} from './harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => resetState(h));

async function submittedDriver(category = 'car') {
  const phone = nextPhone();
  const { tokens, user } = await signIn(h, phone);
  const auth = `Bearer ${tokens.accessToken}`;
  await completeApplication(h, auth, category);
  return { auth, userId: user.id, phone };
}

async function detail(admin: { auth: string }, driverId: string) {
  return (
    await h.http.get(`/v1/admin/drivers/${driverId}`).set('Authorization', admin.auth).expect(200)
  ).body as AdminDriverDetail;
}

async function approveAllDocuments(admin: { auth: string }, driverId: string) {
  const d = await detail(admin, driverId);
  for (const r of d.requirements) {
    if (r.latest?.status === 'pending') {
      await h.http
        .post(`/v1/admin/drivers/${driverId}/documents/${r.latest.id}/approve`)
        .set('Authorization', admin.auth)
        .send({})
        .expect(200);
    }
  }
}

describe('verification queue', () => {
  it('shows submitted applications oldest first, with pending document counts', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const first = await submittedDriver();
    const second = await submittedDriver('keke_napep');
    // Someone still filling in their application is not in the queue, even with documents uploaded.
    const { tokens } = await signIn(h, nextPhone());
    await h.http
      .post('/v1/driver/registration')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200);
    await addDocument(h, `Bearer ${tokens.accessToken}`, 'profile_photo');

    const res = await h.http.get('/v1/admin/drivers').set('Authorization', admin.auth).expect(200);
    expect(res.body.items.map((d: { userId: string }) => d.userId)).toEqual([
      first.userId,
      second.userId,
    ]);
    expect(res.body.items[0]).toMatchObject({
      status: 'pending_review',
      pendingDocuments: 9,
      vehicleCategory: 'car',
      fullName: 'Musa Abdullahi',
    });
    expect(res.body.items[1]).toMatchObject({ pendingDocuments: 8, vehicleCategory: 'keke_napep' });

    const page1 = await h.http
      .get('/v1/admin/drivers')
      .query({ limit: 1 })
      .set('Authorization', admin.auth)
      .expect(200);
    const page2 = await h.http
      .get('/v1/admin/drivers')
      .query({ limit: 1, cursor: page1.body.nextCursor })
      .set('Authorization', admin.auth)
      .expect(200);
    expect([page1.body.items[0].userId, page2.body.items[0].userId]).toEqual([
      first.userId,
      second.userId,
    ]);
    expect(page2.body.nextCursor).toBeNull();

    const all = await h.http
      .get('/v1/admin/drivers')
      .query({ queue: 'all' })
      .set('Authorization', admin.auth)
      .expect(200);
    expect(all.body.items).toHaveLength(3);

    const byPhone = await h.http
      .get('/v1/admin/drivers')
      .query({ queue: 'all', search: `0${second.phone.slice(4)}` })
      .set('Authorization', admin.auth)
      .expect(200);
    expect(byPhone.body.items.map((d: { userId: string }) => d.userId)).toEqual([second.userId]);
  });

  it('gives a short-lived link to each document and audits every view', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await submittedDriver();
    const d = await detail(admin, driver.userId);
    const photo = d.requirements.find((r) => r.key === 'profile_photo')!.latest!;

    const res = await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${photo.id}/view-url`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(res.body.contentType).toBe('image/jpeg');
    expect(new Date(res.body.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(60_000);
    const file = await fetch(res.body.url);
    expect(file.ok).toBe(true);
    expect(Buffer.from(await file.arrayBuffer()).subarray(0, 3)).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );

    const audit = await h.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('action', '=', 'admin.driver_document.viewed')
      .executeTakeFirstOrThrow();
    expect(audit).toMatchObject({
      actor_user_id: admin.userId,
      target_id: photo.id,
      metadata: { documentType: 'profile_photo', driverUserId: driver.userId },
    });

    // A document id from another driver is not reachable through this driver.
    const other = await submittedDriver();
    await h.http
      .post(`/v1/admin/drivers/${other.userId}/documents/${photo.id}/view-url`)
      .set('Authorization', admin.auth)
      .expect(404);
  });

  it('limits support agents to reading the queue', async () => {
    const support = await signInWithMfa(h, nextPhone(), 'support_agent');
    const driver = await submittedDriver();
    await h.http.get('/v1/admin/drivers').set('Authorization', support.auth).expect(200);
    const d = await detail(support, driver.userId);
    const docId = d.requirements[0]!.latest!.id;
    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${docId}/view-url`)
      .set('Authorization', support.auth)
      .expect(403);
    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${docId}/approve`)
      .set('Authorization', support.auth)
      .send({})
      .expect(403);
    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/approve`)
      .set('Authorization', support.auth)
      .expect(403);
  });
});

describe('review decisions', () => {
  it('approves a driver only after every required document is approved, then lets them go online', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await submittedDriver();

    const tooEarly = await h.http
      .post(`/v1/admin/drivers/${driver.userId}/approve`)
      .set('Authorization', admin.auth)
      .expect(422);
    expect(tooEarly.body.error.code).toBe('DRIVER_INCOMPLETE');
    expect(tooEarly.body.error.details.blockers).toHaveLength(9);

    await approveAllDocuments(admin, driver.userId);
    h.sms.messages = [];
    const approved = await h.http
      .post(`/v1/admin/drivers/${driver.userId}/approve`)
      .set('Authorization', admin.auth)
      .expect(200);
    expect(approved.body).toMatchObject({
      status: 'approved',
      reviewedBy: admin.userId,
      eligibility: { canGoOnline: true, blockers: [] },
    });
    expect(h.sms.messages).toEqual([
      { to: driver.phone, text: expect.stringContaining('approved') },
    ]);

    const own = (
      await h.http.get('/v1/driver/onboarding').set('Authorization', driver.auth).expect(200)
    ).body as DriverOnboardingView;
    expect(own.eligibility.canGoOnline).toBe(true);
    expect(own.requirements.every((r) => r.status === 'approved' && r.hasValidApproval)).toBe(true);

    // Gone from the review queue.
    const queue = await h.http
      .get('/v1/admin/drivers')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(queue.body.items).toHaveLength(0);
    const actions = (
      await h.db
        .selectFrom('audit_logs')
        .select('action')
        .where('actor_user_id', '=', admin.userId)
        .execute()
    ).map((r) => r.action);
    expect(actions.filter((a) => a === 'admin.driver_document.approved')).toHaveLength(9);
    expect(actions).toContain('admin.driver.approved');
  });

  it('requires an expiry date for documents that expire, and lets the reviewer correct it', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await submittedDriver();
    const licence = (await detail(admin, driver.userId)).requirements.find(
      (r) => r.key === 'drivers_licence',
    )!.latest!;
    const corrected = await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${licence.id}/approve`)
      .set('Authorization', admin.auth)
      .send({ expiresOn: inDays(100) })
      .expect(200);
    expect(corrected.body).toMatchObject({ status: 'approved', expiresOn: inDays(100) });
    const again = await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${licence.id}/approve`)
      .set('Authorization', admin.auth)
      .send({})
      .expect(409);
    expect(again.body.error.code).toBe('INVALID_STATE');
  });

  it('sends an application back with a reason; the driver fixes it and resubmits', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await submittedDriver();
    const d = await detail(admin, driver.userId);
    const insurance = d.requirements.find((r) => r.key === 'insurance_certificate')!.latest!;

    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${insurance.id}/reject`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Certificate is for a different vehicle' })
      .expect(200);
    h.sms.messages = [];
    const rejected = await h.http
      .post(`/v1/admin/drivers/${driver.userId}/reject`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Please upload the insurance for this vehicle' })
      .expect(200);
    expect(rejected.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'Please upload the insurance for this vehicle',
    });
    expect(h.sms.messages[0]!.text).toContain('needs changes');
    // Sent back: waiting on the driver now, so not in the review queue, though other documents are still pending.
    const queue = await h.http
      .get('/v1/admin/drivers')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(queue.body.items).toEqual([]);

    const view = (
      await h.http.get('/v1/driver/onboarding').set('Authorization', driver.auth).expect(200)
    ).body as DriverOnboardingView;
    expect(view.editable).toBe(true);
    expect(view.requirements.find((r) => r.key === 'insurance_certificate')).toMatchObject({
      status: 'rejected',
      latest: { rejectionReason: 'Certificate is for a different vehicle' },
    });
    expect(view.submission.gaps).toEqual([
      { code: 'DOCUMENT', documentType: 'insurance_certificate' },
    ]);

    await addDocument(h, driver.auth, 'insurance_certificate');
    const resubmitted = await h.http
      .post('/v1/driver/submit')
      .set('Authorization', driver.auth)
      .expect(200);
    expect(resubmitted.body.status).toBe('pending_review');
    expect(resubmitted.body.rejectionReason).toBeNull();
  });

  it('stops reviewers deciding on their own application', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    await completeApplication(h, admin.auth);
    const d = await detail(admin, admin.userId);
    const res = await h.http
      .post(`/v1/admin/drivers/${admin.userId}/documents/${d.requirements[0]!.latest!.id}/approve`)
      .set('Authorization', admin.auth)
      .send({})
      .expect(403);
    expect(res.body.error.message).toMatch(/own/);
    await h.http
      .post(`/v1/admin/drivers/${admin.userId}/approve`)
      .set('Authorization', admin.auth)
      .expect(403);
  });

  it('lets only one of two reviewers decide on the same document', async () => {
    const a = await signInWithMfa(h, nextPhone(), 'admin');
    const b = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await submittedDriver();
    const doc = (await detail(a, driver.userId)).requirements[0]!.latest!;
    const [r1, r2] = await Promise.all([
      h.http
        .post(`/v1/admin/drivers/${driver.userId}/documents/${doc.id}/approve`)
        .set('Authorization', a.auth)
        .send({}),
      h.http
        .post(`/v1/admin/drivers/${driver.userId}/documents/${doc.id}/reject`)
        .set('Authorization', b.auth)
        .send({ reason: 'Blurry photo' }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  });
});

describe('expiry and renewals', () => {
  async function approvedDriver() {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await submittedDriver();
    await approveAllDocuments(admin, driver.userId);
    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/approve`)
      .set('Authorization', admin.auth)
      .expect(200);
    return { admin, driver };
  }

  it('blocks going online as soon as a required document expires, before any sweep runs', async () => {
    const { driver } = await approvedDriver();
    await h.db
      .updateTable('driver_documents')
      .set({ expires_on: inDays(-1) })
      .where('document_type', '=', 'drivers_licence')
      .execute();

    const view = (
      await h.http.get('/v1/driver/onboarding').set('Authorization', driver.auth).expect(200)
    ).body as DriverOnboardingView;
    expect(view.status).toBe('approved');
    expect(view.eligibility).toEqual({
      canGoOnline: false,
      blockers: [{ code: 'DOCUMENT_EXPIRED', documentType: 'drivers_licence' }],
    });
    expect(view.requirements.find((r) => r.key === 'drivers_licence')!.status).toBe('expired');

    const swept = await h.app.get(DocumentExpiryService).sweep();
    expect(swept).toBe(1);
    const audit = await h.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('action', '=', 'driver_document.expired')
      .executeTakeFirstOrThrow();
    expect(audit.actor_type).toBe('system');
    expect(await h.app.get(DocumentExpiryService).sweep()).toBe(0);
  });

  it('puts renewals from approved drivers in the queue and restores eligibility when approved', async () => {
    const { admin, driver } = await approvedDriver();
    await h.db
      .updateTable('driver_documents')
      .set({ expires_on: inDays(-1) })
      .where('document_type', '=', 'insurance_certificate')
      .execute();

    // Approved drivers cannot edit their details but can renew documents.
    await h.http
      .put('/v1/driver/vehicle')
      .set('Authorization', driver.auth)
      .send({
        categoryKey: 'car',
        plateNumber: 'NEW123AB',
        make: 'Kia',
        model: 'Rio',
        colour: 'Red',
        year: 2018,
      })
      .expect(409);
    const renewal = await addDocument(h, driver.auth, 'insurance_certificate');

    const queue = await h.http
      .get('/v1/admin/drivers')
      .set('Authorization', admin.auth)
      .expect(200);
    expect(queue.body.items).toEqual([
      expect.objectContaining({ userId: driver.userId, status: 'approved', pendingDocuments: 1 }),
    ]);

    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${renewal.id}/approve`)
      .set('Authorization', admin.auth)
      .send({})
      .expect(200);
    const view = (
      await h.http.get('/v1/driver/onboarding').set('Authorization', driver.auth).expect(200)
    ).body as DriverOnboardingView;
    expect(view.eligibility.canGoOnline).toBe(true);
  });

  it('withdraws eligibility when an approved document is later rejected', async () => {
    const { admin, driver } = await approvedDriver();
    const d = await detail(admin, driver.userId);
    const id = d.requirements.find((r) => r.key === 'national_id')!.latest!.id;
    // Overturning an approval has to be explicit.
    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${id}/reject`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Forged document' })
      .expect(409);
    await h.http
      .post(`/v1/admin/drivers/${driver.userId}/documents/${id}/reject`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Forged document', withdrawApproval: true })
      .expect(200);
    const view = (
      await h.http.get('/v1/driver/onboarding').set('Authorization', driver.auth).expect(200)
    ).body as DriverOnboardingView;
    expect(view.eligibility.blockers).toEqual([
      { code: 'DOCUMENT_NOT_APPROVED', documentType: 'national_id' },
    ]);
  });

  it('blocks suspended accounts even when everything else is approved', async () => {
    const { admin, driver } = await approvedDriver();
    await grantRole(h, admin.userId, 'admin');
    await h.http
      .post(`/v1/admin/users/${driver.userId}/suspend`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Safety report' })
      .expect(200);
    const d = await detail(admin, driver.userId);
    expect(d.eligibility.blockers).toEqual([{ code: 'ACCOUNT_NOT_ACTIVE' }]);
  });
});
