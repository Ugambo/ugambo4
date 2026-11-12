import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness, nextPhone, resetState, signIn } from './harness';
import { TEST_POLICY_VERSION } from './env';

let h: Harness;
beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());
beforeEach(async () => resetState(h));

describe('phone OTP sign-in', () => {
  it('creates a passenger account on first sign-in and records consent', async () => {
    const phone = nextPhone();
    const res = await h.http
      .post('/v1/auth/otp/request')
      .send({ phone: `0${phone.slice(4)}` })
      .expect(200);
    expect(res.body).toEqual({ expiresInSeconds: 300, resendAfterSeconds: 60 });
    expect(h.sms.messages).toHaveLength(1);
    expect(h.sms.messages[0]!.to).toBe(phone);

    const verify = await h.http
      .post('/v1/auth/otp/verify')
      .send({
        phone,
        code: h.sms.lastCodeFor(phone),
        acceptedPolicyVersion: TEST_POLICY_VERSION,
        device: { name: 'Tecno Spark', platform: 'android' },
      })
      .expect(200);

    expect(verify.body.isNewUser).toBe(true);
    expect(verify.body.user).toMatchObject({
      phone,
      roles: ['passenger'],
      permissions: [],
      status: 'active',
      preferredLanguage: 'en',
    });
    expect(verify.body.tokens.accessToken).toBeTruthy();
    expect(verify.body.tokens.refreshToken).toMatch(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);

    const consent = await h.db.selectFrom('user_consents').selectAll().executeTakeFirstOrThrow();
    expect(consent).toMatchObject({
      user_id: verify.body.user.id,
      consent_type: 'terms_and_privacy',
      version: TEST_POLICY_VERSION,
    });

    const session = await h.db.selectFrom('user_sessions').selectAll().executeTakeFirstOrThrow();
    expect(session.device_name).toBe('Tecno Spark');
    // Only the hash of the refresh token is stored.
    expect(session.refresh_token_hash.toString('base64url')).not.toBe(
      verify.body.tokens.refreshToken.split('.')[1],
    );

    const again = await signIn(h, phone);
    expect(again.isNewUser).toBe(false);
    expect(again.user.id).toBe(verify.body.user.id);
  });

  it('never stores the code in plain text', async () => {
    const phone = nextPhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const stored = await h.redis.hgetall(`otp:code:${phone}`);
    expect(JSON.stringify(stored)).not.toContain(h.sms.lastCodeFor(phone));
  });

  it('sends the SMS in Hausa when asked', async () => {
    const phone = nextPhone();
    await h.http
      .post('/v1/auth/otp/request')
      .set('Accept-Language', 'ha-NG,en;q=0.5')
      .send({ phone })
      .expect(200);
    expect(h.sms.messages[0]!.text).toContain('Lambar tabbatarwarku');
  });

  it('rejects numbers that are not Nigerian mobiles', async () => {
    const res = await h.http
      .post('/v1/auth/otp/request')
      .send({ phone: '+447911123456' })
      .expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(h.sms.messages).toHaveLength(0);
  });

  it('enforces the resend cooldown with Retry-After', async () => {
    const phone = nextPhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const res = await h.http.post('/v1/auth/otp/request').send({ phone }).expect(429);
    expect(res.body.error.code).toBe('OTP_RESEND_TOO_SOON');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(h.sms.messages).toHaveLength(1);
  });

  it('limits codes per phone per hour', async () => {
    const phone = nextPhone();
    for (let i = 0; i < 5; i++) {
      await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
      await h.redis.del(`otp:cooldown:${phone}`);
    }
    const res = await h.http.post('/v1/auth/otp/request').send({ phone }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('limits codes per IP per hour across many phones', async () => {
    for (let i = 0; i < 20; i++)
      await h.http.post('/v1/auth/otp/request').send({ phone: nextPhone() }).expect(200);
    const res = await h.http.post('/v1/auth/otp/request').send({ phone: nextPhone() }).expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });

  it('counts wrong attempts and burns the code after five', async () => {
    const phone = nextPhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const code = h.sms.lastCodeFor(phone);
    const wrong = code === '000000' ? '111111' : '000000';
    const body = { phone, acceptedPolicyVersion: TEST_POLICY_VERSION };

    const first = await h.http
      .post('/v1/auth/otp/verify')
      .send({ ...body, code: wrong })
      .expect(422);
    expect(first.body.error).toMatchObject({
      code: 'OTP_INVALID',
      details: { attemptsRemaining: 4 },
    });
    for (let i = 0; i < 4; i++)
      await h.http
        .post('/v1/auth/otp/verify')
        .send({ ...body, code: wrong })
        .expect(422);

    const locked = await h.http
      .post('/v1/auth/otp/verify')
      .send({ ...body, code })
      .expect(429);
    expect(locked.body.error.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    const after = await h.http
      .post('/v1/auth/otp/verify')
      .send({ ...body, code })
      .expect(422);
    expect(after.body.error.code).toBe('OTP_EXPIRED');
  });

  it('accepts a code only once, even for parallel requests', async () => {
    const phone = nextPhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const body = {
      phone,
      code: h.sms.lastCodeFor(phone),
      acceptedPolicyVersion: TEST_POLICY_VERSION,
    };
    const results = await Promise.all(
      Array.from({ length: 5 }, () => h.http.post('/v1/auth/otp/verify').send(body)),
    );
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(await h.db.selectFrom('users').select('id').execute()).toHaveLength(1);
    expect(await h.db.selectFrom('user_sessions').select('id').execute()).toHaveLength(1);
  });

  it('requires the current policy version', async () => {
    const phone = nextPhone();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const res = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: h.sms.lastCodeFor(phone), acceptedPolicyVersion: 'old' })
      .expect(422);
    expect(res.body.error.details).toMatchObject({ currentPolicyVersion: TEST_POLICY_VERSION });
  });

  it('reports SMS failures and lets the person retry at once', async () => {
    const phone = nextPhone();
    h.sms.failNext = true;
    const res = await h.http.post('/v1/auth/otp/request').send({ phone }).expect(502);
    expect(res.body.error.code).toBe('SMS_DELIVERY_FAILED');
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
  });

  it('refuses sign-in for suspended accounts', async () => {
    const phone = nextPhone();
    const { user } = await signIn(h, phone);
    await h.db
      .updateTable('users')
      .set({ status: 'suspended' })
      .where('id', '=', user.id)
      .execute();
    await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
    const res = await h.http
      .post('/v1/auth/otp/verify')
      .send({ phone, code: h.sms.lastCodeFor(phone), acceptedPolicyVersion: TEST_POLICY_VERSION })
      .expect(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });
});

describe('access and refresh tokens', () => {
  it('rejects missing and malformed access tokens with a request id', async () => {
    const res = await h.http.get('/v1/me').set('X-Request-Id', 'test-req-1').expect(401);
    expect(res.body).toEqual({
      error: { code: 'UNAUTHENTICATED', message: 'Missing access token' },
      requestId: 'test-req-1',
    });
    expect(res.headers['x-request-id']).toBe('test-req-1');
    await h.http.get('/v1/me').set('Authorization', 'Bearer not-a-jwt').expect(401);
  });

  it('rotates refresh tokens', async () => {
    const { tokens } = await signIn(h, nextPhone());
    const res = await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    expect(res.body.refreshToken).not.toBe(tokens.refreshToken);
    await h.http.get('/v1/me').set('Authorization', `Bearer ${res.body.accessToken}`).expect(200);
    const next = await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: res.body.refreshToken })
      .expect(200);
    expect(next.body.refreshToken).not.toBe(res.body.refreshToken);
  });

  it('allows a retry with the previous token inside the grace window (lost response)', async () => {
    const { tokens } = await signIn(h, nextPhone());
    const lost = await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    const retry = await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    // The token from the lost response is no longer valid; the retry's token is.
    await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: lost.body.refreshToken })
      .expect(401);
    void retry;
  });

  it('handles parallel refreshes with the same token without signing the user out', async () => {
    const { tokens } = await signIn(h, nextPhone());
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        h.http.post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual([200, 200, 200]);
    const session = await h.db.selectFrom('user_sessions').selectAll().executeTakeFirstOrThrow();
    expect(session.revoked_at).toBeNull();
  });

  it('revokes the session when an old refresh token is reused after the grace window', async () => {
    const { tokens } = await signIn(h, nextPhone());
    const fresh = await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);
    await h.db
      .updateTable('user_sessions')
      .set({ rotated_at: new Date(Date.now() - 5 * 60_000) })
      .execute();

    const reuse = await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(401);
    expect(reuse.body.error.code).toBe('REFRESH_TOKEN_INVALID');

    // The legitimate holder is signed out too, which is the point: one of them is an attacker.
    await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: fresh.body.refreshToken })
      .expect(401);
    const me = await h.http
      .get('/v1/me')
      .set('Authorization', `Bearer ${fresh.body.accessToken}`)
      .expect(401);
    expect(me.body.error.code).toBe('SESSION_REVOKED');

    const session = await h.db.selectFrom('user_sessions').selectAll().executeTakeFirstOrThrow();
    expect(session.revoked_reason).toBe('refresh_token_reuse');
    const audit = await h.db.selectFrom('audit_logs').selectAll().executeTakeFirstOrThrow();
    expect(audit).toMatchObject({
      action: 'auth.session.refresh_token_reused',
      actor_type: 'system',
    });
  });

  it('rejects garbage and expired refresh tokens', async () => {
    await h.http.post('/v1/auth/refresh').send({ refreshToken: 'garbage-token-value' }).expect(401);
    const { tokens } = await signIn(h, nextPhone());
    await h.db
      .updateTable('user_sessions')
      .set({ idle_expires_at: new Date(Date.now() - 1000) })
      .execute();
    await h.http.post('/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }).expect(401);
  });

  it('logs out the current session only', async () => {
    const phone = nextPhone();
    const phoneA = await signIn(h, phone, { name: 'Phone A', platform: 'android' });
    const phoneB = await signIn(h, phone, { name: 'Phone B', platform: 'ios' });

    const list = await h.http
      .get('/v1/auth/sessions')
      .set('Authorization', `Bearer ${phoneA.tokens.accessToken}`)
      .expect(200);
    expect(list.body).toHaveLength(2);
    expect(list.body.find((s: { current: boolean }) => s.current).deviceName).toBe('Phone A');

    await h.http
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${phoneA.tokens.accessToken}`)
      .expect(204);
    await h.http
      .get('/v1/me')
      .set('Authorization', `Bearer ${phoneA.tokens.accessToken}`)
      .expect(401);
    await h.http
      .post('/v1/auth/refresh')
      .send({ refreshToken: phoneA.tokens.refreshToken })
      .expect(401);
    await h.http
      .get('/v1/me')
      .set('Authorization', `Bearer ${phoneB.tokens.accessToken}`)
      .expect(200);
  });

  it('lets a user sign out another of their devices but not someone else’s', async () => {
    const phone = nextPhone();
    const a = await signIn(h, phone);
    const b = await signIn(h, phone);
    const stranger = await signIn(h, nextPhone());
    const bSessionId = b.tokens.refreshToken.split('.')[0];
    await h.http
      .delete(`/v1/auth/sessions/${bSessionId}`)
      .set('Authorization', `Bearer ${stranger.tokens.accessToken}`)
      .expect(404);
    await h.http
      .delete(`/v1/auth/sessions/${bSessionId}`)
      .set('Authorization', `Bearer ${a.tokens.accessToken}`)
      .expect(204);
    await h.http.get('/v1/me').set('Authorization', `Bearer ${b.tokens.accessToken}`).expect(401);
  });
});

describe('profile', () => {
  it('updates name, email and language; email starts unverified and must be unique', async () => {
    const a = await signIn(h, nextPhone());
    const b = await signIn(h, nextPhone());
    const res = await h.http
      .patch('/v1/me')
      .set('Authorization', `Bearer ${a.tokens.accessToken}`)
      .send({ fullName: 'Amina Bello', email: 'Amina@Example.com', preferredLanguage: 'ha' })
      .expect(200);
    expect(res.body).toMatchObject({
      fullName: 'Amina Bello',
      email: 'amina@example.com',
      emailVerified: false,
      preferredLanguage: 'ha',
    });

    const clash = await h.http
      .patch('/v1/me')
      .set('Authorization', `Bearer ${b.tokens.accessToken}`)
      .send({ email: 'AMINA@example.com' })
      .expect(409);
    expect(clash.body.error.code).toBe('CONFLICT');
  });

  it('rejects unknown fields so clients cannot set status or roles', async () => {
    const a = await signIn(h, nextPhone());
    await h.http
      .patch('/v1/me')
      .set('Authorization', `Bearer ${a.tokens.accessToken}`)
      .send({ status: 'active' })
      .expect(422);
  });
});

describe('health', () => {
  it('reports database and Redis status', async () => {
    await h.http.get('/health/live').expect(200, { status: 'ok' });
    await h.http.get('/health/ready').expect(200, { status: 'ok', database: 'ok', redis: 'ok' });
  });
});
