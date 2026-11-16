'use client';

import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Ratings a user received, with comments (staff see who rated). */
export function UserRatings({ userId }: { userId: string }) {
  const { t, formatDate } = useI18n();
  const r = useResource(() => api().admin.userRatings(userId), [userId]);
  if (!r.data) return null;
  const { asDriver, asPassenger } = r.data;
  const recent = [...asDriver.recent, ...asPassenger.recent].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <section data-testid="user-ratings">
      <h2>{t('ratings.title')}</h2>
      <p>
        {asDriver.count > 0 &&
          t('ratings.asDriver', { average: asDriver.average ?? '—', count: asDriver.count })}{' '}
        {asPassenger.count > 0 &&
          t('ratings.asPassenger', {
            average: asPassenger.average ?? '—',
            count: asPassenger.count,
          })}
        {asDriver.count + asPassenger.count === 0 && t('ratings.none')}
      </p>
      {recent.length > 0 && (
        <ul className="plain-list card">
          {recent.slice(0, 10).map((x) => (
            <li key={`${x.rideId}:${x.ratedRole}`}>
              {'★'.repeat(x.stars)}
              {'☆'.repeat(5 - x.stars)} {x.comment}{' '}
              <span className="small muted">
                {x.raterName ?? ''} · {formatDate(x.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Messages between the ride's passenger and driver (safety staff only). */
export function RideMessages({ rideId }: { rideId: string }) {
  const { t, formatTime } = useI18n();
  const m = useResource(() => api().admin.safety.rideMessages(rideId), [rideId]);
  if (m.error || !m.data) return null;
  return (
    <section data-testid="ride-messages">
      <h2>{t('ride.messages')}</h2>
      {m.data.length === 0 ? (
        <p className="small muted">{t('ride.noMessages')}</p>
      ) : (
        <ul className="chat">
          {m.data.map((x) => (
            <li key={x.id} className={x.from === 'driver' ? 'mine' : undefined}>
              <span className="small">
                {t(x.from === 'driver' ? 'sos.driver' : 'sos.passenger')} ·{' '}
                {formatTime(x.createdAt)}
              </span>
              <br />
              {x.body}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
