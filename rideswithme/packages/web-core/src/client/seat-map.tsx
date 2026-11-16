'use client';

import type { SeatClass } from '@rideswithme/shared-types';

export interface SeatMapSeat {
  id: string;
  label: string;
  row: number;
  col: number;
  seatClass: SeatClass;
  /** available (default), taken by someone else, or held/bought by the viewer. */
  state?: 'available' | 'taken' | 'yours';
}

/**
 * A bus seat map: a grid of rows × columns with the front at the top. Cells
 * without a seat are the aisle. With onToggle, available seats are buttons
 * (selected seats show a tick, so the state never depends on colour alone).
 */
export function SeatMap({
  rows,
  columns,
  seats,
  selected = [],
  onToggle,
  describe,
  frontLabel,
  label,
}: {
  rows: number;
  columns: number;
  seats: SeatMapSeat[];
  selected?: string[];
  onToggle?: (seat: SeatMapSeat) => void;
  /** Accessible description of a seat, e.g. "Seat 4, executive, ₦18,000, taken". */
  describe: (seat: SeatMapSeat, isSelected: boolean) => string;
  frontLabel: string;
  label: string;
}) {
  const at = new Map(seats.map((s) => [`${s.row}:${s.col}`, s]));
  const cells = [];
  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= columns; c++) {
      const s = at.get(`${r}:${c}`);
      if (!s) {
        cells.push(<span key={`${r}:${c}`} className="seat-gap" aria-hidden="true" />);
        continue;
      }
      const isSelected = selected.includes(s.id);
      const state = s.state ?? 'available';
      const className = `seat seat-${s.seatClass} seat-${isSelected ? 'selected' : state}`;
      const text = (
        <>
          <span className="seat-label">{s.label}</span>
          {isSelected && <span aria-hidden="true">✓</span>}
          {!isSelected && state === 'taken' && <span aria-hidden="true">✕</span>}
        </>
      );
      cells.push(
        onToggle ? (
          <button
            key={s.id}
            type="button"
            className={className}
            disabled={state !== 'available'}
            aria-pressed={isSelected}
            aria-label={describe(s, isSelected)}
            data-seat={s.label}
            onClick={() => onToggle(s)}
          >
            {text}
          </button>
        ) : (
          <span
            key={s.id}
            className={className}
            role="img"
            aria-label={describe(s, isSelected)}
            data-seat={s.label}
          >
            {text}
          </span>
        ),
      );
    }
  }
  return (
    <figure className="seat-map" aria-label={label}>
      <div className="seat-front">{frontLabel}</div>
      <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${columns}, 2.75rem)` }}>
        {cells}
      </div>
    </figure>
  );
}
