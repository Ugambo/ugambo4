/** Today's date in Nigeria (YYYY-MM-DD). Nigeria is UTC+1 all year. */
export const lagosToday = (now = Date.now()) =>
  new Date(now + 3_600_000).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Every date from `from` to `to` (inclusive) whose weekday (0 = Sunday) is chosen. */
export function datesBetween(from: string, to: string, weekdays: number[]): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length <= 400; d = addDays(d, 1)) {
    if (weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) out.push(d);
  }
  return out;
}
