/** Nigeria is UTC+1 all year (no daylight saving). */
const OFFSET_MS = 3_600_000;

/** The instant a Nigerian calendar day starts. */
export function lagosDayStart(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - OFFSET_MS);
}

/** A Nigerian date and HH:MM time as an instant. */
export function lagosDateTime(date: string, time: string): Date {
  return new Date(Date.parse(`${date}T${time}:00Z`) - OFFSET_MS);
}

/** Today's Nigerian date, YYYY-MM-DD. */
export function lagosToday(now = new Date()): string {
  return new Date(now.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}
