import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues } from '@rideswithme/utilities';
import { messages } from './messages';

describe('messages', () => {
  it('has every English text in Hausa, with the same placeholders', () => {
    const issues = checkCatalog(messages.en, messages.ha, { sameAllowed: ['app.name'] }); // the product's name;
    expect(issues, describeIssues('admin-dashboard', issues)).toEqual([]);
  });
});
