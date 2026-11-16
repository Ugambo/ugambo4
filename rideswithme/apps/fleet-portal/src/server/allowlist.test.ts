import { describe, expect, it } from 'vitest';
import { isAllowedFleetPath } from './allowlist';

describe('fleet portal proxy allowlist', () => {
  it.each([
    'v1/me',
    'v1/fleet',
    'v1/fleet/drivers',
    'v1/fleet/trips',
    'v1/fleet/drivers/0b1c6f0e-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
  ])('allows %s', (p) => expect(isAllowedFleetPath(p)).toBe(true));
  it.each([
    'v1/admin/fleets',
    'v1/admin/users',
    'v1/driver/fleet',
    'v1/rides',
    'v1/wallet',
    'v1/fleet/../admin/users',
  ])('refuses %s', (p) => expect(isAllowedFleetPath(p)).toBe(false));
});
