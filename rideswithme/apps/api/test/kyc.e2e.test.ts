import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { JPEG } from './driver-fixtures';
import {
  createHarness,
  type Harness,
  nextPhone,
  resetState,
  signIn,
  signInWithMfa,
} from './harness';

let h: Harness;
beforeAll(async () => {
  h = await createHarness({ PASSENGER_KYC_REQUIRED: 'true' });
});
afterAll(async () => h.close());
beforeEach(async () => resetState(h));

const DETAILS = {
  fullName: 'Amina Yusuf',
  gender: 'female',
  dateOfBirth: '1994-05-17',
  emergencyContact: { name: 'Bello Yusuf', phone: '08039990000' },
};

async function passenger() {
  const s = await signIn(h, nextPhone());
  return { ...s, auth: `Bearer ${s.tokens.accessToken}` };
}

/** Uploads a photo through a signed link and returns the upload id. */
async function upload(auth: string, kind: 'id' | 'selfie') {
  const ticket = await h.http
    .post('/v1/me/verification/uploads')
    .set('Authorization', auth)
    .send({ kind, contentType: 'image/jpeg', sizeBytes: JPEG.length })
    .expect(201);
  const put = await fetch(ticket.body.uploadUrl, {
    method: 'PUT',
    headers: ticket.body.headers,
    body: JPEG,
  });
  expect(put.ok).toBe(true);
  return ticket.body.uploadId as string;
}

/** Sends the identity check and expects the given status. */
async function submit(auth: string, status: number, nin = '12345678901') {
  const idUploadId = await upload(auth, 'id');
  const selfieUploadId = await upload(auth, 'selfie');
  return h.http
    .post('/v1/me/verification')
    .set('Authorization', auth)
    .send({ idType: 'nin_slip', nin, idUploadId, selfieUploadId })
    .expect(status);
}

const bookRide = (auth: string) =>
  h.http
    .post('/v1/rides')
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ quoteId: randomUUID(), paymentMethod: 'cash' });

