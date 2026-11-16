'use client';

import Link from 'next/link';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

/** NDPA deletion requests: carried out automatically after the grace period. */
export default function PrivacyPage() {
  const { t, formatDate } = useI18n();
  const list = useResource(() => api().admin.deletionRequests(), []);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('privacy.title')}</h1>
      </div>
      {list.data!.length === 0 ? (
        <Empty message={t('privacy.none')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="deletion-table">
            <tbody>
              {list.data!.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/users/${r.user.id}`}>
                      {r.user.name ?? r.user.phone ?? r.user.id}
                    </Link>
                  </td>
                  <td>{t(`deletionStatus.${r.status}` as MessageKey)}</td>
                  <td>
                    {r.status === 'blocked'
                      ? t('privacy.blocked', { reason: r.blockedReason ?? '' })
                      : t('privacy.scheduled', { date: formatDate(r.scheduledFor) })}
                  </td>
                  <td className="small muted">{formatDate(r.createdAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
