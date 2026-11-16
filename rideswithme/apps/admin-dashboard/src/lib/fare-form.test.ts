import { describe, expect, it } from 'vitest';
import type { FareRuleView } from '@rideswithme/shared-types';
import { formFromRule, multiplierToBps, nairaText, percentToBps, ruleFromForm } from './fare-form';

const rule: FareRuleView = {
  id: 'r',
  serviceArea: { key: 'kano', name: 'Kano' },
  category: { key: 'car', name: 'Car' },
  baseFareKobo: 50_000,
  perKmKobo: 12_050,
  perMinuteKobo: 1_500,
  minimumFareKobo: 80_000,
  bookingFeeKobo: 10_000,
  cancellationFeeKobo: 30_000,
  cancellationGraceSeconds: 120,
  waitingFreeMinutes: 3,
  waitingPerMinuteKobo: 2_000,
  commissionBps: 1_250,
  roundingIncrementKobo: 5_000,
  peakWindows: [{ days: [1, 2, 3, 4, 5], start: '07:00', end: '09:30', multiplierBps: 12_500 }],
  createdAt: '2026-11-01T00:00:00Z',
};

describe('pricing form', () => {
  it('shows kobo as naira and basis points as percent or multiplier', () => {
    expect(nairaText(12_050)).toBe('120.50');
    expect(nairaText(50_000)).toBe('500');
    expect(nairaText(5)).toBe('0.05');
    const f = formFromRule(rule);
    expect(f).toMatchObject({
      perKm: '120.50',
      commissionPercent: '12.5',
      peaks: [{ multiplier: '1.25' }],
    });
  });

  it('round-trips a rule exactly, with no floating point', () => {
    const { id: _id, serviceArea: _a, category: _c, createdAt: _t, ...values } = rule;
    expect(ruleFromForm(formFromRule(rule))).toEqual(values);
  });

  it('converts percent and multipliers with integer arithmetic', () => {
    expect(percentToBps('20')).toBe(2_000);
    expect(percentToBps('12.5')).toBe(1_250);
    expect(percentToBps('0.01')).toBe(1);
    expect(multiplierToBps('1.2')).toBe(12_000);
    expect(multiplierToBps('1.0001')).toBe(10_001);
    expect(() => percentToBps('12.345')).toThrow();
    expect(() => percentToBps('-5')).toThrow();
    expect(() => multiplierToBps('1.2x')).toThrow();
  });

  it('refuses amounts that are not naira', () => {
    expect(() => ruleFromForm({ ...formFromRule(rule), base: 'five hundred' })).toThrow();
    expect(() => ruleFromForm({ ...formFromRule(rule), graceSeconds: '2.5' })).toThrow();
  });
});
