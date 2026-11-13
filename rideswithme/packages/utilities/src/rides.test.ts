import { describe, expect, it } from 'vitest';
import type { RideView } from '@rideswithme/shared-types';
import {
  applyActiveRides,
  applyRideUpdate,
  canCancel,
  cancellationFeeNow,
  type PassengerRides,
  positionAge,
  paymentSummary,
  ridePhase,
  scheduleSlots,
  toPlaceInput,
} from './rides';

describe('passenger ride logic', () => {
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

describe('passenger ride updates', () => {
  const ride = (id: string, status: RideView['status']) => ({ id, status }) as RideView;

  it('keeps scheduled rides in their own list until they start', () => {
    let s: PassengerRides = { current: null, scheduled: [] };
    s = applyRideUpdate(s, ride('a', 'requested'));
    expect(s).toEqual({ current: null, scheduled: [ride('a', 'requested')] });
    s = applyRideUpdate(s, ride('a', 'searching'));
    expect(s).toEqual({ current: ride('a', 'searching'), scheduled: [] });
  });

  it('does not replace an active ride with another ride’s update', () => {
    const s = applyRideUpdate(
      { current: ride('a', 'in_progress'), scheduled: [] },
      ride('b', 'searching'),
    );
    expect(s.current?.id).toBe('a');
  });

  it('replaces a finished ride, and updates the same ride', () => {
    expect(
      applyRideUpdate({ current: ride('a', 'completed'), scheduled: [] }, ride('b', 'searching'))
        .current?.id,
    ).toBe('b');
    expect(
      applyRideUpdate(
        { current: ride('a', 'driver_assigned'), scheduled: [] },
        ride('a', 'driver_arrived'),
      ).current?.status,
    ).toBe('driver_arrived');
  });

  it('keeps a receipt on screen when the API has no active ride', () => {
    const done = ride('a', 'completed');
    expect(applyActiveRides({ current: done, scheduled: [] }, [])).toEqual({
      current: done,
      scheduled: [],
    });
    expect(
      applyActiveRides({ current: ride('a', 'in_progress'), scheduled: [] }, []).current,
    ).toBeNull();
    expect(
      applyActiveRides({ current: null, scheduled: [] }, [
        ride('s', 'requested'),
        ride('b', 'searching'),
      ]),
    ).toEqual({
      current: ride('b', 'searching'),
      scheduled: [ride('s', 'requested')],
    });
  });

  it('drops empty optional place fields for the API', () => {
    expect(
      toPlaceInput({ address: 'X', location: { lat: 1, lng: 2 }, name: null, placeId: null }),
    ).toEqual({
      address: 'X',
      location: { lat: 1, lng: 2 },
    });
  });
});

describe('paymentSummary', () => {
  const ride = (payment: Partial<RideView['payment']>, status: RideView['status'] = 'completed') =>
    ({
      status,
      fare: { finalTotalKobo: 205_000, quotedTotalKobo: 200_000 },
      payment: {
        method: 'cash',
        status: null,
        card: null,
        outstandingKobo: 0,
        refundedKobo: 0,
        disputed: false,
        ...payment,
      },
    }) as RideView;

  it('asks for cash at the end of the trip and records it on the receipt', () => {
    expect(paymentSummary(ride({ status: 'collected' }))).toEqual({
      key: 'ride.payCash',
      amountKobo: 205_000,
      tone: 'action',
    });
    expect(paymentSummary(ride({ status: 'collected' }), true)).toEqual({
      key: 'receipt.paidCash',
      tone: 'info',
    });
  });

  it('describes wallet and card payments, and anything still owed', () => {
    expect(paymentSummary(ride({ method: 'wallet', status: 'succeeded' }))?.key).toBe(
      'receipt.paidWallet',
    );
    expect(paymentSummary(ride({ method: 'card', status: 'pending' }))?.key).toBe(
      'receipt.cardPending',
    );
    expect(
      paymentSummary(
        ride({ method: 'card', status: 'succeeded', card: { brand: 'visa', last4: '4081' } }),
      ),
    ).toMatchObject({
      key: 'receipt.paidCard',
      card: { last4: '4081' },
    });
    expect(
      paymentSummary(ride({ method: 'card', status: 'outstanding', outstandingKobo: 5_000 })),
    ).toEqual({
      key: 'receipt.owed',
      amountKobo: 5_000,
      tone: 'bad',
    });
    expect(paymentSummary(ride({ status: null }, 'in_progress'))).toBeNull();
  });
});
