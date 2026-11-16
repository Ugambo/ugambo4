import type { SeatClass } from '@rideswithme/shared-types';

/** Seats from an editor grid ("row:col" → class), numbered from the front, left to right. */
export function seatsFromCells(cells: Record<string, SeatClass>, rows: number, columns: number) {
  const seats: { label: string; row: number; col: number; seatClass: SeatClass }[] = [];
  for (let r = 1; r <= rows; r++)
    for (let c = 1; c <= columns; c++) {
      const seatClass = cells[`${r}:${c}`];
      if (seatClass) seats.push({ label: String(seats.length + 1), row: r, col: c, seatClass });
    }
  return seats;
}
