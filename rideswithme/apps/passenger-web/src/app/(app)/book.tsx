'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import {
  ACTIVE_RIDE_STATUSES,
  type DriverPosition,
  type FareEstimateResponse,
  type Place,
  type RideView,
  type SavedPlace,
} from '@rideswithme/shared-types';
import {
  applyActiveRides,
  applyRideUpdate,
  formatKobo,
  type PassengerRides,
  scheduleSlots,
  toPlaceInput,
} from '@rideswithme/utilities';
import { PlaceField } from '@/components/place-field';
import { VehicleOption } from '@/components/ride-parts';
import { RouteSketch } from '@/components/route-sketch';
import { api } from '@/lib/api';
import { InlineError, Loading, useI18n } from '@/lib/i18n';
import { useOnReconnect, useRealtimeEvent } from '@/lib/realtime';
import { LiveRide } from './live-ride';

/** Check the ride now and then in case a live event was missed. */
const FALLBACK_POLL_MS = 30_000;

/** Book a ride, then follow it live on the same page. */
export function Book() {
  const { t, formatDate, formatTime } = useI18n();
  const [rides, setRides] = useState<PassengerRides>({ current: null, scheduled: [] });
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<SavedPlace[]>([]);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [estimate, setEstimate] = useState<FareEstimateResponse | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [when, setWhen] = useState<string>('now');
  const [pricing, setPricing] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  // Same key for every retry of one booking attempt, so a retry never books twice.
  const bookingKey = useRef(newIdempotencyKey());
  const ride = rides.current;

  const loadActive = useCallback(async () => {
    const active = await api().rides.active();
    setRides((state) => applyActiveRides(state, active));
  }, []);

  useEffect(() => {
    loadActive()
      .catch(setError)
      .finally(() => setLoaded(true));
    api()
      .places.saved()
      .then(setSaved, () => undefined);
  }, [loadActive]);

  useRealtimeEvent<RideView>(
    'ride:updated',
    useCallback((updated: RideView) => setRides((state) => applyRideUpdate(state, updated)), []),
  );
  useRealtimeEvent<{ rideId: string; position: DriverPosition }>(
    'driver:position',
    useCallback((p: { rideId: string; position: DriverPosition }) => {
      setRides((state) =>
        state.current?.id === p.rideId && state.current.driver
          ? {
              ...state,
              current: {
                ...state.current,
                driver: { ...state.current.driver, position: p.position },
              },
            }
          : state,
      );
    }, []),
  );
  useOnReconnect(useCallback(() => void loadActive().catch(() => undefined), [loadActive]));

  const rideId = ride?.id;
  const rideActive = ride ? ACTIVE_RIDE_STATUSES.includes(ride.status) : false;
  useEffect(() => {
    if (!rideId || !rideActive) return;
    const poll = setInterval(() => {
      api()
        .rides.get(rideId)
        .then(
          (r) => setRides((state) => applyRideUpdate(state, r)),
          () => undefined,
        );
    }, FALLBACK_POLL_MS);
    return () => clearInterval(poll);
  }, [rideId, rideActive]);

  // Price the trip whenever both ends are set.
  const [quoteRound, setQuoteRound] = useState(0);
  useEffect(() => {
    setEstimate(null);
    if (!pickup || !dropoff) return;
    let cancelled = false;
    setPricing(true);
    setError(null);
    api()
      .fares.estimate({ pickup: toPlaceInput(pickup), dropoff: toPlaceInput(dropoff) })
      .then(
        (e) => {
          if (cancelled) return;
          setEstimate(e);
          setSelected((s) =>
            e.options.some((o) => o.category.key === s) ? s : (e.options[0]?.category.key ?? null),
          );
          bookingKey.current = newIdempotencyKey();
        },
        (err: unknown) => !cancelled && setError(err),
      )
      .finally(() => !cancelled && setPricing(false));
    return () => {
      cancelled = true;
    };
  }, [pickup, dropoff, quoteRound]);

  const option = estimate?.options.find((o) => o.category.key === selected) ?? null;

  async function request() {
    if (!option) return;
    setRequesting(true);
    setError(null);
    try {
      const booked = await api().rides.book(
        {
          quoteId: option.quoteId,
          paymentMethod: 'cash',
          ...(when !== 'now' && { scheduledFor: when }),
        },
        bookingKey.current,
      );
      bookingKey.current = newIdempotencyKey();
      setRides((state) => applyRideUpdate(state, booked));
      setDropoff(null);
      setWhen('now');
    } catch (err) {
      setError(err);
      // An old price needs a fresh quote.
      if (err instanceof ApiError && err.code === 'QUOTE_EXPIRED') setQuoteRound((n) => n + 1);
    } finally {
      setRequesting(false);
    }
  }

  if (!loaded) return <Loading />;

  if (ride) {
    return (
      <LiveRide
        ride={ride}
        onChange={(r) => setRides((state) => applyRideUpdate(state, r))}
        onDone={() => setRides((state) => ({ ...state, current: null }))}
      />
    );
  }

  const slots = scheduleSlots(new Date());
  const destinations = saved.filter((p) => p.label === 'home' || p.label === 'work');

  return (
    <div className="book-layout">
      <section className="book-panel card" aria-labelledby="book-title">
        <h1 id="book-title">{t('book.title')}</h1>
        <PlaceField
          testId="pickup"
          label={t('book.pickup')}
          placeholder={t('search.pickupPlaceholder')}
          value={pickup}
          onChange={setPickup}
          allowCurrentLocation
        />
        <PlaceField
          testId="destination"
          label={t('book.destination')}
          placeholder={t('search.destinationPlaceholder')}
          value={dropoff}
          onChange={setDropoff}
          near={pickup?.location}
        />
        {!dropoff && destinations.length > 0 && (
          <div className="chips">
            {destinations.map((p) => (
              <button key={p.id} type="button" className="chip" onClick={() => setDropoff(p)}>
                {t(p.label === 'home' ? 'saved.home' : 'saved.work')}
              </button>
            ))}
          </div>
        )}

        {pricing && <Loading />}

        {estimate && (
          <div className="choose" data-testid="ride-options">
            <h2>{t('choose.title')}</h2>
            <p className="small muted">
              {t('book.tripSummary', {
                distance: (estimate.route.distanceMeters / 1000).toFixed(1),
                minutes: Math.max(1, Math.round(estimate.route.durationSeconds / 60)),
              })}
            </p>
            <div role="radiogroup" aria-label={t('choose.title')} className="vehicles">
              {estimate.options.map((o) => (
                <VehicleOption
                  key={o.category.key}
                  option={o}
                  selected={o.category.key === selected}
                  onSelect={() => setSelected(o.category.key)}
                />
              ))}
            </div>
            <div className="choose-row">
              <div className="field">
                <label htmlFor="when">{t('choose.when')}</label>
                <select id="when" value={when} onChange={(e) => setWhen(e.target.value)}>
                  <option value="now">{t('choose.now')}</option>
                  {slots.map((s) => (
                    <option key={s.toISOString()} value={s.toISOString()}>
                      {formatDate(s.toISOString(), true)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <span className="label">{t('choose.payment')}</span>
                <span className="payment">💵 {t('choose.cash')}</span>
              </div>
            </div>
            <p className="small muted">{t('choose.priceNote')}</p>
            <InlineError error={error} />
            {option && (
              <button
                type="button"
                className="btn btn-accent btn-block btn-large"
                disabled={requesting}
                onClick={() => void request()}
              >
                {requesting
                  ? t('book.requesting')
                  : when === 'now'
                    ? t('choose.request', {
                        category: option.category.name,
                        price: formatKobo(option.totalKobo),
                      })
                    : t('choose.schedule', {
                        category: option.category.name,
                        time: formatTime(when),
                      })}
              </button>
            )}
          </div>
        )}
        {!estimate && <InlineError error={error} />}

        {rides.scheduled.length > 0 && (
          <div className="scheduled">
            <h2>{t('book.scheduledRides')}</h2>
            <ul className="plain-list">
              {rides.scheduled.map((r) => (
                <li key={r.id}>
                  <strong>{t('ride.scheduled', { time: formatDate(r.scheduledFor, true) })}</strong>
                  <span className="small muted">
                    {r.category.name} · {r.dropoff.name ?? r.dropoff.address}
                  </span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() =>
                      void api()
                        .rides.cancel(r.id)
                        .then(
                          (c) =>
                            setRides((state) => ({
                              ...state,
                              scheduled: state.scheduled.filter((x) => x.id !== c.id),
                            })),
                          setError,
                        )
                    }
                  >
                    {t('ride.cancel')}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
      <section className="map-panel">
        <RouteSketch pickup={pickup} dropoff={dropoff} polyline={estimate?.route.polyline} />
      </section>
    </div>
  );
}
