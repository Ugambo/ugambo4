import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
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
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => resetState(h));

describe('system settings', () => {
  it('are for super admins only', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const res = await h.http.get('/v1/admin/settings').set('Authorization', admin.auth).expect(403);
    expect(res.body.error.details).toEqual({ missing: ['settings.manage'] });
  });

  it('take effect at once, are audited with the reason, and reset to the .env value', async () => {
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const before = await h.http.get('/v1/support-contact').expect(200);
    expect(before.body).toEqual({ phone: null, email: null });

    const res = await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({
        values: {
          SUPPORT_PHONE: '+234 800 000 0000',
          SUPPORT_EMAIL: 'help@example.com',
          NO_SHOW_WAIT_MINUTES: 7,
          SOS_ALERT_PHONES: ['08031110000', '+2348031110001'],
        },
        reason: 'Launch in Kano',
      })
      .expect(200);
    const view = Object.fromEntries(
      (res.body as { key: string; value: unknown; changed: boolean }[]).map((s) => [s.key, s]),
    );
    expect(view.NO_SHOW_WAIT_MINUTES).toMatchObject({ value: 7, changed: true });
    expect(view.SOS_ALERT_PHONES).toMatchObject({ value: ['+2348031110000', '+2348031110001'] });
    expect(h.config.NO_SHOW_WAIT_MINUTES).toBe(7);
    expect((await h.http.get('/v1/support-contact').expect(200)).body).toEqual({
      phone: '+234 800 000 0000',
      email: 'help@example.com',
    });

    const audit = await h.db
      .selectFrom('audit_logs')
      .select('metadata')
      .where('action', '=', 'admin.settings.updated')
      .executeTakeFirstOrThrow();
    expect(audit.metadata).toMatchObject({
      reason: 'Launch in Kano',
      changes: { NO_SHOW_WAIT_MINUTES: { from: 5, to: 7 } },
    });

    await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({ values: { NO_SHOW_WAIT_MINUTES: null, SUPPORT_PHONE: null }, reason: 'Back' })
      .expect(200);
    expect(h.config.NO_SHOW_WAIT_MINUTES).toBe(5);
    expect(h.config.SUPPORT_PHONE).toBeUndefined();
  });

  it('refuses values outside each rule, and contradictory ones', async () => {
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const bad = await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({ values: { NO_SHOW_WAIT_MINUTES: 500, SUPPORT_EMAIL: 'nope' }, reason: 'test' })
      .expect(422);
    expect(bad.body.error.details.map((d: { path: string }) => d.path).sort()).toEqual([
      'values.NO_SHOW_WAIT_MINUTES',
      'values.SUPPORT_EMAIL',
    ]);
    await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({ values: { WALLET_TOPUP_MIN_KOBO: h.config.WALLET_TOPUP_MAX_KOBO + 1 }, reason: 'x' })
      .expect(422);
    await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({ values: { NOT_A_SETTING: 1 }, reason: 'test' })
      .expect(422);
    expect(h.config.NO_SHOW_WAIT_MINUTES).toBe(5);
  });
});

describe('vehicle types', () => {
  it('lets a super admin switch on motorcycles for drivers to choose', async () => {
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const listed = await h.http
      .get('/v1/admin/vehicle-categories')
      .set('Authorization', root.auth)
      .expect(200);
    expect(listed.body.find((c: { key: string }) => c.key === 'motorcycle')).toMatchObject({
      isEnabled: false,
      seats: 1,
    });
    const offered = async () =>
      (await h.http.get('/v1/vehicle-categories').expect(200)).body.map(
        (c: { key: string }) => c.key,
      );
    expect(await offered()).not.toContain('motorcycle');

    await h.http
      .patch('/v1/admin/vehicle-categories/motorcycle')
      .set('Authorization', root.auth)
      .send({ isEnabled: true, name: 'Okada' })
      .expect(200);
    expect(await offered()).toContain('motorcycle');

    // Put it back for other test files sharing the database.
    await h.http
      .patch('/v1/admin/vehicle-categories/motorcycle')
      .set('Authorization', root.auth)
      .send({ isEnabled: false, name: 'Motorcycle' })
      .expect(200);
  });
});

describe('admins open accounts and fund wallets', () => {
  it('lets an admin create a passenger or a driver, but not staff', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const driver = await h.http
      .post('/v1/admin/users')
      .set('Authorization', admin.auth)
      .send({ phone: nextPhone(), fullName: 'Sani Driver', roles: ['driver'] })
      .expect(201);
    expect(driver.body.roles).toEqual(['driver', 'passenger']);
    const profile = await h.db
      .selectFrom('driver_profiles')
      .select('status')
      .where('user_id', '=', driver.body.id)
      .executeTakeFirstOrThrow();
    expect(profile.status).toBe('onboarding');

    await h.http
      .post('/v1/admin/users')
      .set('Authorization', admin.auth)
      .send({ phone: nextPhone(), fullName: 'Hauwa Passenger' })
      .expect(201);
    const staff = await h.http
      .post('/v1/admin/users')
      .set('Authorization', admin.auth)
      .send({ phone: nextPhone(), fullName: 'Would Be Admin', roles: ['admin'] })
      .expect(403);
    expect(staff.body.error.details).toEqual({ missing: ['roles.assign_privileged'] });
  });

  it('limits how much an admin may fund at once; super admins have no limit', async () => {
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const target = await signIn(h, nextPhone());
    const fund = (auth: string, amountKobo: number, key: string) =>
      h.http
        .post(`/v1/admin/users/${target.user.id}/wallet-adjustments`)
        .set('Authorization', auth)
        .set('Idempotency-Key', key)
        .send({ amountKobo, kind: 'passenger', reason: 'Welcome credit' });

    const ok = await fund(admin.auth, 1_000_000, 'funding-key-1').expect(201);
    expect(ok.body.balanceKobo).toBe(1_000_000);
    const tooMuch = await fund(admin.auth, 6_000_000, 'funding-key-2').expect(422);
    expect(tooMuch.body.error).toMatchObject({
      code: 'WALLET_LIMIT_EXCEEDED',
      details: { limitKobo: 5_000_000 },
    });
    await fund(root.auth, 6_000_000, 'funding-key-3').expect(201);

    // Raising the limit lets the admin do it.
    await h.http
      .patch('/v1/admin/settings')
      .set('Authorization', root.auth)
      .send({ values: { ADMIN_WALLET_FUND_LIMIT_KOBO: 10_000_000 }, reason: 'Promotion week' })
      .expect(200);
    await fund(admin.auth, 6_000_000, 'funding-key-4').expect(201);
  });
});
