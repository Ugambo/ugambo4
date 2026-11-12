import { describe, expect, it } from 'vitest';
import { isExpired, nigeriaToday } from './dates';

describe('Nigerian dates', () => {
  it('rolls over at midnight Lagos time (23:00 UTC)', () => {
    expect(nigeriaToday(new Date('2026-11-12T22:59:00Z'))).toBe('2026-11-12');
    expect(nigeriaToday(new Date('2026-11-12T23:00:00Z'))).toBe('2026-11-13');
  });

  it('treats the expiry date as the last valid day', () => {
    const lateOn12th = new Date('2026-11-12T22:30:00Z');
    expect(isExpired('2026-11-12', lateOn12th)).toBe(false);
    expect(isExpired('2026-11-11', lateOn12th)).toBe(true);
    expect(isExpired(null, lateOn12th)).toBe(false);
  });
});
