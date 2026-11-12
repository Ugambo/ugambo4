import type { Language } from '@rideswithme/shared-types';

/** Picks "ha" or "en" from an Accept-Language header; defaults to English. */
export function languageFromHeader(header: string | undefined): Language {
  if (!header) return 'en';
  const tags = header
    .split(',')
    .map((part) => {
      const [tag = '', q] = part.trim().split(';q=');
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of tags) {
    if (tag === 'ha' || tag.startsWith('ha-')) return 'ha';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return 'en';
}
