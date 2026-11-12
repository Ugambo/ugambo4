import { colors, radius, spacing, typography } from './tokens';

/** The design tokens as CSS custom properties, for the web apps' <style> tag. */
export function cssVariables(): string {
  const vars: Record<string, string | number> = {
    '--c-primary': colors.primary,
    '--c-primary-pressed': colors.primaryPressed,
    '--c-on-primary': colors.onPrimary,
    '--c-accent': colors.accent,
    '--c-on-accent': colors.onAccent,
    '--c-success': colors.success,
    '--c-danger': colors.danger,
    '--c-warning': colors.warning,
    '--c-bg': colors.background,
    '--c-surface': colors.surface,
    '--c-border': colors.border,
    '--c-text': colors.text,
    '--c-muted': colors.textMuted,
    '--c-disabled': colors.textDisabled,
    '--c-grey-100': colors.grey[100],
    '--r-sm': `${radius.sm}px`,
    '--r-md': `${radius.md}px`,
    '--r-lg': `${radius.lg}px`,
    '--s-1': `${spacing[1]}px`,
    '--s-2': `${spacing[2]}px`,
    '--s-3': `${spacing[3]}px`,
    '--s-4': `${spacing[4]}px`,
    '--s-6': `${spacing[6]}px`,
    '--s-8': `${spacing[8]}px`,
    '--fs-sm': `${typography.size.sm}px`,
    '--fs-md': `${typography.size.md}px`,
    '--fs-lg': `${typography.size.lg}px`,
    '--fs-xl': `${typography.size.xl}px`,
    '--fs-2xl': `${typography.size['2xl']}px`,
  };
  return `:root{${Object.entries(vars)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
}
