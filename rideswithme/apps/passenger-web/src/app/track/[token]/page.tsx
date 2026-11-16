'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PublicTripView } from '@rideswithme/shared-types';
import type { PassengerMessageKey } from '@rideswithme/utilities';
import { RouteSketch } from '@/components/route-sketch';
import { LanguageSelect } from '@/components/language-select';
import { Loading, useI18n } from '@/lib/i18n';

/** A trip someone shared: status, driver and vehicle, live position. No sign-in, no phone numbers. */
export default function TrackPage() {
  const { t, formatTime } = useI18n();
  const { token } = useParams<{ token: string }>();
  const [trip, setTrip] = useState<PublicTripView | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/track/${token}`, { cache: 'no-store' });
        if (res.status === 404) setGone(true);
        else if (res.ok && !stop) setTrip((await res.json()) as PublicTripView);
      } catch {
        // offline: keep the last view
      }
    };
    void load();
    const timer = setInterval(() => void load(), 10_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [token]);

  return (
    <main className="page" data-testid="track">
      <header className="receipt-head">
        <h1>{t('track.title')}</h1>
        <LanguageSelect />
      </header>
      {gone ? (
        <p className="notice notice-bad">{t('track.expired')}</p>
      ) : !trip ? (
        <Loading />
      ) : (
        <section className="card">
          <p data-testid="track-status">
            <strong>
              {trip.active ? t(`status.${trip.status}` as PassengerMessageKey) : t('track.ended')}
            </strong>
          </p>
          {trip.driver && (
            <p>
              {t('track.driver', {
                name: trip.driver.firstName,
                vehicle: `${trip.driver.vehicle.colour} ${trip.driver.vehicle.make} ${trip.driver.vehicle.model}`,
                plate: trip.driver.vehicle.plateNumber,
              })}
            </p>
          )}
          <dl className="facts">
            <div>
              <dt>{t('rides.from')}</dt>
              <dd>{trip.pickupAddress}</dd>
            </div>
            <div>
              <dt>{t('rides.to')}</dt>
              <dd>{trip.dropoffAddress}</dd>
            </div>
          </dl>
          {trip.position && (
            <p className="small muted">
              {t('track.updated', { time: formatTime(trip.position.receivedAt) })}
            </p>
          )}
          {trip.position && (
            <RouteSketch
              pickup={{ address: trip.pickupAddress, location: trip.position }}
              dropoff={{ address: trip.dropoffAddress, location: trip.position }}
              polyline={null}
              driver={{ lat: trip.position.lat, lng: trip.position.lng }}
              driverStale={false}
            />
          )}
        </section>
      )}
    </main>
  );
}
