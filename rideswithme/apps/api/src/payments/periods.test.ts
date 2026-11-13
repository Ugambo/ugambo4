import { describe, expect, it } from 'vitest';
import { lagosPeriodStarts } from './payouts.service';

describe('lagosPeriodStarts', () => {
  it('uses Nigerian midnight and Monday', () => {
    // Thursday 00:30 in Lagos (Wednesday 23:30 UTC).
    const { today, week } = lagosPeriodStarts(new Date('2026-11-11T23:30:00Z'));
    expect(today.toISOString()).toBe('2026-11-11T23:00:00.000Z');
    expect(week.toISOString()).toBe('2026-11-08T23:00:00.000Z'); // Monday 00:00 Lagos
  });

  it('treats Monday itself as the start of the week, and Sunday as the end of the last', () => {
    expect(lagosPeriodStarts(new Date('2026-11-09T08:00:00Z')).week.toISOString()).toBe(
      '2026-11-08T23:00:00.000Z',
    );
    expect(lagosPeriodStarts(new Date('2026-11-08T22:30:00Z')).week.toISOString()).toBe(
      '2026-11-01T23:00:00.000Z',
    );
  });
});
