import { randomBytes } from 'node:crypto';
import { type AppConfig, loadConfig } from '../src/config/config';

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://rwm:rwm@localhost:5432/rideswithme_test';
export const TEST_REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
export const TEST_POLICY_VERSION = '2026-11';

export function testConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    OTP_PEPPER: randomBytes(32).toString('hex'),
    FIELD_ENCRYPTION_KEYS: `test:${randomBytes(32).toString('base64')}`,
    FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'test',
    CURRENT_POLICY_VERSION: TEST_POLICY_VERSION,
    SMS_PROVIDER: 'console',
    ...overrides,
  });
}
