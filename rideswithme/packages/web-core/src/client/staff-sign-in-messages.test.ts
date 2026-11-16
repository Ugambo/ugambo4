import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues } from '@rideswithme/utilities';
import { staffSignInMessages } from './staff-sign-in-messages';

describe('staff sign-in messages', () => {
  it('has every English text in Hausa, with the same placeholders', () => {
    const issues = checkCatalog(staffSignInMessages.en, staffSignInMessages.ha);
    expect(issues, describeIssues('web-core/staff-sign-in', issues)).toEqual([]);
  });
});
