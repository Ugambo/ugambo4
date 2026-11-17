'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Tab = 'pending' | 'approved' | 'rejected';

/** Passengers' identity checks, oldest waiting first (DECISIONS D-083). */
export default function PassengersPage() {
  const { t, formatDate } = useI18n();
  const [tab, setTab] = useState<Tab>('pending');
  const list = useResource(() => api().admin.passengerVerifications.list(tab), [tab]);

  return (
    <>
      <div className="page-header">
        <h1>{t('kyc.title')}</h1>
      </div>
      <p className="small muted">{t('kyc.intro')}</p>
      <div className="tabs" role="tablist">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={tab === s}
            onClick={() => setTab(s)}
          >
            {t(`kyc.tab.${s}`)}
          </button>
        ))}
      </div>
      {list.loading && !list.data ? (
        <Loading />
      ) : list.error || !list.data ? (
        <ErrorState error={list.error} onRetry={() => void list.reload()} />
      ) : list.data.length === 0 ? (
        <Empty message={t(tab === 'pending' ? 'kyc.emptyPending' : 'kyc.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="kyc-table">
            <thead>
              <tr>
                <th>{t('col.name')}</th>
                <th>{t('col.phone')}</th>
                <th>{t('kyc.col.id')}</th>
                <th>{t('kyc.col.sent')}</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((v) => (
                <tr key={v.userId}>
                  <td>
                    <Link href={`/passengers/${v.userId}`}>{v.name ?? t('drivers.unnamed')}</Link>
                  </td>
                  <td>{v.phone ?? '—'}</td>
                  <td>
                    {t(`kyc.id.${v.idType}`)} · NIN •••{v.ninLast4}
                  </td>
                  <td>{formatDate(v.submittedAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
