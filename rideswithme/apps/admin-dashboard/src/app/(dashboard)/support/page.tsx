'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { TicketStatus } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

/** The support queue, oldest waiting first. */
export default function SupportPage() {
  const { t, formatDate } = useI18n();
  const [status, setStatus] = useState<TicketStatus | ''>('open');
  const list = useResource(() => api().admin.support.tickets(status ? { status } : {}), [status]);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('support.title')}</h1>
        <select
          aria-label={t('col.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as TicketStatus | '')}
        >
          <option value="">{t('common.all')}</option>
          {(['open', 'waiting_on_user', 'resolved'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`ticketStatus.${s}` as MessageKey)}
            </option>
          ))}
        </select>
      </div>
      {list.data!.length === 0 ? (
        <Empty message={t('support.none')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="tickets-table">
            <tbody>
              {list.data!.map((tk) => (
                <tr key={tk.id}>
                  <td>
                    <Link href={`/support/${tk.id}`}>{tk.subject}</Link>
                  </td>
                  <td>{t(`ticketCategory.${tk.category}` as MessageKey)}</td>
                  <td>{tk.user.name ?? tk.user.phone}</td>
                  <td>{t(`ticketStatus.${tk.status}` as MessageKey)}</td>
                  <td>{formatDate(tk.lastMessageAt, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
