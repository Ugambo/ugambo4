import { describe, expect, it } from 'vitest';
import { formatDayFirst, parseDayFirstDate } from './dates';

describe('day-first dates', () => {
  it.each([
    ['31/12/2027', '2027-12-31'],
    ['1/2/2028', '2028-02-01'],
    ['05-06-2027', '2027-06-05'],
    ['05.06.2027', '2027-06-05'],
  ])('parses %s', (input, iso) => expect(parseDayFirstDate(input)).toBe(iso));

  it.each(['2027-12-31', '31/02/2027', '12/31/2027', '', 'tomorrow'])('rejects %s', (input) =>
    expect(parseDayFirstDate(input)).toBeNull(),
  );

  it('formats back for display', () => expect(formatDayFirst('2027-06-05')).toBe('05/06/2027'));
});
