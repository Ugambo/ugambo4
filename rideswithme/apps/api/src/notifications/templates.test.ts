import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues } from '@rideswithme/utilities';
import { render, TEMPLATES } from './templates';

describe('notification templates', () => {
  it('fills values in the person’s language', () => {
    expect(render('driver_arrived', 'ha', { name: 'Musa' })).toEqual({
      title: 'Direbanku ya iso',
      body: 'Musa na jira a wurin ɗauka.',
    });
  });
  it('uses the same placeholders in English and Hausa', () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const t of Object.values(TEMPLATES)) {
      expect(names(t.ha.join(' '))).toEqual(names(t.en.join(' ')));
    }
  });
  it('has every title and body in Hausa', () => {
    const flat = (lang: 'en' | 'ha') =>
      Object.fromEntries(
        Object.entries(TEMPLATES).flatMap(([kind, t]) => [
          [`${kind}.title`, t[lang][0]],
          [`${kind}.body`, t[lang][1]],
        ]),
      );
    const issues = checkCatalog(flat('en'), flat('ha'));
    expect(issues, describeIssues('api/notifications', issues)).toEqual([]);
  });
});
