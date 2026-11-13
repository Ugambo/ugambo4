'use client';

import { useEffect, useState } from 'react';
import { ACTIVE_RIDE_STATUSES, type RideView } from '@rideswithme/shared-types';
import {
  canCancel,
  cancellationFeeNow,
  formatKobo,
  positionAge,
  ridePhase,
} from '@rideswithme/utilities';
import { DriverCard, FareLines, PaymentLine } from '@/components/ride-parts';
import { RouteSketch } from '@/components/route-sketch';
import { api } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';

/** The ride in progress: status, driver, where the driver is, price, cancel, then the receipt. */
export function LiveRide({
  ride,
  onChange,
  onDone,
}: {
  ride: RideView;
  onChange: (ride: RideView) => void;
  onDone: () => void;
}) {
  const { t, formatDate } = useI18n();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const active = ACTIVE_RIDE_STATUSES.includes(ride.status);

  // Re-render every second so "last updated" ages stay true.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  const phase = ridePhase(ride);
  const name = ride.driver?.firstName ?? '';
  const position = ride.driver?.position ?? null;
  const age = positionAge(position, now);
  const fee = cancellationFeeNow(ride, now);

  const headline = {
    scheduled: t('ride.scheduled', { time: formatDate(ride.scheduledFor, true) }),
    searching: t('ride.searching'),
    driver_coming: t('ride.driverComing', { name }),
    driver_here: t('ride.driverHere', { name }),
    on_trip: t('ride.onTrip'),
    completed: t('ride.completed'),
    cancelled: t('ride.cancelled'),
    no_driver: t('ride.noDriver'),
  }[phase];

  async function cancel() {
    setBusy(true);
    setError(null);
    try {
      onChange(await api().rides.cancel(ride.id));
      setConfirming(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="book-layout">
      <section
        className="book-panel card"
        aria-live="polite"
        data-testid="live-ride"
        data-status={ride.status}
      >
        <h1 data-testid="ride-headline">{headline}</h1>
        {phase === 'searching' && (
          <p className="searching">
            <span className="spinner" aria-hidden /> {t('ride.searchingHint')}
          </p>
        )}
        {phase === 'driver_here' && <p className="notice notice-ok">{t('ride.driverHereHint')}</p>}
        {ride.status === 'cancelled_by_driver' && (
          <p className="notice notice-bad">{t('ride.cancelledByDriver')}</p>
        )}

        {ride.driver && active && <DriverCard ride={ride} />}
        {age?.stale && active && (
          <p className="small muted" data-testid="position-age">
            {t('ride.lastUpdated', { seconds: age.seconds })}
          </p>
        )}

        <dl className="facts">
          <div>
            <dt>{t('rides.from')}</dt>
            <dd>{ride.pickup.name ?? ride.pickup.address}</dd>
          </div>
          <div>
            <dt>{t('rides.to')}</dt>
            <dd>{ride.dropoff.name ?? ride.dropoff.address}</dd>
          </div>
        </dl>

        {(phase === 'completed' || ride.payment.status === 'outstanding') && (
          <PaymentLine ride={ride} />
        )}
        <h2>{phase === 'completed' ? t('receipt.title') : t('ride.fare')}</h2>
        <FareLines ride={ride} />

        <InlineError error={error} />
        {canCancel(ride.status) &&
          (confirming ? (
            <div className="confirm" role="alertdialog" aria-labelledby="cancel-q">
              <p id="cancel-q">
                <strong>{t('ride.cancelConfirm')}</strong>
              </p>
              {fee > 0 && <p>{t('ride.cancelFee', { amount: formatKobo(fee) })}</p>}
              <div className="confirm-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirming(false)}
                >
                  {t('ride.keep')}
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy}
                  onClick={() => void cancel()}
                >
                  {t('ride.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={() => setConfirming(true)}
            >
              {t('ride.cancel')}
            </button>
          ))}
        {!active && (
          <button type="button" className="btn btn-primary btn-block" onClick={onDone}>
            {t('ride.done')}
          </button>
        )}
      </section>
      <section className="map-panel">
        <RouteSketch
          pickup={ride.pickup}
          dropoff={ride.dropoff}
          polyline={ride.route.polyline}
          driver={active ? position : null}
          driverStale={age?.stale ?? false}
        />
      </section>
    </div>
  );
}
