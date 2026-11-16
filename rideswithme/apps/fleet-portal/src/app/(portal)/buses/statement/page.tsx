'use client';

import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, ErrorState, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

/** What RideswithMe owes the operator: seats sold (+), refunds and payments made (−). */
export default function StatementPage() {
  const { t, formatDate } = useI18n();
  const lines = useResource(() => api().operator.statement(), []);
  if (lines.loading && !lines.data) return <Loading />;
  if (lines.error) return <ErrorState error={lines.error} onRetry={() => void lines.reload()} />;
  const balance = lines.data![0]?.balanceAfterKobo ?? 0;
  return (
    <>
      <div className="page-header">
        <h1>{t('statement.title')}</h1>
      </div>
      <p className="kpi-value" data-testid="statement-balance">
        {t('statement.balance', { amount: formatKobo(balance) })}
      </p>
      {lines.data!.length === 0 ? (
        <Empty message={t('statement.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="statement-table">
            <thead>
              <tr>
                <th>{t('col.when')}</th>
                <th>{t('col.details')}</th>
                <th className="num">{t('col.amount')}</th>
                <th className="num">{t('col.balance')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.data!.map((l) => (
                <tr key={l.id}>
                  <td>{formatDate(l.createdAt, true)}</td>
                  <td>
                    {t(`entry.${l.kind}` as MessageKey)}
                    {l.memo && <span className="small muted"> · {l.memo}</span>}
                  </td>
                  <td className="num">
                    {l.amountKobo > 0 ? '+' : '−'}
                    {formatKobo(Math.abs(l.amountKobo))}
                  </td>
                  <td className="num">{formatKobo(l.balanceAfterKobo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
