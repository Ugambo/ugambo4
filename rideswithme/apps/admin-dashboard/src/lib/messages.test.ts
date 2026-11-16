import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues } from '@rideswithme/utilities';
import { messages } from './messages';

describe('messages', () => {
  it('has every English text in Hausa, with the same placeholders', () => {
    // The product's name, and the language's own name ("Hausa" in both).
    const issues = checkCatalog(messages.en, messages.ha, { sameAllowed: ['app.name', 'lang.ha'] });
    expect(issues, describeIssues('admin-dashboard', issues)).toEqual([]);
  });
});
