import { describe, expect, it } from 'vitest';
import { isAllowedFleetPath } from './allowlist';

describe('fleet portal proxy allowlist', () => {
  it.each([
    'v1/me',
    'v1/fleet',
    'v1/fleet/drivers',
    'v1/fleet/trips',
    'v1/fleet/drivers/0b1c6f0e-3a4b-4c5d-8e9f-0a1b2c3d4e5f',
    'v1/operator',
    'v1/operator/departures',
    'v1/operator/check-in',
    'v1/operator/departures/0b1c6f0e-3a4b-4c5d-8e9f-0a1b2c3d4e5f/cancel',
  ])('allows %s', (p) => expect(isAllowedFleetPath(p)).toBe(true));
  it.each([
    'v1/admin/fleets',
    'v1/admin/users',
    'v1/driver/fleet',
    'v1/rides',
    'v1/wallet',
    'v1/fleet/../admin/users',
    'v1/admin/bus-operators',
    'v1/bus/bookings',
    'v1/operator/departures/x/cancel',
  ])('refuses %s', (p) => expect(isAllowedFleetPath(p)).toBe(false));
});
