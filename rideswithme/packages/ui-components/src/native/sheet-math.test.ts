import { describe, expect, it } from 'vitest';
import { nearestSnap } from './sheet-math';

describe('nearestSnap', () => {
  it('follows a flick', () => {
    expect(nearestSnap(250, -1, 300)).toBe(0);
    expect(nearestSnap(20, 1, 300)).toBe(300);
  });
  it('otherwise goes to the nearer position', () => {
    expect(nearestSnap(100, 0, 300)).toBe(0);
    expect(nearestSnap(200, 0.2, 300)).toBe(300);
  });
});
