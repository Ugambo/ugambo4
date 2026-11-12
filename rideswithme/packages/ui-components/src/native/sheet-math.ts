/**
 * Where a released sheet should rest: 0 (expanded) or `travel` (collapsed).
 * A quick flick decides by direction; otherwise the nearer position wins.
 */
export function nearestSnap(position: number, velocityY: number, travel: number): number {
  if (velocityY < -0.5) return 0;
  if (velocityY > 0.5) return travel;
  return position < travel / 2 ? 0 : travel;
}
