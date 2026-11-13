import { randomBytes } from 'node:crypto';
import { type AppConfig, loadConfig } from '../src/config/config';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://rwm:rwm@localhost:5432/rideswithme_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
export const TEST_POLICY_VERSION = '2026-11';
export const TEST_S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? 'http://127.0.0.1:9000';

/** Generated once per test run and shared by every app instance, as real replicas share secrets. */
const SECRETS = {
  jwt: randomBytes(32).toString('hex'),
  pepper: randomBytes(32).toString('hex'),
  fieldKey: randomBytes(32).toString('base64'),
  lookup: randomBytes(32).toString('hex'),
};

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    JWT_ACCESS_SECRET: SECRETS.jwt,
    OTP_PEPPER: SECRETS.pepper,
    FIELD_ENCRYPTION_KEYS: `test:${SECRETS.fieldKey}`,
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'test',
    CURRENT_POLICY_VERSION: TEST_POLICY_VERSION,
    SMS_PROVIDER: 'console',
    LOOKUP_HASH_SECRET: SECRETS.lookup,
    S3_ENDPOINT: TEST_S3_ENDPOINT,
    S3_BUCKET: process.env.TEST_S3_BUCKET ?? 'rideswithme-test',
    S3_ACCESS_KEY_ID: process.env.TEST_S3_ACCESS_KEY_ID ?? 'test',
    S3_SECRET_ACCESS_KEY: process.env.TEST_S3_SECRET_ACCESS_KEY ?? 'testtesttest',
    S3_FORCE_PATH_STYLE: 'true',
    S3_SERVER_SIDE_ENCRYPTION: process.env.TEST_S3_SSE ?? 'AES256',
    S3_CREATE_BUCKET: 'true',
    DOCUMENT_EXPIRY_SWEEP_MINUTES: '0',
    MAPS_PROVIDER: 'fake',
    // Tests drive the dispatcher by calling tick() themselves.
    DISPATCH_INTERVAL_MS: '0',
    MAINTENANCE_INTERVAL_MINUTES: '0',
    PAYMENT_RECONCILE_INTERVAL_MINUTES: '0',
    ...overrides,
  });
}
