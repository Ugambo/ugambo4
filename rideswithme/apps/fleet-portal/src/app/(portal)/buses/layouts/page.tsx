'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { SEAT_CLASSES, type SeatClass } from '@rideswithme/shared-types';
import { SeatMap, useResource } from '@rideswithme/web-core/client';
import { useBusText } from '@/components/bus';
import { seatsFromCells } from '@/lib/seat-layout';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

const next = (c: SeatClass | undefined): SeatClass | undefined =>
  c === undefined ? 'standard' : SEAT_CLASSES[SEAT_CLASSES.indexOf(c) + 1];

function LayoutEditor({ onSaved }: { onSaved: () => void }) {
  const { t } = useI18n();
  const text = useBusText();
  const [name, setName] = useState('');
  const [rows, setRows] = useState(5);
  const [columns, setColumns] = useState(4);
  const [cells, setCells] = useState<Record<string, SeatClass>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const seats = useMemo(() => seatsFromCells(cells, rows, columns), [cells, rows, columns]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (seats.length === 0) {
      setError(new Error(t('layouts.needSeats')));
      return;
    }
    setBusy(true);
    try {
      await api().operator.createLayout({ name, rows, columns, seats });
      setName('');
      setCells({});
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const grid = [];
  for (let r = 1; r <= rows; r++)
    for (let c = 1; c <= columns; c++) {
      const key = `${r}:${c}`;
      const cls = cells[key];
      const seat = seats.find((s) => s.row === r && s.col === c);
      grid.push(
        <button
          key={key}
          type="button"
          className={cls ? `seat seat-${cls}` : 'seat seat-gap-edit'}
          aria-label={t('layouts.cell', {
            row: r,
            col: c,
            what: cls ? text.seatClass(cls) : t('layouts.noSeat'),
          })}
          data-cell={key}
          onClick={() =>
            setCells((all) => {
              const n = next(all[key]);
              const copy = { ...all };
              if (n) copy[key] = n;
              else delete copy[key];
              return copy;
            })
          }
        >
          {seat ? seat.label : ''}
        </button>,
      );
    }

  return (
    <form className="card" onSubmit={(e) => void save(e)} data-testid="layout-form">
      <h2>{t('layouts.new')}</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="layout-name">{t('layouts.name')}</label>
          <input
            id="layout-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
          />
        </div>
        <div className="field">
          <label htmlFor="layout-rows">{t('layouts.rows')}</label>
          <input
            id="layout-rows"
            type="number"
            min={1}
            max={30}
            value={rows}
            onChange={(e) => setRows(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
          />
        </div>
        <div className="field">
          <label htmlFor="layout-columns">{t('layouts.columns')}</label>
          <input
            id="layout-columns"
            type="number"
            min={1}
            max={8}
            value={columns}
            onChange={(e) => setColumns(Math.max(1, Math.min(8, Number(e.target.value) || 1)))}
          />
        </div>
      </div>
      <p className="small muted">{t('layouts.help')}</p>
      <div className="seat-map">
        <div className="seat-front">{t('seat.front')}</div>
        <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${columns}, 2.75rem)` }}>
          {grid}
        </div>
      </div>
      <Legend />
      <p className="small">{t('layouts.seats', { count: seats.length })}</p>
      <InlineError error={error} />
      <button className="btn btn-primary" disabled={busy}>
        {t('layouts.save')}
      </button>
    </form>
  );
}

function Legend() {
  const text = useBusText();
  return (
    <div className="seat-legend">
      {SEAT_CLASSES.map((c) => (
        <span key={c}>
          <span className={`seat seat-${c}`} aria-hidden="true" /> {text.seatClass(c)}
        </span>
      ))}
    </div>
  );
}

export default function LayoutsPage() {
  const { t } = useI18n();
  const text = useBusText();
  const layouts = useResource(() => api().operator.layouts(), []);
  if (layouts.loading && !layouts.data) return <Loading />;
  if (layouts.error)
    return <ErrorState error={layouts.error} onRetry={() => void layouts.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('layouts.title')}</h1>
      </div>
      {layouts.data!.length === 0 && <Empty message={t('layouts.empty')} />}
      <div className="cards">
        {layouts.data!.map((l) => (
          <section key={l.id} className="card" data-testid="layout-card">
            <h2>
              {l.name} {l.inUse && <span className="pill pill-muted">{t('layouts.inUse')}</span>}
            </h2>
            <p className="small muted">
              {t('layouts.seats', { count: l.seats.length })} ·{' '}
              {SEAT_CLASSES.filter((c) => l.seats.some((s) => s.seatClass === c))
                .map(
                  (c) => `${text.seatClass(c)} ${l.seats.filter((s) => s.seatClass === c).length}`,
                )
                .join(' · ')}
            </p>
            <SeatMap
              rows={l.rows}
              columns={l.columns}
              seats={l.seats}
              describe={(s) => text.describeSeat(s)}
              frontLabel={t('seat.front')}
              label={t('seat.map')}
            />
          </section>
        ))}
      </div>
      <LayoutEditor onSaved={() => void layouts.reload()} />
    </>
  );
}
