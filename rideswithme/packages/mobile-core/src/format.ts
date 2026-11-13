/** Distances and durations for people: "850 m", "4.2 km", "12 min", "1 h 5 min". */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10} m`;
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Seconds since an ISO time, never negative. */
export function secondsSince(iso: string, now = Date.now()): number {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
}

/** Clock time in Nigeria, e.g. "14:05". */
export function formatTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 3_600_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** Day, month and clock time in Nigeria, e.g. "13/11/2026 14:05" (no Intl needed). */
export function formatDateTime(iso: string): string {
  const d = new Date(Date.parse(iso) + 3_600_000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${formatTime(iso)}`;
}
