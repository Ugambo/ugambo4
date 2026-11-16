'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { type FormEvent, useRef, useState } from 'react';
import { newIdempotencyKey } from '@rideswithme/api-client';
import { BUS_MAX_SEATS_PER_BOOKING } from '@rideswithme/validation';
import { SeatMap, type SeatMapSeat, useResource } from '@rideswithme/web-core/client';
import { DepartureHeader, formatKobo, useSeatClass } from '@/components/bus-parts';
import { api } from '@/lib/api';
import { ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';
import { useMe } from '../../../shell';

/** Choose seats, name each traveller, then hold the seats and go to payment. */
export default function DeparturePage() {
  const { t } = useI18n();
  const me = useMe();
  const router = useRouter();
  const seatClass = useSeatClass();
  const { id } = useParams<{ id: string }>();
  const dep = useResource(() => api().bus.departure(id), [id]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  // One key per choice of seats, so a retried request never holds twice.
  const key = useRef(newIdempotencyKey());

  if (dep.loading && !dep.data) return <Loading />;
  if (dep.error || !dep.data)
    return <ErrorState error={dep.error} onRetry={() => void dep.reload()} />;
  const d = dep.data;
  const seats = d.layout.seats;
  const chosenSeats = seats.filter((s) => chosen.includes(s.id));
  const total = chosenSeats.reduce((sum, s) => sum + s.fareKobo, 0);

  const toggle = (s: { id: string }) => {
    key.current = newIdempotencyKey();
    setChosen((c) =>
      c.includes(s.id)
        ? c.filter((x) => x !== s.id)
        : c.length >= BUS_MAX_SEATS_PER_BOOKING
          ? c
          : [...c, s.id],
    );
  };

  const hold = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const booking = await api().bus.hold(
        {
          scheduleId: d.id,
          seats: chosenSeats.map((s, i) => ({
            seatId: s.id,
            passengerName: (names[s.id] ?? (i === 0 ? (me?.fullName ?? '') : '')).trim(),
          })),
        },
        key.current,
      );
      router.push(`/buses/bookings/${booking.id}`);
    } catch (err) {
      setError(err);
      key.current = newIdempotencyKey();
      void dep.reload();
      setBusy(false);
    }
  };

  const describe = (s: SeatMapSeat, isChosen: boolean) => {
    const seat = seats.find((x) => x.label === s.label)!;
    const base = t('bus.seatDescribe', {
      label: s.label,
      seatClass: seatClass(s.seatClass),
      fare: formatKobo(seat.fareKobo),
    });
    if (isChosen) return `${base}, ${t('bus.seatChosen')}`;
    if (s.state === 'yours') return `${base}, ${t('bus.seatYours')}`;
    return s.state === 'taken' ? `${base}, ${t('bus.seatTaken')}` : base;
  };

  return (
    <section className="card">
      <p>
        <Link href="/buses">← {t('bus.back')}</Link>
      </p>
      <h1>{t('bus.chooseSeats')}</h1>
      <DepartureHeader d={d} />
      <p className="small muted">
        {d.fares.map((f) => `${seatClass(f.seatClass)} ${formatKobo(f.fareKobo)}`).join(' · ')} ·{' '}
        {t('bus.maxSeats', { count: BUS_MAX_SEATS_PER_BOOKING })}
      </p>
      <div className="bus-seat-layout">
        <div>
          <SeatMap
            rows={d.layout.rows}
            columns={d.layout.columns}
            seats={seats}
            selected={chosen}
            onToggle={toggle}
            describe={describe}
            frontLabel={t('bus.front')}
            label={t('bus.seatMap')}
          />
          <div className="seat-legend">
            <span>
              <span className="seat" aria-hidden="true" /> {t('bus.legendFree')}
            </span>
            <span>
              <span className="seat seat-taken" aria-hidden="true" /> {t('bus.legendTaken')}
            </span>
            <span>
              <span className="seat seat-selected" aria-hidden="true" /> {t('bus.legendChosen')}
            </span>
            <span>
              <span className="seat seat-yours" aria-hidden="true" /> {t('bus.legendYours')}
            </span>
          </div>
        </div>
        <form onSubmit={(e) => void hold(e)} data-testid="seat-form">
          {chosenSeats.map((s, i) => (
            <div className="field" key={s.id}>
              <label htmlFor={`name-${s.label}`}>
                {t('bus.passengerName', { label: s.label })}
              </label>
              <input
                id={`name-${s.label}`}
                value={names[s.id] ?? (i === 0 ? (me?.fullName ?? '') : '')}
                onChange={(e) => setNames((n) => ({ ...n, [s.id]: e.target.value }))}
                required
                minLength={2}
                maxLength={100}
                autoComplete={i === 0 ? 'name' : 'off'}
              />
            </div>
          ))}
          {chosenSeats.length > 0 && (
            <>
              <p className="fare-total" data-testid="seat-total">
                {t('bus.total', { amount: formatKobo(total) })}
              </p>
              <p className="small muted">{t('bus.holdNote')}</p>
            </>
          )}
          <InlineError error={error} />
          <button
            className="btn btn-primary btn-large"
            disabled={busy || chosenSeats.length === 0 || !d.salesOpen}
          >
            {d.salesOpen ? t('bus.hold') : t('bus.closed')}
          </button>
        </form>
      </div>
    </section>
  );
}
