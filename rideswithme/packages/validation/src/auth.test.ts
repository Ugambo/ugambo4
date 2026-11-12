import { describe, expect, it } from 'vitest';
import { requestOtpSchema, updateMeSchema, verifyOtpSchema } from './auth';

describe('auth schemas', () => {
  it('normalises the phone number on OTP request', () => {
    expect(requestOtpSchema.parse({ phone: '0803 123 4567' })).toEqual({ phone: '+2348031234567' });
  });

  it('rejects unknown fields', () => {
    expect(requestOtpSchema.safeParse({ phone: '08031234567', admin: true }).success).toBe(false);
  });

  it('requires a 6-digit code and policy version on verify', () => {
    expect(
      verifyOtpSchema.safeParse({ phone: '08031234567', code: '12345', acceptedPolicyVersion: '1' })
        .success,
    ).toBe(false);
    const ok = verifyOtpSchema.parse({
      phone: '08031234567',
      code: '123456',
      acceptedPolicyVersion: '2026-11',
    });
    expect(ok.device.platform).toBe('unknown');
  });

  it('rejects empty profile updates and lowercases email', () => {
    expect(updateMeSchema.safeParse({}).success).toBe(false);
    expect(updateMeSchema.parse({ email: 'Ada@Example.COM' })).toEqual({
      email: 'ada@example.com',
    });
  });
});
