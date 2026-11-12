/** Nigeria is UTC+1 all year (no daylight saving). */
export const NIGERIA_TIME_ZONE = 'Africa/Lagos';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: NIGERIA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Today's date in Nigeria as YYYY-MM-DD. */
export function nigeriaToday(now: Date = new Date()): string {
  return formatter.format(now);
}

/** A document valid "until" a date is valid through the end of that day in Nigeria. */
export function isExpired(expiresOn: string | null, now: Date = new Date()): boolean {
  return expiresOn !== null && expiresOn < nigeriaToday(now);
}
