/**
 * Checks an English/Hausa message catalogue, and lays it out for review by a
 * native speaker (documentation/HAUSA_REVIEW.md). Pure functions: safe to
 * import in apps, used by each app's catalogue test and by
 * scripts/hausa-review.mts.
 */

export type CatalogProblem =
  /** In English, absent in Hausa. */
  | 'missing'
  /** In Hausa, absent in English (a leftover). */
  | 'extra'
  /** Present but blank in Hausa. */
  | 'empty'
  /** The {placeholders} differ, so a value would be lost or shown raw. */
  | 'placeholders'
  /** Hausa is word-for-word the English: probably never translated. */
  | 'same_as_english';

export interface CatalogIssue {
  key: string;
  problem: CatalogProblem;
  en: string | undefined;
  ha: string | undefined;
}

type Catalog = Readonly<Record<string, string>>;

/** The sorted {placeholders} in a string, e.g. "{minutes},{name}". */
export function placeholders(text: string): string {
  return [...new Set(text.match(/\{\w+\}/g) ?? [])].sort().join(',');
}

/**
 * Text that may stay the same in Hausa: names, codes, numbers and symbols,
 * words Hausa uses unchanged, and anything listed in `sameAllowed` (keys).
 */
const UNTRANSLATABLE =
  /^[\s\d\p{P}\p{S}]*$|^(RideswithMe|SOS|NIN|BVN|OTP|PIN|SMS|VIP|Email|E-mail|Keke|Keke Napep|Admin|ID|OK)$/iu;
const untranslatable = (text: string) => UNTRANSLATABLE.test(text.replace(/\{\w+\}/g, '').trim());

export function checkCatalog(
  en: Catalog,
  ha: Catalog,
  options: { sameAllowed?: readonly string[] } = {},
): CatalogIssue[] {
  const issues: CatalogIssue[] = [];
  const allowed = new Set(options.sameAllowed ?? []);
  for (const key of Object.keys(en)) {
    const e = en[key]!;
    const h = ha[key];
    if (h === undefined) issues.push({ key, problem: 'missing', en: e, ha: h });
    else if (!h.trim()) issues.push({ key, problem: 'empty', en: e, ha: h });
    else if (placeholders(h) !== placeholders(e))
      issues.push({ key, problem: 'placeholders', en: e, ha: h });
    else if (h.trim() === e.trim() && !allowed.has(key) && !untranslatable(e))
      issues.push({ key, problem: 'same_as_english', en: e, ha: h });
  }
  for (const key of Object.keys(ha))
    if (!(key in en)) issues.push({ key, problem: 'extra', en: undefined, ha: ha[key] });
  return issues;
}

/** Readable list of issues for a test failure message. */
export function describeIssues(catalog: string, issues: CatalogIssue[]): string {
  return issues
    .map((i) => `${catalog} ${i.key}: ${i.problem} (en: ${i.en ?? '—'} | ha: ${i.ha ?? '—'})`)
    .join('\n');
}

export interface ReviewRow {
  catalog: string;
  key: string;
  en: string;
  ha: string;
}

/** One row per key, in the catalogue's order; keys in `skip` (shared text listed elsewhere) are left out. */
export function reviewRows(
  catalog: string,
  en: Catalog,
  ha: Catalog,
  skip: Iterable<string> = [],
): ReviewRow[] {
  const skipped = new Set(skip);
  return Object.keys(en)
    .filter((key) => !skipped.has(key))
    .map((key) => ({ catalog, key, en: en[key]!, ha: ha[key] ?? '' }));
}

const csvCell = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * CSV for spreadsheet review. The columns are catalogue, key, English, Hausa,
 * "Hausa (corrected)" and comment, and the last two are left blank for the reviewer.
 */
export function reviewCsv(rows: ReviewRow[]): string {
  const head = ['catalogue', 'key', 'english', 'hausa', 'hausa_corrected', 'comment'];
  return [
    head.join(','),
    ...rows.map((r) => [r.catalog, r.key, r.en, r.ha, '', ''].map(csvCell).join(',')),
  ].join('\n');
}
