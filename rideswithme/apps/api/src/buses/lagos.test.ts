import { describe, expect, it } from 'vitest';
import { bookingReference, qrPayload, ticketCode } from './codes';
import { lagosDateTime, lagosDayStart, lagosToday } from './lagos';

describe('Nigerian dates', () => {
  it('starts a day at 23:00 UTC the day before', () => {
    expect(lagosDayStart('2026-12-01').toISOString()).toBe('2026-11-30T23:00:00.000Z');
  });
  it('turns a local departure time into an instant', () => {
    expect(lagosDateTime('2026-12-01', '07:30').toISOString()).toBe('2026-12-01T06:30:00.000Z');
  });
  it('knows that 23:30 UTC is already tomorrow in Lagos', () => {
    expect(lagosToday(new Date('2026-12-01T23:30:00Z'))).toBe('2026-12-02');
  });
});

describe('codes', () => {
  it('uses only unambiguous characters', () => {
    for (let i = 0; i < 200; i++) {
      expect(bookingReference()).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
      expect(ticketCode()).toMatch(/^[A-HJ-NP-Z2-9]{10}$/);
    }
    expect(qrPayload('ABCDEFGHJK')).toBe('RWMBUS:ABCDEFGHJK');
  });
});
