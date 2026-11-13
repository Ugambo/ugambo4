import { describe, expect, it } from 'vitest';
import { formatDateTime, formatDistance, formatDuration, formatTime, secondsSince } from './format';

describe('format', () => {
  it('formats distances', () => {
    expect(formatDistance(847)).toBe('850 m');
    expect(formatDistance(4_230)).toBe('4.2 km');
    expect(formatDistance(23_400)).toBe('23 km');
  });
  it('formats durations', () => {
    expect(formatDuration(20)).toBe('1 min');
    expect(formatDuration(780)).toBe('13 min');
    expect(formatDuration(3_900)).toBe('1 h 5 min');
  });
  it('shows Nigerian clock time', () => {
    expect(formatTime('2026-11-12T13:05:00Z')).toBe('14:05');
  });
  it('never returns negative ages', () => {
    expect(secondsSince(new Date(Date.now() + 5000).toISOString())).toBe(0);
  });
});

describe('formatDateTime', () => {
  it('shows Nigerian date and time', () => {
    expect(formatDateTime('2026-11-12T23:30:00Z')).toBe('13/11/2026 00:30');
  });
});
