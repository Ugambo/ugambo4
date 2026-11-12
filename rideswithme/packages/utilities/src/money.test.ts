import { describe, expect, it } from 'vitest';
import { applyBasisPoints, formatKobo, MoneyError, nairaToKobo, sumKobo } from './money';

describe('nairaToKobo', () => {
  it.each([
    ['1500', 150000],
    ['1,500.5', 150050],
    ['₦1,500.50', 150050],
    ['0.01', 1],
    ['0', 0],
    ['-20.10', -2010],
  ])('%s -> %i kobo', (input, kobo) => expect(nairaToKobo(input)).toBe(kobo));

  it.each(['1.234', 'abc', '', '1e3', '12.'])('rejects %s', (input) => {
    expect(() => nairaToKobo(input)).toThrow(MoneyError);
  });

  it('does not suffer floating point error', () => {
    // 0.1 + 0.2 style problems: 19.99 * 100 = 1998.9999999999998 in floats.
    expect(nairaToKobo('19.99')).toBe(1999);
  });
});

describe('formatKobo', () => {
  it('formats with grouping and only shows kobo when non-zero', () => {
    expect(formatKobo(150000)).toBe('₦1,500');
    expect(formatKobo(150050)).toBe('₦1,500.50');
    expect(formatKobo(5)).toBe('₦0.05');
    expect(formatKobo(-123456789)).toBe('-₦1,234,567.89');
    expect(formatKobo(100, { alwaysShowKobo: true })).toBe('₦1.00');
  });
  it('rejects fractional kobo', () => expect(() => formatKobo(1.5)).toThrow(MoneyError));
});

describe('applyBasisPoints', () => {
  it('computes percentages in integer kobo with half-up rounding', () => {
    expect(applyBasisPoints(150000, 2000)).toBe(30000); // 20% of ₦1,500
    expect(applyBasisPoints(333, 1500)).toBe(50); // 49.95 -> 50
    expect(applyBasisPoints(331, 1500)).toBe(50); // 49.65 -> 50
    expect(applyBasisPoints(330, 1500)).toBe(50); // 49.5 -> 50
    expect(applyBasisPoints(329, 1500)).toBe(49); // 49.35 -> 49
    expect(applyBasisPoints(-330, 1500)).toBe(-50);
  });
  it('handles large amounts without overflow', () => {
    expect(applyBasisPoints(900_000_000_000_000, 10_000)).toBe(900_000_000_000_000);
  });
});

describe('sumKobo', () => {
  it('adds integer amounts and rejects non-integers', () => {
    expect(sumKobo(100, 250, -50)).toBe(300);
    expect(() => sumKobo(1, 0.5)).toThrow(MoneyError);
  });
});
