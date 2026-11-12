import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { DriverOnboardingView } from '@rideswithme/shared-types';
import {
  completeApplication,
  inDays,
  JPEG,
  nextNin,
  nextPlate,
  PDF,
  uploadFile,
} from './driver-fixtures';
import { createHarness, type Harness, nextPhone, resetState, signIn } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => resetState(h));

async function newDriver() {
  const { tokens, user } = await signIn(h, nextPhone());
  const auth = `Bearer ${tokens.accessToken}`;
  await h.http.post('/v1/driver/registration').set('Authorization', auth).expect(200);
  return { auth, userId: user.id };
}

const vehicle = (overrides: Record<string, unknown> = {}) => ({
  categoryKey: 'car',
  plateNumber: nextPlate(),
  make: 'Toyota',
  model: 'Corolla',
  colour: 'Silver',
  year: 2015,
  ...overrides,
});

describe('driver registration', () => {
  it('lists only enabled vehicle categories with their documents', async () => {
    const res = await h.http.get('/v1/vehicle-categories').expect(200);
    expect(res.body.map((c: { key: string }) => c.key)).toEqual(['car', 'keke_napep']);
    expect(res.body[1].requiredDocuments).toContain('operating_permit');
  });

  it('starts an application, grants the driver role and shows what is missing', async () => {
    const { tokens } = await signIn(h, nextPhone());
    const auth = `Bearer ${tokens.accessToken}`;
    await h.http.get('/v1/driver/onboarding').set('Authorization', auth).expect(404);

    const res = await h.http.post('/v1/driver/registration').set('Authorization', auth).expect(200);
    const view = res.body as DriverOnboardingView;
    expect(view.status).toBe('onboarding');
    expect(view.editable).toBe(true);
    expect(view.requirements.map((r) => r.key)).toEqual([
      'profile_photo',
      'national_id',
      'drivers_licence',
    ]);
    expect(view.submission.gaps.map((g) => g.code)).toEqual([
      'FULL_NAME',
      'NIN',
      'PAYOUT_ACCOUNT',
      'VEHICLE',
      'DOCUMENT',
      'DOCUMENT',
      'DOCUMENT',
    ]);
    expect(view.eligibility.canGoOnline).toBe(false);

    const me = await h.http.get('/v1/me').set('Authorization', auth).expect(200);
    expect(me.body.roles).toEqual(['driver', 'passenger']);
    // Registering again is harmless.
    await h.http.post('/v1/driver/registration').set('Authorization', auth).expect(200);
  });

  it('stores the NIN and payout account encrypted, and blocks a NIN used by another driver', async () => {
    const a = await newDriver();
    const b = await newDriver();
    const nin = nextNin();
    const res = await h.http
      .patch('/v1/driver/profile')
      .set('Authorization', a.auth)
      .send({ fullName: 'Aisha Sani', nin: `${nin.slice(0, 4)} ${nin.slice(4)}` })
      .expect(200);
    expect(res.body.profile).toEqual({ fullName: 'Aisha Sani', ninLast4: nin.slice(-4) });

    await h.http
      .put('/v1/driver/payout-account')
      .set('Authorization', a.auth)
      .send({ bankCode: '058', accountNumber: '0123456789', accountName: 'Aisha Sani' })
      .expect(200);
    const row = await h.db
      .selectFrom('driver_profiles')
      .selectAll()
      .where('user_id', '=', a.userId)
      .executeTakeFirstOrThrow();
    expect(row.nin_encrypted).not.toContain(nin);
    expect(row.payout_account_number_encrypted).not.toContain('0123456789');
    expect(row.payout_account_last4).toBe('6789');

    const dup = await h.http
      .patch('/v1/driver/profile')
      .set('Authorization', b.auth)
      .send({ nin })
      .expect(409);
    expect(dup.body.error.code).toBe('NIN_ALREADY_REGISTERED');
  });

  it('accepts only enabled categories and unique plates, and sets requirements by category', async () => {
    const a = await newDriver();
    const b = await newDriver();
    const taxi = await h.http
      .put('/v1/driver/vehicle')
      .set('Authorization', a.auth)
      .send(vehicle({ categoryKey: 'taxi' }))
      .expect(422);
    expect(taxi.body.error.code).toBe('VEHICLE_CATEGORY_UNAVAILABLE');

    const res = await h.http
      .put('/v1/driver/vehicle')
      .set('Authorization', a.auth)
      .send(vehicle({ categoryKey: 'keke_napep', plateNumber: 'abc-123 de' }))
      .expect(200);
    expect(res.body.vehicle).toMatchObject({
      plateNumber: 'ABC123DE',
      category: { key: 'keke_napep' },
    });
    expect(res.body.requirements.map((r: { key: string }) => r.key)).toContain('operating_permit');
    expect(res.body.requirements.map((r: { key: string }) => r.key)).not.toContain(
      'roadworthiness_certificate',
    );

    // Editing keeps one vehicle.
    await h.http
      .put('/v1/driver/vehicle')
      .set('Authorization', a.auth)
      .send(vehicle({ plateNumber: 'ABC123DE', colour: 'Green' }))
      .expect(200);
    expect(await h.db.selectFrom('vehicles').select('id').execute()).toHaveLength(1);

    const dup = await h.http
      .put('/v1/driver/vehicle')
      .set('Authorization', b.auth)
      .send(vehicle({ plateNumber: 'ABC 123 DE' }))
      .expect(409);
    expect(dup.body.error.code).toBe('PLATE_ALREADY_REGISTERED');
  });
});

