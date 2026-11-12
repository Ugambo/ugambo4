import { sql } from 'kysely';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MfaService } from '../src/auth/mfa.service';
import {
  currentTotp,
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

describe('permissions and two-factor authentication', () => {
  it('forbids passengers from admin endpoints', async () => {
    const { tokens } = await signIn(h, nextPhone());
    const res = await h.http
      .get('/v1/admin/users')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(403);
    expect(res.body.error).toMatchObject({
      code: 'FORBIDDEN',
      details: { missing: ['users.read'] },
    });
  });

  it('requires TOTP enrolment and verification before an admin can use admin permissions', async () => {
    const first = await signIn(h, nextPhone());
    await grantRole(h, first.user.id, 'admin');
    const auth = `Bearer ${first.tokens.accessToken}`;

    const blocked = await h.http.get('/v1/admin/users').set('Authorization', auth).expect(403);
    expect(blocked.body.error).toMatchObject({
      code: 'MFA_REQUIRED',
      details: { enrolled: false },
    });

    const me = await h.http.get('/v1/me').set('Authorization', auth).expect(200);
    expect(me.body.mfa).toEqual({ required: true, enrolled: false, verifiedForSession: false });

    const setup = await h.http
      .post('/v1/auth/mfa/totp/setup')
      .set('Authorization', auth)
      .expect(200);
    expect(setup.body.otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
    const stored = await h.db
      .selectFrom('users')
      .select('totp_secret_encrypted')
      .executeTakeFirstOrThrow();
    expect(stored.totp_secret_encrypted).not.toContain(setup.body.secret);

    await h.http
      .post('/v1/auth/mfa/totp/activate')
      .set('Authorization', auth)
      .send({ code: '000000' === currentTotp(setup.body.secret) ? '111111' : '000000' })
      .expect(422);
    const activated = await h.http
      .post('/v1/auth/mfa/totp/activate')
      .set('Authorization', auth)
      .send({ code: currentTotp(setup.body.secret) })
      .expect(200);
    expect(activated.body.mfa).toEqual({
      required: true,
      enrolled: true,
      verifiedForSession: true,
    });
    await h.http.get('/v1/admin/users').set('Authorization', auth).expect(200);

    // A new session on another device must verify again; the same code cannot be replayed.
    const second = await signIn(h, first.user.phone);
    const auth2 = `Bearer ${second.tokens.accessToken}`;
    await h.http.get('/v1/admin/users').set('Authorization', auth2).expect(403);
    const replay = await h.http
      .post('/v1/auth/mfa/totp/verify')
      .set('Authorization', auth2)
      .send({ code: currentTotp(setup.body.secret) })
      .expect(422);
    expect(replay.body.error.code).toBe('TOTP_INVALID');
    await h.http
      .post('/v1/auth/mfa/totp/verify')
      .set('Authorization', auth2)
      .send({ code: currentTotp(setup.body.secret, 1) })
      .expect(200);
    await h.http.get('/v1/admin/users').set('Authorization', auth2).expect(200);

    const actions = (
      await h.db.selectFrom('audit_logs').select('action').orderBy('created_at').execute()
    ).map((r) => r.action);
    expect(actions).toEqual(['admin.user.role_assigned', 'auth.mfa.enabled', 'auth.mfa.verified']);
  });

  it('expires MFA verification after the configured time', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    await h.http.get('/v1/admin/users').set('Authorization', admin.auth).expect(200);
    await h.db
      .updateTable('user_sessions')
      .set({ mfa_verified_at: new Date(Date.now() - 13 * 3_600_000) })
      .execute();
    const res = await h.http.get('/v1/admin/users').set('Authorization', admin.auth).expect(403);
    expect(res.body.error).toMatchObject({ code: 'MFA_REQUIRED', details: { enrolled: true } });
  });

  it('rate-limits TOTP guesses', async () => {
    const first = await signIn(h, nextPhone());
    await grantRole(h, first.user.id, 'admin');
    const auth = `Bearer ${first.tokens.accessToken}`;
    await h.http.post('/v1/auth/mfa/totp/setup').set('Authorization', auth).expect(200);
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      statuses.push(
        (
          await h.http
            .post('/v1/auth/mfa/totp/activate')
            .set('Authorization', auth)
            .send({ code: '000001' })
        ).status,
      );
    }
    expect(statuses.at(-1)).toBe(429);
  });

  it('resets MFA and signs the user out everywhere', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    await h.app.get(MfaService).reset(admin.userId, { type: 'system' });
    const res = await h.http.get('/v1/me').set('Authorization', admin.auth).expect(401);
    expect(res.body.error.code).toBe('SESSION_REVOKED');
    const user = await h.db
      .selectFrom('users')
      .select(['totp_enabled_at', 'totp_secret_encrypted'])
      .where('id', '=', admin.userId)
      .executeTakeFirstOrThrow();
    expect(user).toEqual({ totp_enabled_at: null, totp_secret_encrypted: null });
  });
});

