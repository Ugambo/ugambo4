import { describe, expect, it } from 'vitest';
import { checkCatalog, describeIssues } from '@rideswithme/utilities';
import { messages } from './messages';

describe('messages', () => {
  it('has every English text in Hausa, with the same placeholders', () => {
    const issues = checkCatalog(messages.en, messages.ha);
    expect(issues, describeIssues('passenger-web', issues)).toEqual([]);
  });
});