describe('document uploads', () => {
  it('uploads straight to private storage and records a pending document', async () => {
    const d = await newDriver();
    const ticket = await uploadFile(h, d.auth, 'profile_photo', JPEG, 'image/jpeg');
    expect(ticket.uploadUrl).toContain('X-Amz-Signature');

    const res = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: ticket.uploadId })
      .expect(201);
    expect(res.body).toMatchObject({
      documentType: 'profile_photo',
      status: 'pending',
      contentType: 'image/jpeg',
      sizeBytes: JPEG.length,
    });

    // The object is not readable without a signature.
    const key = (
      await h.db.selectFrom('driver_documents').select('object_key').executeTakeFirstOrThrow()
    ).object_key;
    const anonymous = await fetch(`${h.config.S3_ENDPOINT}/${h.config.S3_BUCKET}/${key}`);
    expect(anonymous.ok).toBe(false);

    const view = await h.http.get('/v1/driver/onboarding').set('Authorization', d.auth).expect(200);
    expect(view.body.requirements[0]).toMatchObject({
      key: 'profile_photo',
      status: 'pending',
      hasValidApproval: false,
    });
  });

  it('checks the file really is what was declared', async () => {
    const d = await newDriver();
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    const ticket = await uploadFile(h, d.auth, 'national_id', html, 'image/jpeg');
    const res = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: ticket.uploadId })
      .expect(422);
    expect(res.body.error).toMatchObject({
      code: 'UPLOAD_INVALID',
      details: { reason: 'wrong_type' },
    });
  });

  it('rejects uploads that never arrived, are reused, or belong to someone else', async () => {
    const d = await newDriver();
    const other = await newDriver();
    const notSent = await h.http
      .post('/v1/driver/documents/uploads')
      .set('Authorization', d.auth)
      .send({ documentType: 'national_id', contentType: 'application/pdf', sizeBytes: PDF.length })
      .expect(200);
    const missing = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: notSent.body.uploadId })
      .expect(422);
    expect(missing.body.error.details.reason).toBe('not_found');

    const ticket = await uploadFile(h, d.auth, 'national_id', PDF, 'application/pdf');
    await h.http
      .post('/v1/driver/documents')
      .set('Authorization', other.auth)
      .send({ uploadId: ticket.uploadId })
      .expect(422);
    await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: ticket.uploadId })
      .expect(201);
    const reused = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: ticket.uploadId })
      .expect(422);
    expect(reused.body.error.details.reason).toBe('already_used');
  });

  it('enforces photo-only types, vehicle-first ordering, numbers and expiry dates', async () => {
    const d = await newDriver();
    await h.http
      .post('/v1/driver/documents/uploads')
      .set('Authorization', d.auth)
      .send({ documentType: 'profile_photo', contentType: 'application/pdf', sizeBytes: 100 })
      .expect(422);
    const noVehicle = await h.http
      .post('/v1/driver/documents/uploads')
      .set('Authorization', d.auth)
      .send({
        documentType: 'insurance_certificate',
        contentType: 'application/pdf',
        sizeBytes: 100,
      })
      .expect(422);
    expect(noVehicle.body.error.code).toBe('DRIVER_INCOMPLETE');

    const licence = await uploadFile(h, d.auth, 'drivers_licence', PDF, 'application/pdf');
    const noNumber = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: licence.uploadId, expiresOn: inDays(30) })
      .expect(422);
    expect(noNumber.body.error.details.field).toBe('documentNumber');
    const expired = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: licence.uploadId, documentNumber: 'ABC12345', expiresOn: inDays(-2) })
      .expect(422);
    expect(expired.body.error.details.field).toBe('expiresOn');
    const ok = await h.http
      .post('/v1/driver/documents')
      .set('Authorization', d.auth)
      .send({ uploadId: licence.uploadId, documentNumber: 'abc-12345', expiresOn: inDays(30) })
      .expect(201);
    expect(ok.body).toMatchObject({ numberLast4: '2345', expiresOn: inDays(30) });
  });

  it('only counts vehicle documents uploaded for the current vehicle category', async () => {
    const d = await newDriver();
    await h.http
      .put('/v1/driver/vehicle')
      .set('Authorization', d.auth)
      .send(vehicle({ categoryKey: 'keke_napep' }))
      .expect(200);
    await h.http
      .post('/v1/driver/documents/uploads')
      .set('Authorization', d.auth)
      .send({
        documentType: 'roadworthiness_certificate',
        contentType: 'application/pdf',
        sizeBytes: 100,
      })
      .expect(422);
  });
});

describe('submitting for review', () => {
  it('lists what is missing, then submits and locks the application', async () => {
    const d = await newDriver();
    const incomplete = await h.http
      .post('/v1/driver/submit')
      .set('Authorization', d.auth)
      .expect(422);
    expect(incomplete.body.error.code).toBe('DRIVER_INCOMPLETE');
    expect(incomplete.body.error.details.gaps.length).toBeGreaterThan(3);

    const { tokens } = await signIn(h, nextPhone());
    const auth = `Bearer ${tokens.accessToken}`;
    const view = await completeApplication(h, auth, 'car');
    expect(view.status).toBe('pending_review');
    expect(view.editable).toBe(false);
    expect(view.requirements).toHaveLength(9);
    expect(view.requirements.every((r) => r.status === 'pending')).toBe(true);

    const locked = await h.http
      .patch('/v1/driver/profile')
      .set('Authorization', auth)
      .send({ fullName: 'Someone Else' })
      .expect(409);
    expect(locked.body.error.code).toBe('DRIVER_PROFILE_LOCKED');
    await h.http.post('/v1/driver/submit').set('Authorization', auth).expect(409);

    const actions = (await h.db.selectFrom('audit_logs').select('action').execute()).map(
      (r) => r.action,
    );
    expect(actions).toContain('driver.application.submitted');
    expect(actions.filter((a) => a === 'driver.document.uploaded')).toHaveLength(9);
  });
});
