import { describe, expect, it } from 'vitest';
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
});
