import { randomBytes } from 'node:crypto';
import path from 'node:path';

export const OUT = path.join(__dirname, '.output');
export const API_LOG = path.join(OUT, 'api.log');
export const API_URL = 'http://127.0.0.1:3300';
export const PORTAL_URL = 'http://127.0.0.1:3303';
export const POLICY_VERSION = '2026-11';
export const STAFF_PHONE = '+2348030000101';
export const MANAGER_PHONE = '+2348030000102';
export const OTHER_MANAGER_PHONE = '+2348030000103';
export const DRIVER_PHONE = '+2348031110101';
export const OTHER_DRIVER_PHONE = '+2348031110102';
export const STATE_FILE = path.join(OUT, 'scenario.json');

const s3 = process.env.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:9000';

/** Its own database and Redis db, so it can run beside the other web apps' tests. */
const db = new URL(
  process.env.E2E_DATABASE_URL ?? 'postgres://rwm:rwm@localhost:5432/rideswithme_e2e',
);
db.pathname = `${db.pathname}_fleet`;
export const E2E_DATABASE_URL = db.toString();
const redis = new URL(process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14');
redis.pathname = '/12';

export function apiEnv(): Record<string, string> {
  return {
    NODE_ENV: 'test',
    PORT: '3300',
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
  };
}

export function portalEnv(): Record<string, string> {
  return {
    NODE_ENV: 'production',
    API_URL,
    FLEET_SESSION_SECRET: randomBytes(32).toString('base64'),
    POLICY_VERSION,
    SESSION_COOKIE_SECURE: 'false',
  };
}
