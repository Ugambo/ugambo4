import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues, placeholders, reviewCsv, reviewRows } from './catalog-check';
import { catalogs } from './i18n';
import { passengerMessages } from './passenger-messages';
import { supportMessages } from './support-messages';

describe('checkCatalog', () => {
  it('finds missing, extra, empty, mismatched and untranslated text', () => {
    const en = {
      a: 'Hello {name}',
      b: 'Seat {label}',
      c: 'Pay now',
      d: 'Cancel',
      e: 'RideswithMe',
      f: '₦{amount}',
      g: 'Trip',
    };
    const ha = {
      a: 'Sannu {name}',
      b: 'Kujera {seat}',
      c: ' ',
      d: 'Cancel',
      e: 'RideswithMe',
      f: '₦{amount}',
      g: 'Trip',
      z: 'old',
    };
    expect(checkCatalog(en, ha, { sameAllowed: ['g'] }).map((i) => [i.key, i.problem])).toEqual([
      ['b', 'placeholders'],
      ['c', 'empty'],
      ['d', 'same_as_english'],
      ['z', 'extra'],
    ]);
    expect(checkCatalog({ x: 'Go' }, {})).toEqual([
      { key: 'x', problem: 'missing', en: 'Go', ha: undefined },
    ]);
    expect(describeIssues('demo', checkCatalog({ x: 'Go' }, {}))).toBe(
      'demo x: missing (en: Go | ha: —)',
    );
  });

  it('compares placeholders as a set', () => {
    expect(placeholders('{b} and {a} and {a}')).toBe('{a},{b}');
    expect(placeholders('none')).toBe('');
  });
});

describe('review export', () => {
  it('writes a CSV with blank columns for the reviewer and quotes when needed', () => {
    const rows = reviewRows('demo', { a: 'Hi, "you"', b: 'Shared' }, { a: 'Sannu' }, ['b']);
    expect(reviewCsv(rows)).toBe(
      'catalogue,key,english,hausa,hausa_corrected,comment\ndemo,a,"Hi, ""you""",Sannu,,',
    );
  });
});

describe('shared catalogues', () => {
  it('server text (SMS and errors) is complete in Hausa', () => {
    const issues = checkCatalog(catalogs.en, catalogs.ha);
    expect(issues, describeIssues('utilities/i18n', issues)).toEqual([]);
  });

  it('passenger ride text is complete in Hausa', () => {
    const issues = checkCatalog(passengerMessages.en, passengerMessages.ha);
    expect(issues, describeIssues('utilities/passenger', issues)).toEqual([]);
  });

  it('support request text is complete in Hausa', () => {
    const issues = checkCatalog(supportMessages.en, supportMessages.ha);
    expect(issues, describeIssues('utilities/support', issues)).toEqual([]);
  });
});