describe('role management', () => {
  it('lets an admin assign ordinary roles but not privileged ones', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const target = await signIn(h, nextPhone());

    const res = await h.http
      .post(`/v1/admin/users/${target.user.id}/roles`)
      .set('Authorization', admin.auth)
      .send({ role: 'driver' })
      .expect(200);
    expect(res.body.roles).toEqual(['driver', 'passenger']);

    // Assigning again is a no-op and is not audited twice.
    await h.http
      .post(`/v1/admin/users/${target.user.id}/roles`)
      .set('Authorization', admin.auth)
      .send({ role: 'driver' })
      .expect(200);

    const denied = await h.http
      .post(`/v1/admin/users/${target.user.id}/roles`)
      .set('Authorization', admin.auth)
      .send({ role: 'admin' })
      .expect(403);
    expect(denied.body.error.details).toEqual({ missing: ['roles.assign_privileged'] });

    const logs = await h.db
      .selectFrom('audit_logs')
      .selectAll()
      .where('action', '=', 'admin.user.role_assigned')
      .where('actor_user_id', '=', admin.userId)
      .execute();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ target_id: target.user.id, metadata: { role: 'driver' } });
    expect(logs[0]!.ip).toBeTruthy();
  });

  it('takes effect immediately on existing tokens', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'super_admin');
    const target = await signIn(h, nextPhone());
    const auth = `Bearer ${target.tokens.accessToken}`;
    await h.http.get('/v1/admin/roles').set('Authorization', auth).expect(403);
    await h.http
      .post(`/v1/admin/users/${target.user.id}/roles`)
      .set('Authorization', admin.auth)
      .send({ role: 'admin' })
      .expect(200);
    // Same access token, new permissions — but MFA is now required.
    const res = await h.http.get('/v1/admin/roles').set('Authorization', auth).expect(403);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('never removes the last active super admin', async () => {
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const res = await h.http
      .delete(`/v1/admin/users/${root.userId}/roles/super_admin`)
      .set('Authorization', root.auth)
      .expect(409);
    expect(res.body.error.code).toBe('LAST_SUPER_ADMIN');

    const second = await signInWithMfa(h, nextPhone(), 'super_admin');
    await h.http
      .delete(`/v1/admin/users/${root.userId}/roles/super_admin`)
      .set('Authorization', second.auth)
      .expect(200);
    const again = await h.http
      .delete(`/v1/admin/users/${second.userId}/roles/super_admin`)
      .set('Authorization', second.auth)
      .expect(409);
    expect(again.body.error.code).toBe('LAST_SUPER_ADMIN');
  });

  it('serialises concurrent removals so one super admin always remains', async () => {
    const a = await signInWithMfa(h, nextPhone(), 'super_admin');
    const b = await signInWithMfa(h, nextPhone(), 'super_admin');
    const [r1, r2] = await Promise.all([
      h.http.delete(`/v1/admin/users/${b.userId}/roles/super_admin`).set('Authorization', a.auth),
      h.http.delete(`/v1/admin/users/${a.userId}/roles/super_admin`).set('Authorization', b.auth),
    ]);
    // Exactly one succeeds. The other is refused either as LAST_SUPER_ADMIN (409)
    // or, if it is checked after the first commits, because its actor is no
    // longer a super admin (403). Both keep the invariant below.
    const statuses = [r1.status, r2.status].sort();
    expect(statuses[0]).toBe(200);
    expect([403, 409]).toContain(statuses[1]);
    const { n } = await h.db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('r.key', '=', 'super_admin')
      .executeTakeFirstOrThrow();
    expect(Number(n)).toBe(1);
  });

  it('lists roles with their permissions', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const res = await h.http.get('/v1/admin/roles').set('Authorization', admin.auth).expect(200);
    const superAdmin = res.body.find((r: { key: string }) => r.key === 'super_admin');
    expect(superAdmin.permissions).toContain('roles.assign_privileged');
    expect(res.body.find((r: { key: string }) => r.key === 'passenger')).toMatchObject({
      requiresMfa: false,
      permissions: [],
    });
  });
});

