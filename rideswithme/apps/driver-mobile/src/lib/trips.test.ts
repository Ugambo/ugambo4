import { describe, expect, it } from 'vitest';
import type { DriverRideView } from '@rideswithme/shared-types';
import { cashToCollect, navigationUrl, secondsLeft, summarizeEarnings } from './trips';

const ride = (completedAt: string, net: number, status = 'completed'): DriverRideView =>
  ({
    status,
    completedAt,
    earnings: { fareKobo: net + 500, bookingFeeKobo: 100, commissionKobo: 400, netKobo: net },
  }) as unknown as DriverRideView;

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

  it('sums today and this week in Nigerian time', () => {
    // Thursday 12 Nov 2026, 00:30 in Lagos (23:30 UTC on the 11th).
    const now = Date.parse('2026-11-11T23:30:00Z');
    const rides = [
      ride('2026-11-11T23:10:00Z', 1000), // Thursday 00:10 Lagos: today
      ride('2026-11-11T22:50:00Z', 2000), // Wednesday 23:50 Lagos: this week, not today
      ride('2026-11-08T23:30:00Z', 4000), // Monday 00:30 Lagos: this week
      ride('2026-11-08T22:30:00Z', 8000), // Sunday 23:30 Lagos: last week
      ride('2026-11-11T23:15:00Z', 9999, 'cancelled_by_driver'),
    ];
    const s = summarizeEarnings(rides, now);
    expect(s.today).toEqual({ trips: 1, fareKobo: 1500, commissionKobo: 500, netKobo: 1000 });
    expect(s.week.trips).toBe(3);
    expect(s.week.netKobo).toBe(7000);
  });
});
