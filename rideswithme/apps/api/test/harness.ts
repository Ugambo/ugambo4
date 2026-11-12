import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type Redis from 'ioredis';
import { type Kysely, sql } from 'kysely';
import request from 'supertest';
import type { RoleKey, VerifyOtpResponse } from '@rideswithme/shared-types';
import { AdminService } from '../src/admin/admin.service';
import { AppModule } from '../src/app.module';
import { base32Decode, hotp, totpStep } from '../src/auth/totp';
import { configureApp } from '../src/bootstrap';
import type { AppConfig } from '../src/config/config';
import { DB } from '../src/database/database.module';
import type { Database } from '../src/database/types';
import { REDIS } from '../src/redis/redis.module';
import { SMS_PROVIDER, type SmsMessage, type SmsProvider } from '../src/sms/sms.provider';
import { TEST_POLICY_VERSION, testConfig } from './env';

export class CapturingSmsProvider implements SmsProvider {
  readonly name = 'capture';
  messages: SmsMessage[] = [];
  failNext = false;

  async send(message: SmsMessage) {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('simulated SMS outage');
    }
    this.messages.push(message);
  }

  lastCodeFor(phone: string): string {
    const msg = [...this.messages].reverse().find((m) => m.to === phone);
    const code = msg?.text.match(/\b(\d{6})\b/)?.[1];
    if (!code) throw new Error(`No OTP sent to ${phone}`);
    return code;
  }
}

export interface Harness {
  app: INestApplication;
  http: ReturnType<typeof request>;
  sms: CapturingSmsProvider;
  db: Kysely<Database>;
  redis: Redis;
  config: AppConfig;
  close(): Promise<void>;
}

export async function createHarness(overrides: Record<string, string> = {}): Promise<Harness> {
  const config = testConfig(overrides);
  const sms = new CapturingSmsProvider();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] })
    .overrideProvider(SMS_PROVIDER)
    .useValue(sms)
    .compile();
  const app = moduleRef.createNestApplication({ bodyParser: false, logger: false });
  configureApp(app, config);
  await app.init();
  const db = app.get<Kysely<Database>>(DB);
  const redis = app.get<Redis>(REDIS);
  return {
    app,
    http: request(app.getHttpServer()),
    sms,
    db,
    redis,
    config,
    close: () => app.close(),
  };
}

/** Empties every table and Redis between tests (reference data is re-used). */
export async function resetState(h: Harness) {
  // TRUNCATE does not fire the row-level append-only trigger on audit_logs.
  await sql`TRUNCATE audit_logs, user_consents, user_sessions, user_roles, users CASCADE`.execute(
    h.db,
  );
  await h.redis.flushdb();
  h.sms.messages = [];
}

let phoneCounter = 0;
/** Unique valid Nigerian numbers for tests. */
export function nextPhone(): string {
  phoneCounter++;
  return `+234803${String(1_000_000 + phoneCounter).slice(-7)}`;
}

export async function signIn(
  h: Harness,
  phone: string,
  device: { name?: string; platform?: string } = {},
): Promise<VerifyOtpResponse> {
  await h.http.post('/v1/auth/otp/request').send({ phone }).expect(200);
  const res = await h.http
    .post('/v1/auth/otp/verify')
    .send({
      phone,
      code: h.sms.lastCodeFor(phone),
      acceptedPolicyVersion: TEST_POLICY_VERSION,
      device,
    })
    .expect(200);
  // Allow another sign-in for the same phone straight away.
  await h.redis.del(`otp:cooldown:${phone}`);
  return res.body as VerifyOtpResponse;
}

export async function grantRole(h: Harness, userId: string, role: RoleKey) {
  await h.app.get(AdminService).assignRole(userId, role, { type: 'system' }, {});
}

export function currentTotp(secret: string, stepOffset = 0): string {
  return hotp(base32Decode(secret), totpStep() + stepOffset);
}

/** Signs in, enrols TOTP and returns an access token that has passed MFA. */
export async function signInWithMfa(h: Harness, phone: string, role: RoleKey) {
  const first = await signIn(h, phone);
  await grantRole(h, first.user.id, role);
  const auth = `Bearer ${first.tokens.accessToken}`;
  const setup = await h.http.post('/v1/auth/mfa/totp/setup').set('Authorization', auth).expect(200);
  await h.http
    .post('/v1/auth/mfa/totp/activate')
    .set('Authorization', auth)
    .send({ code: currentTotp(setup.body.secret as string) })
    .expect(200);
  return { userId: first.user.id, auth, secret: setup.body.secret as string, tokens: first.tokens };
}