describe('suspension', () => {
  it('suspends a user, ends their sessions, and blocks sign-in until reactivated', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const phone = nextPhone();
    const target = await signIn(h, phone);

    await h.http
      .post(`/v1/admin/users/${target.user.id}/suspend`)
      .set('Authorization', admin.auth)
      .send({ reason: 'Fraud report #12' })
      .expect(200);
    await h.http
      .get('/v1/me')
      .set('Authorization', `Bearer ${target.tokens.accessToken}`)
      .expect(401);
    await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: target.tokens.refreshToken })
      .expect(401);

    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: h.sms.lastCodeFor(phone), acceptedPolicyVersion: '2026-11' })
      .expect(403);

    await h.http
      .post(`/v1/admin/users/${target.user.id}/reactivate`)
      .set('Authorization', admin.auth)
      .expect(200);
    await h.redis.del(`otp:cooldown:${phone}`);
    await signIn(h, phone);

    const actions = (
      await h.db
        .selectFrom('audit_logs')
        .select('action')
        .where('target_id', '=', target.user.id)
        .orderBy('created_at')
        .execute()
    ).map((r) => r.action);
    expect(actions).toEqual(['admin.user.suspended', 'admin.user.reactivated']);
  });

  it('stops admins suspending staff, themselves, or the last super admin', async () => {
    const root = await signInWithMfa(h, nextPhone(), 'super_admin');
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    await h.http
      .post(`/v1/admin/users/${root.userId}/suspend`)
      .set('Authorization', admin.auth)
      .send({ reason: 'test' })
      .expect(403);
    await h.http
      .post(`/v1/admin/users/${admin.userId}/suspend`)
      .set('Authorization', admin.auth)
      .send({ reason: 'test' })
      .expect(403);
    // A super admin may suspend an admin.
    await h.http
      .post(`/v1/admin/users/${admin.userId}/suspend`)
      .set('Authorization', root.auth)
      .send({ reason: 'Left the company' })
      .expect(200);
  });
});

describe('user list and audit log', () => {
  it('paginates users with a stable cursor and searches by phone or name', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const phones: string[] = [];
    for (let i = 0; i < 5; i++) {
      const phone = nextPhone();
      phones.push(phone);
      const u = await signIn(h, phone);
      await h.http
        .patch('/v1/me')
        .set('Authorization', `Bearer ${u.tokens.accessToken}`)
        .send({ fullName: `Rider ${i}` })
        .expect(200);
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res: { body: { items: { id: string }[]; nextCursor: string | null } } = await h.http
        .get('/v1/admin/users')
        .query({ limit: 2, ...(cursor && { cursor }) })
        .set('Authorization', admin.auth)
        .expect(200);
      seen.push(...res.body.items.map((u) => u.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(seen).toHaveLength(6);
    expect(new Set(seen).size).toBe(6);

    const byPhone = await h.http
      .get('/v1/admin/users')
      .query({ search: `0${phones[2]!.slice(4)}` })
      .set('Authorization', admin.auth)
      .expect(200);
    expect(byPhone.body.items.map((u: { phone: string }) => u.phone)).toEqual([phones[2]]);
    const byName = await h.http
      .get('/v1/admin/users')
      .query({ search: 'rider 3' })
      .set('Authorization', admin.auth)
      .expect(200);
    expect(byName.body.items).toHaveLength(1);
    const byRole = await h.http
      .get('/v1/admin/users')
      .query({ role: 'admin' })
      .set('Authorization', admin.auth)
      .expect(200);
    expect(byRole.body.items.map((u: { id: string }) => u.id)).toEqual([admin.userId]);

    await h.http
      .get('/v1/admin/users')
      .query({ cursor: 'nonsense' })
      .set('Authorization', admin.auth)
      .expect(422);
  });

  it('lists audit entries and the table is append-only', async () => {
    const admin = await signInWithMfa(h, nextPhone(), 'admin');
    const res = await h.http
      .get('/v1/admin/audit-logs')
      .query({ actorUserId: admin.userId })
      .set('Authorization', admin.auth)
      .expect(200);
    expect(res.body.items.map((e: { action: string }) => e.action)).toEqual(['auth.mfa.enabled']);

    await expect(
      sql`UPDATE audit_logs SET action = 'tampered.entry'`.execute(h.db),
    ).rejects.toThrow(/append-only/);
    await expect(sql`DELETE FROM audit_logs`.execute(h.db)).rejects.toThrow(/append-only/);
  });
});
