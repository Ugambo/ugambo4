import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

/**
 * Automated accessibility check of the page as it is now (WCAG 2.1 A and AA
 * rules, via axe-core). Returns the serious and critical problems, one line
 * each, so a test can expect an empty list and print what is wrong otherwise.
 * Automated checks find roughly a third of problems; they do not replace
 * trying the pages with a screen reader and a keyboard.
 */
export async function accessibilityProblems(
  page: Page,
  options: { exclude?: string[] } = {},
): Promise<string[]> {
  let builder = new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']);
  for (const selector of options.exclude ?? []) builder = builder.exclude(selector);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => {
      const where = v.nodes
        .slice(0, 3)
        .map((n) => `${n.target.join(' ')} ${n.html.slice(0, 80)} (${n.any[0]?.message ?? ''})`)
        .join(' | ');
      return `${v.id} (${v.impact}): ${v.help}. At ${where}`;
    });
}
