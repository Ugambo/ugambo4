import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  otpauthUrl,
  totpStep,
  verifyTotp,
} from './totp';

// RFC 6238 Appendix B, SHA-1 key "12345678901234567890".
const rfcKey = Buffer.from('12345678901234567890');

describe('TOTP', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
  ])('matches RFC 6238 vector at T=%i', (seconds, expected) => {
    expect(hotp(rfcKey, Math.floor(seconds / 30), 8)).toBe(expected);
  });

  it('round-trips base32', () => {
    expect(base32Decode(base32Encode(rfcKey)).equals(rfcKey)).toBe(true);
    expect(base32Encode(Buffer.from('foobar'))).toBe('MZXW6YTBOI');
  });

  it('verifies codes within one step of drift and returns the step', () => {
    const secret = generateTotpSecret();
    const now = Date.UTC(2026, 10, 12, 12, 0, 15);
    const step = totpStep(now);
    const code = hotp(base32Decode(secret), step);
    expect(verifyTotp(secret, code, now)).toBe(step);
    expect(verifyTotp(secret, code, now + 30_000)).toBe(step);
    expect(verifyTotp(secret, code, now + 90_000)).toBeNull();
    expect(verifyTotp(secret, 'abcdef', now)).toBeNull();
  });

  it('builds an otpauth URL', () => {
    expect(otpauthUrl('ABC', '+234803*****67')).toMatch(
      /^otpauth:\/\/totp\/RideswithMe%3A%2B234803\*\*\*\*\*67\?secret=ABC&issuer=RideswithMe/,
    );
  });
});
