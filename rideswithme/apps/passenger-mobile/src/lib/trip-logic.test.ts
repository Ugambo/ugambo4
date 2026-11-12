import { describe, expect, it } from 'vitest';
import { canCancel, cancellationFeeNow, positionAge, ridePhase, scheduleSlots } from './trip-logic';

describe('trip logic', () => {
  it('maps ride statuses to screens', () => {
    expect(ridePhase({ status: 'searching', scheduledFor: null })).toBe('searching');
    expect(ridePhase({ status: 'driver_arrived', scheduledFor: null })).toBe('driver_here');
    expect(ridePhase({ status: 'requested', scheduledFor: '2026-11-12T10:00:00Z' })).toBe(
      'scheduled',
    );
    expect(ridePhase({ status: 'cancelled_by_driver', scheduledFor: null })).toBe('cancelled');
  });

  it('allows cancelling only before the trip starts', () => {
    expect(canCancel('driver_arrived')).toBe(true);
    expect(canCancel('in_progress')).toBe(false);
    expect(canCancel('completed')).toBe(false);
  });

  it('never shows an old driver position as live', () => {
    const now = Date.parse('2026-11-12T10:00:00Z');
    const fresh = {
      lat: 1,
      lng: 1,
      recordedAt: '2026-11-12T09:59:50Z',
      receivedAt: '2026-11-12T09:59:55Z',
    };
    const old = { ...fresh, receivedAt: '2026-11-12T09:58:00Z' };
    expect(positionAge(fresh, now)).toEqual({ stale: false, seconds: 5 });
    expect(positionAge(old, now)).toEqual({ stale: true, seconds: 120 });
    expect(positionAge(null, now)).toBeNull();
  });

  it('offers schedule slots every 15 minutes from 30 minutes ahead', () => {
    const slots = scheduleSlots(new Date('2026-11-12T10:07:00Z'), 2);
    expect(slots[0]!.toISOString()).toBe('2026-11-12T10:45:00.000Z');
    expect(slots[1]!.toISOString()).toBe('2026-11-12T11:00:00.000Z');
    expect(slots.at(-1)!.toISOString()).toBe('2026-11-12T12:00:00.000Z');
  });

  it('warns about the cancellation fee exactly when the server would charge it', () => {
    const fare = { cancellationPolicy: { feeKobo: 30_000, graceSeconds: 120 } } as never;
    const assignedAt = '2026-11-12T10:00:00Z';
    expect(cancellationFeeNow({ status: 'searching', assignedAt: null, fare })).toBe(0);
    expect(
      cancellationFeeNow(
        { status: 'driver_assigned', assignedAt, fare },
        Date.parse('2026-11-12T10:01:59Z'),
      ),
    ).toBe(0);
    expect(
      cancellationFeeNow(
        { status: 'driver_assigned', assignedAt, fare },
        Date.parse('2026-11-12T10:02:01Z'),
      ),
    ).toBe(30_000);
    expect(cancellationFeeNow({ status: 'driver_arrived', assignedAt, fare })).toBe(30_000);
  });
});
