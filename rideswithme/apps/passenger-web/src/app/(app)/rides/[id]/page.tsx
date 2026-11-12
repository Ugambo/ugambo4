'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useResource } from '@rideswithme/web-core/client';
import { DriverCard, FareLines, StatusPill } from '@/components/ride-parts';
import { RouteSketch } from '@/components/route-sketch';
import { api } from '@/lib/api';
import { ErrorState, Loading, useI18n } from '@/lib/i18n';

/** One ride: route, driver, and the receipt. */
export default function RidePage() {
  const { t, formatDate } = useI18n();
  const { id } = useParams<{ id: string }>();
  const ride = useResource(() => api().rides.get(id), [id]);

  if (ride.loading && !ride.data) return <Loading />;
  if (ride.error || !ride.data)
    return <ErrorState error={ride.error} onRetry={() => void ride.reload()} />;
  const r = ride.data;

  return (
    <div className="book-layout">
      <section className="book-panel card" data-testid="receipt">
        <Link href="/rides" className="small">
          ← {t('common.back')}
        </Link>
        <div className="receipt-head">
          <h1>{t('receipt.title')}</h1>
          <StatusPill status={r.status} />
        </div>
        <dl className="facts">
          <div>
            <dt>{t('rides.when')}</dt>
            <dd>
              {formatDate(r.completedAt ?? r.cancelledAt ?? r.scheduledFor ?? r.requestedAt, true)}
            </dd>
          </div>
          <div>
            <dt>{t('rides.from')}</dt>
            <dd>{r.pickup.name ?? r.pickup.address}</dd>
          </div>
          <div>
            <dt>{t('rides.to')}</dt>
            <dd>{r.dropoff.name ?? r.dropoff.address}</dd>
          </div>
          {r.actualDistanceMeters !== null && (
            <div>
              <dt>{t('rides.distance')}</dt>
              <dd>{t('rides.distanceKm', { km: (r.actualDistanceMeters / 1000).toFixed(1) })}</dd>
            </div>
          )}
        </dl>
        {r.driver && <DriverCard ride={r} />}
        <FareLines ride={r} />
        {r.status === 'completed' && <p className="small muted">{t('receipt.paidCash')}</p>}
      </section>
      <section className="map-panel">
        <RouteSketch pickup={r.pickup} dropoff={r.dropoff} polyline={r.route.polyline} />
      </section>
    </div>
  );
}
