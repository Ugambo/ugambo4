import { describe, expect, it } from 'vitest';
import { datesBetween } from './dates';
import { seatsFromCells } from './seat-layout';

describe('seat layout editor', () => {
  it('numbers seats from the front, left to right, ignoring cells outside the grid', () => {
    const seats = seatsFromCells(
      { '2:1': 'standard', '1:3': 'executive', '1:1': 'vip', '9:9': 'standard' },
      3,
      3,
    );
    expect(seats).toEqual([
      { label: '1', row: 1, col: 1, seatClass: 'vip' },
      { label: '2', row: 1, col: 3, seatClass: 'executive' },
      { label: '3', row: 2, col: 1, seatClass: 'standard' },
    ]);
  });
});

describe('departure days', () => {
  it('picks the chosen weekdays between two dates', () => {
    // 2026-11-16 is a Monday.
    expect(datesBetween('2026-11-16', '2026-11-29', [1, 5])).toEqual([
      '2026-11-16',
      '2026-11-20',
      '2026-11-23',
      '2026-11-27',
    ]);
    expect(datesBetween('2026-11-20', '2026-11-16', [0, 1, 2, 3, 4, 5, 6])).toEqual([]);
  });
});
