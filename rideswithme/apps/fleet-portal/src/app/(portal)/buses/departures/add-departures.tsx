'use client';

import { type FormEvent, useMemo, useState } from 'react';
import { SEAT_CLASSES, type BusRouteView, type BusSeatLayoutView } from '@rideswithme/shared-types';
import { BUS_MAX_DEPARTURES_PER_REQUEST } from '@rideswithme/validation';
import { nairaToKobo } from '@rideswithme/utilities';
import { addDays, datesBetween, lagosToday, useBusText } from '@/components/bus';
import { api } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];

/** Creates one departure per chosen day, at the same time, with the same bus and fares. */
export function AddDepartures({
  routes,
  layouts,
  onCreated,
}: {
  routes: BusRouteView[];
  layouts: BusSeatLayoutView[];
  onCreated: (count: number) => void;
}) {
  const { t, lang } = useI18n();
  const text = useBusText();
  const active = routes.filter((r) => r.isActive);
  const [routeId, setRouteId] = useState(active[0]?.id ?? '');
  const [layoutId, setLayoutId] = useState(layouts[0]?.id ?? '');
  const [time, setTime] = useState('07:00');
  const [from, setFrom] = useState(addDays(lagosToday(), 1));
  const [to, setTo] = useState(addDays(lagosToday(), 7));
  const [weekdays, setWeekdays] = useState<number[]>(WEEKDAYS);
  const [plate, setPlate] = useState('');
  const [fares, setFares] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const layout = layouts.find((l) => l.id === layoutId);
  const classes = SEAT_CLASSES.filter((c) => layout?.seats.some((s) => s.seatClass === c));
  const dates = useMemo(() => datesBetween(from, to, weekdays), [from, to, weekdays]);
  const dayName = (d: number) =>
    new Intl.DateTimeFormat(lang === 'ha' ? 'ha-NG' : 'en-NG', {
      weekday: 'short',
      timeZone: 'UTC',
    }).format(
      new Date(Date.UTC(2026, 10, 15 + d)), // 2026-11-15 is a Sunday
    );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (dates.length === 0) return setError(new Error(t('departures.none')));
    if (dates.length > BUS_MAX_DEPARTURES_PER_REQUEST)
      return setError(new Error(t('departures.tooMany')));
    setBusy(true);
    try {
      const created = await api().operator.createDepartures({
        routeId,
        layoutId,
        dates,
        departureTime: time,
        fares: classes.map((c) => ({ seatClass: c, fareKobo: nairaToKobo(fares[c] ?? '') })),
        ...(plate.trim() && { vehiclePlate: plate }),
      });
      onCreated(created.length);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id="add" className="card" onSubmit={(e) => void submit(e)} data-testid="departures-form">
      <h2>{t('departures.add')}</h2>
      <div className="form-grid">
        <div className="field">
          <label htmlFor="dep-route">{t('departures.route')}</label>
          <select
            id="dep-route"
            value={routeId}
            onChange={(e) => setRouteId(e.target.value)}
            required
          >
            {active.map((r) => (
              <option key={r.id} value={r.id}>
                {r.originCity} → {r.destinationCity} ({r.originTerminal})
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dep-layout">{t('departures.layout')}</label>
          <select
            id="dep-layout"
            value={layoutId}
            onChange={(e) => setLayoutId(e.target.value)}
            required
          >
            {layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} · {t('layouts.seats', { count: l.seats.length })}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dep-time">{t('departures.time')}</label>
          <input
            id="dep-time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="dep-plate">{t('departures.plate')}</label>
          <input id="dep-plate" value={plate} onChange={(e) => setPlate(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="dep-from">{t('departures.from')}</label>
          <input
            id="dep-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="dep-to">{t('departures.to')}</label>
          <input
            id="dep-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            required
          />
        </div>
      </div>
      <fieldset className="field">
        <legend>{t('departures.days')}</legend>
        <div className="checkbox-row">
          {WEEKDAYS.map((d) => (
            <label key={d}>
              <input
                type="checkbox"
                checked={weekdays.includes(d)}
                onChange={(e) =>
                  setWeekdays((w) => (e.target.checked ? [...w, d] : w.filter((x) => x !== d)))
                }
              />
              {dayName(d)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="form-grid">
        {classes.map((c) => (
          <div className="field" key={c}>
            <label htmlFor={`fare-${c}`}>
              {t('departures.fare', { seatClass: text.seatClass(c) })}
            </label>
            <input
              id={`fare-${c}`}
              inputMode="decimal"
              value={fares[c] ?? ''}
              onChange={(e) => setFares((f) => ({ ...f, [c]: e.target.value }))}
              required
              pattern="[0-9,]+(\.[0-9]{1,2})?"
            />
          </div>
        ))}
      </div>
      <InlineError error={error} />
      <button className="btn btn-primary" disabled={busy || dates.length === 0}>
        {t('departures.create', { count: dates.length })}
      </button>
    </form>
  );
}
