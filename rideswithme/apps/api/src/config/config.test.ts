import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

/** The .env.example as a new developer gets it, with secrets filled in by `pnpm setup:local`. */
function exampleEnv(): Record<string, string> {
  const text = readFileSync(path.join(__dirname, '../../.env.example'), 'utf8');
  const env: Record<string, string> = {};
  // Windows checkouts (git core.autocrlf) end lines with \r\n.
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]!] = m[2]!;
  }
  return {
    ...env,
    JWT_ACCESS_SECRET: randomBytes(32).toString('hex'),
    OTP_PEPPER: randomBytes(32).toString('hex'),
    LOOKUP_HASH_SECRET: randomBytes(32).toString('hex'),
    FIELD_ENCRYPTION_KEYS: `k1:${randomBytes(32).toString('base64')}`,
  };
}

describe('configuration', () => {
  it('accepts the example settings file once its secrets are filled in', () => {
    const c = loadConfig(exampleEnv());
    expect(c.PORT).toBe(3000);
    expect(c.S3_PUBLIC_ENDPOINT).toBeUndefined();
    expect(c.SOS_ALERT_PHONES).toEqual([]);
  });

  it('treats blank lines as not set, and still names what is missing', () => {
    expect(() => loadConfig({ ...exampleEnv(), JWT_ACCESS_SECRET: '' })).toThrow(
      /JWT_ACCESS_SECRET/,
    );
  });
});
