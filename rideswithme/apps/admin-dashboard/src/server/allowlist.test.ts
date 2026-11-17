import { describe, expect, it } from 'vitest';
import { isAllowedApiPath } from './allowlist';

describe('proxy allowlist', () => {
  it.each([
    'v1/me',
    'v1/admin/drivers',
    'v1/admin/drivers/abc/documents/def/view-url',
    'v1/auth/mfa/totp/verify',
    'v1/admin/bus-operators',
    'v1/admin/bus-bookings/abc/cancel',
    'v1/admin/settings',
    'v1/admin/vehicle-categories',
    'v1/admin/vehicle-categories/motorcycle',
    'v1/admin/branding/logo',
    'v1/admin/passenger-verifications/abc/approve',
  ])('allows %s', (p) => expect(isAllowedApiPath(p)).toBe(true));
  it.each([
    'v1/auth/refresh',
    'v1/auth/otp/verify',
    'health/ready',
    'v1/admin/../auth/refresh',
    'v1/driver/onboarding',
    'v1/me/x',
    'v1/admin/settings/x',
    'v1/admin/vehicle-categories/../users',
  ])('refuses %s', (p) => expect(isAllowedApiPath(p)).toBe(false));
});
