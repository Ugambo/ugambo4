import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { colors, tones } from './tokens';

// Sunlight readability: hold key pairs to WCAG AAA (7:1) for body text where
// possible and never below AA (4.5:1).
describe('colour contrast', () => {
  it.each([
    ['text on background', colors.text, colors.background, 7],
    ['muted text on background', colors.textMuted, colors.background, 4.5],
    ['on primary', colors.onPrimary, colors.primary, 7],
    ['on accent', colors.onAccent, colors.accent, 4.5],
    ['on success', colors.onSuccess, colors.success, 4.5],
    ['on danger', colors.onDanger, colors.danger, 4.5],
    ['warning on background', colors.warning, colors.background, 4.5],
  ])('%s meets %s', (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe('status pills', () => {
  // Small bold text on a tint: AA needs 4.5:1; keep a margin for sunlight.
  it.each(Object.entries(tones))('%s text on its tint is at least 5.5:1', (_tone, c) => {
    expect(contrastRatio(c.fg, c.bg)).toBeGreaterThanOrEqual(5.5);
  });
});
