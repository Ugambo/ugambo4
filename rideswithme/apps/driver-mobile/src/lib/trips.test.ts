import { describe, expect, it } from 'vitest';
import { cashToCollect, navigationUrl, secondsLeft } from './trips';

describe('driver trip helpers', () => {
  it('counts down offers in whole seconds', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    expect(secondsLeft('2026-11-12T10:00:14.200Z', now)).toBe(15);
    expect(secondsLeft('2026-11-12T09:59:59Z', now)).toBe(0);
  });

  it('asks for the booked price plus waiting charge in cash', () => {
    expect(
      cashToCollect({
        fare: { quotedTotalKobo: 180_000, waitingChargeKobo: 14_000, finalTotalKobo: null },
      } as never),
    ).toBe(194_000);
    expect(
      cashToCollect({
        fare: { quotedTotalKobo: 180_000, waitingChargeKobo: 0, finalTotalKobo: 185_000 },
      } as never),
    ).toBe(185_000);
  });

  it('links to Google Maps directions', () => {
    expect(navigationUrl(12, 8.5)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=12,8.5&travelmode=driving',
    );
  });
});
