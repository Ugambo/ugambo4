import { describe, expect, it } from 'vitest';
import { Recorder, formatTable, percentile, pool } from './stats';

describe('percentile', () => {
  it('uses the nearest rank', () => {
    const s = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(s, 50)).toBe(50);
    expect(percentile(s, 95)).toBe(95);
    expect(percentile(s, 99)).toBe(99);
    expect(percentile(s, 100)).toBe(100);
    expect(percentile([7], 99)).toBe(7);
    expect(percentile([], 50)).toBe(0);
  });
});

describe('Recorder', () => {
  it('summarises samples and errors per operation', async () => {
    const r = new Recorder();
    for (const ms of [30, 10, 20]) r.record('estimate', ms);
    await expect(
      r.time('book', () => Promise.reject(new Error('409 SEAT_UNAVAILABLE'))),
    ).rejects.toThrow();
    const [book, estimate] = r.summaries();
    expect(book).toMatchObject({ name: 'book', count: 0, errors: 1 });
    expect(estimate).toMatchObject({ count: 3, errors: 0, p50: 20, max: 30 });
    expect(r.firstError('book')).toContain('SEAT_UNAVAILABLE');
    expect(formatTable(r.summaries())).toMatch(/estimate\s+3\s+0\s+20/);
  });
});

describe('pool', () => {
  it('keeps order and never exceeds the limit', async () => {
    let inFlight = 0;
    let peak = 0;
    const out = await pool([5, 1, 4, 2, 3], 2, async (n) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, n));
      inFlight--;
      return n * 10;
    });
    expect(out).toEqual([50, 10, 40, 20, 30]);
    expect(peak).toBe(2);
  });
});
