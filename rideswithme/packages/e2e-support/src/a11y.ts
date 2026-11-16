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

/**
 * WCAG 1.4.10 Reflow (which axe-core does not test): at the given width the
 * page must not scroll sideways. Returns null when it fits, or how many CSS
 * pixels too wide it is and the innermost elements that stick out. Checked
 * at 320 px, the width the criterion names.
 */
export async function horizontalOverflow(
  page: Page,
  width = 320,
): Promise<{ extra: number; elements: string[] } | null> {
  const before = page.viewportSize();
  await page.setViewportSize({ width, height: before?.height ?? 800 });
  // A string expression: this package is compiled without the browser's types.
  const result = (await page.evaluate(`(() => {
    const root = document.documentElement;
    const extra = root.scrollWidth - root.clientWidth;
    if (extra <= 0) return null;
    const out = [];
    for (const el of document.body.querySelectorAll('*')) {
      if (el.getBoundingClientRect().right <= root.clientWidth + 1) continue;
      if ([...el.children].some((c) => c.getBoundingClientRect().right > root.clientWidth + 1)) continue;
      const cls = typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
      out.push(el.tagName.toLowerCase() + cls + ' (right ' + Math.round(el.getBoundingClientRect().right) + 'px)');
      if (out.length >= 4) break;
    }
    return { extra, elements: out };
  })()`)) as { extra: number; elements: string[] } | null;
  if (before) await page.setViewportSize(before);
  return result;
}
