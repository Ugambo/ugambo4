import { describe, expect, it } from 'vitest';
import { isAllowedPassengerPath } from './allowlist';

describe('passenger proxy allowlist', () => {
  it.each([
    'v1/me',
    'v1/fares/estimate',
    'v1/rides',
    'v1/rides/active',
    'v1/rides/0b1c6f0e-3a4b-4c5d-8e9f-0a1b2c3d4e5f/cancel',
    'v1/places/details/fake:kano-airport',
  ])('allows %s', (p) => expect(isAllowedPassengerPath(p)).toBe(true));
  it.each([
    'v1/admin/users',
    'v1/driver/offers/current',
    'v1/auth/refresh',
    'v1/auth/realtime-ticket',
    'v1/rides/x/../../admin',
  ])('refuses %s', (p) => expect(isAllowedPassengerPath(p)).toBe(false));
});
