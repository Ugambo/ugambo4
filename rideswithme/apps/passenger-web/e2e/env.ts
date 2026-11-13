import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const OUT = path.join(__dirname, '.output');
export const API_LOG = path.join(OUT, 'api.log');
export const API_URL = 'http://127.0.0.1:3200';
export const WEB_URL = 'http://127.0.0.1:3202';
export const POLICY_VERSION = '2026-11';
export const PASSENGER_PHONE = '+2348035550001';
export const DRIVER_PHONE = '+2348035550002';
export const PAYING_PASSENGER_PHONE = '+2348035550003';
export const DRIVER_FILE = path.join(OUT, 'driver.json');

const s3 = process.env.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:9000';

/** Its own database and Redis db, so it can run beside the admin dashboard's tests. */
function ownDatabase(): string {
  const u = new URL(
    process.env.E2E_DATABASE_URL ?? 'postgres://rwm:rwm@localhost:5432/rideswithme_e2e',
  );
  u.pathname = `${u.pathname}_passenger`;
  return u.toString();
}
export const E2E_DATABASE_URL = ownDatabase();
const redis = new URL(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14');
redis.pathname = '/13';

export function apiEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: '3200',
    LOG_LEVEL: 'info',
    DATABASE_URL: E2E_DATABASE_URL,
    REDIS_URL: redis.toString(),
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    OTP_PEPPER: randomBytes(32).toString('hex'),
    LOOKUP_HASH_SECRET: randomBytes(32).toString('hex'),
    FIELD_ENCRYPTION_KEYS: `e2e:${randomBytes(32).toString('base64')}`,
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'e2e',
    CURRENT_POLICY_VERSION: POLICY_VERSION,
    SMS_PROVIDER: 'console',
    OTP_MAX_PER_IP_PER_HOUR: '1000',
    S3_ENDPOINT: s3,
    S3_BUCKET: 'rideswithme-e2e',
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? 'test',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'testtesttest',
    S3_FORCE_PATH_STYLE: 'true',
    S3_SERVER_SIDE_ENCRYPTION: process.env.TEST_S3_SSE ?? 'AES256',
    S3_CREATE_BUCKET: 'true',
    DOCUMENT_EXPIRY_SWEEP_MINUTES: '0',
    MAPS_PROVIDER: 'fake',
    CORS_ORIGINS: WEB_URL,
    PAYMENT_PROVIDER: 'fake',
    PUBLIC_API_URL: API_URL,
    PAYMENT_RETURN_URL_WEB: `${WEB_URL}/wallet`,
  };
}

export function webEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    API_URL,
    API_PUBLIC_URL: API_URL,
    PASSENGER_SESSION_SECRET: randomBytes(32).toString('base64'),
    POLICY_VERSION,
    STORAGE_ORIGIN: new URL(s3).origin,
    SESSION_COOKIE_SECURE: 'false',
  };
}
