import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues } from '@rideswithme/utilities';
import { commonEn, commonHa } from './messages';

describe('common app messages', () => {
  it('has every English text in Hausa, with the same placeholders', () => {
    const issues = checkCatalog(commonEn, commonHa);
    expect(issues, describeIssues('mobile-core', issues)).toEqual([]);
  });
});
