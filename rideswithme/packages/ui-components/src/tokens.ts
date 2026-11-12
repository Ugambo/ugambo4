/**
 * RideswithMe design tokens. Placeholder palette until brand colours are
 * confirmed (primary navy, accent amber). Values are plain numbers/strings so
 * both React Native and web (CSS variables) can consume them.
 */
export const colors = {
  primary: '#0F2A43',
  primaryPressed: '#0A1E30',
  onPrimary: '#FFFFFF',
  accent: '#F5A623',
  accentPressed: '#D98E10',
  onAccent: '#0F2A43',
  success: '#17803D',
  onSuccess: '#FFFFFF',
  danger: '#C62828',
  onDanger: '#FFFFFF',
  warning: '#B25E00',
  background: '#FFFFFF',
  surface: '#F5F7FA',
  border: '#D5DBE3',
  text: '#0B1724',
  textMuted: '#4A5868',
  textDisabled: '#8A96A3',
  overlay: 'rgba(11, 23, 36, 0.55)',
  grey: {
    50: '#F5F7FA',
    100: '#E9EDF2',
    200: '#D5DBE3',
    300: '#B6C0CC',
    400: '#8A96A3',
    500: '#6B7785',
    600: '#4A5868',
    700: '#333F4C',
    800: '#1E2935',
    900: '#0B1724',
  },
} as const;

/** Type scale in px. Body text is 16 minimum so it stays readable outdoors. */
export const typography = {
  fontFamily: {
    regular: 'Inter-Regular',
    medium: 'Inter-Medium',
    bold: 'Inter-Bold',
  },
  size: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28, '3xl': 34 },
  lineHeight: { xs: 16, sm: 20, md: 24, lg: 26, xl: 30, '2xl': 36, '3xl': 42 },
} as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = { sm: 6, md: 10, lg: 16, xl: 24, pill: 999 } as const;

/** Minimum touch target in dp/px (larger than the 44/48 platform minimums). */
export const touchTarget = { min: 48, primaryButtonHeight: 56 } as const;

export const tokens = { colors, typography, spacing, radius, touchTarget } as const;
export type Tokens = typeof tokens;