describe('passenger details and identity check', () => {
  it('refuses bookings until details are given and staff approve the check', async () => {
    const p = await passenger();
    const first = await h.http.get('/v1/me/verification').set('Authorization', p.auth).expect(200);
    expect(first.body).toMatchObject({
      required: true,
      canBook: false,
      status: 'not_started',
      missingDetails: ['fullName', 'gender', 'dateOfBirth', 'emergencyContact'],
    });
    const blocked = await bookRide(p.auth).expect(403);
    expect(blocked.body.error.code).toBe('KYC_REQUIRED');

    // Submitting before the details: refused.
    const early = await submit(p.auth, 403);
    expect(early.body.error.details.missingDetails).toContain('gender');

    const me = await h.http.patch('/v1/me').set('Authorization', p.auth).send(DETAILS).expect(200);
    expect(me.body).toMatchObject({
      fullName: 'Amina Yusuf',
      gender: 'female',
      dateOfBirth: '1994-05-17',
      emergencyContact: { name: 'Bello Yusuf', phone: '+2348039990000' },
    });

    const sent = await submit(p.auth, 200);
    expect(sent.body).toMatchObject({ status: 'pending', ninLast4: '8901', canBook: false });
    const waiting = await bookRide(p.auth).expect(403);
    expect(waiting.body.error.details.status).toBe('pending');

    // Staff see it, open the photos, and approve.
    const staff = await signInWithMfa(h, nextPhone(), 'admin');
    const queue = await h.http
      .get('/v1/admin/passenger-verifications')
      .set('Authorization', staff.auth)
      .expect(200);
    expect(queue.body).toEqual([
      expect.objectContaining({ userId: p.user.id, name: 'Amina Yusuf', ninLast4: '8901' }),
    ]);
    const link = await h.http
      .post(`/v1/admin/passenger-verifications/${p.user.id}/view-url`)
      .set('Authorization', staff.auth)
      .send({ which: 'selfie' })
      .expect(200);
    const photo = await fetch(link.body.url);
    expect(Buffer.from(await photo.arrayBuffer()).equals(JPEG)).toBe(true);
    await h.http
      .post(`/v1/admin/passenger-verifications/${p.user.id}/approve`)
      .set('Authorization', staff.auth)
      .expect(200);

    const after = await h.http.get('/v1/me/verification').set('Authorization', p.auth).expect(200);
    expect(after.body).toMatchObject({ status: 'approved', canBook: true });
    // Past the check now: the ride fails only on the made-up quote.
    const res = await bookRide(p.auth);
    expect(res.body.error?.code).not.toBe('KYC_REQUIRED');
    expect(h.sms.messages.some((m) => m.to === p.user.phone && /approved/i.test(m.text))).toBe(
      true,
    );
  });

  it('lets a rejected passenger send again, and keeps one NIN to one account', async () => {
    const p = await passenger();
    await h.http.patch('/v1/me').set('Authorization', p.auth).send(DETAILS).expect(200);
    await submit(p.auth, 200);
    const staff = await signInWithMfa(h, nextPhone(), 'admin');
    await h.http
      .post(`/v1/admin/passenger-verifications/${p.user.id}/reject`)
      .set('Authorization', staff.auth)
      .send({ reason: 'The selfie is too dark' })
      .expect(200);
    const view = await h.http.get('/v1/me/verification').set('Authorization', p.auth).expect(200);
    expect(view.body).toMatchObject({
      status: 'rejected',
      rejectionReason: 'The selfie is too dark',
    });

    // Someone else cannot use the NIN while it is waiting or approved.
    await submit(p.auth, 200);
    const other = await passenger();
    await h.http
      .patch('/v1/me')
      .set('Authorization', other.auth)
      .send({ ...DETAILS, fullName: 'Someone Else' })
      .expect(200);
    const dup = await submit(other.auth, 409);
    expect(dup.body.error.code).toBe('NIN_ALREADY_REGISTERED');
  });

  it('checks the details: adults only, and the emergency contact is someone else', async () => {
    const p = await passenger();
    const young = new Date(Date.now() - 17 * 365.25 * 86_400_000).toISOString().slice(0, 10);
    await h.http
      .patch('/v1/me')
      .set('Authorization', p.auth)
      .send({ dateOfBirth: young })
      .expect(422);
    await h.http
      .patch('/v1/me')
      .set('Authorization', p.auth)
      .send({ emergencyContact: { name: 'Me Again', phone: p.user.phone } })
      .expect(422);
  });

  it('is for staff with the permission only, and the setting can switch it off', async () => {
    const support = await signInWithMfa(h, nextPhone(), 'support_agent');
    await h.http
      .get('/v1/admin/passenger-verifications')
      .set('Authorization', support.auth)
      .expect(403);

    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({ values: { PASSENGER_KYC_REQUIRED: false }, reason: 'Testing week' })
      .expect(200);
    const p = await passenger();
    const view = await h.http.get('/v1/me/verification').set('Authorization', p.auth).expect(200);
    expect(view.body).toMatchObject({ required: false, canBook: true });
    const res = await bookRide(p.auth);
    expect(res.body.error?.code).not.toBe('KYC_REQUIRED');
  });

  it('erases the check and its photos when the account is deleted', async () => {
    const p = await passenger();
    await h.http.patch('/v1/me').set('Authorization', p.auth).send(DETAILS).expect(200);
    await submit(p.auth, 200);
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    await h.http
      .post(`/v1/admin/users/${p.user.id}/delete`)
      .set('Authorization', root.auth)
      .send({ reason: 'Asked by phone' })
      .expect(200);
    const left = await h.db
      .selectFrom('passenger_verifications')
      .select('user_id')
      .where('user_id', '=', p.user.id)
      .executeTakeFirst();
    expect(left).toBeUndefined();
    const user = await h.db
      .selectFrom('users')
      .select(['gender', 'date_of_birth', 'emergency_contact_phone'])
      .where('id', '=', p.user.id)
      .executeTakeFirstOrThrow();
    expect(user).toEqual({ gender: null, date_of_birth: null, emergency_contact_phone: null });
  });
});
