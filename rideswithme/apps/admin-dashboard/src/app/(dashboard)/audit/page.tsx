'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AuditLogEntry } from '@rideswithme/shared-types';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

/** Every staff and system action, newest first. Entries cannot be changed or deleted. */
export default function AuditPage() {
  const { t, formatDate } = useI18n();
  const [action, setAction] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(action.trim()), 300);
    return () => clearTimeout(id);
  }, [action]);

  async function load(reset: boolean) {
    setError(null);
    if (reset) setLoading(true);
    try {
      const page = await api().admin.listAuditLogs({
        ...(debounced && { action: debounced }),
        ...(!reset && cursor && { cursor }),
      });
      setItems((prev) => (reset ? page.items : [...prev, ...page.items]));
      setCursor(page.nextCursor);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load(true);
  }, [debounced]);

  return (
    <>
      <div className="page-header">
        <h1>{t('audit.title')}</h1>
      </div>
      <div className="toolbar">
        <input
          aria-label={t('audit.filterAction')}
          placeholder={t('audit.filterAction')}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </div>
      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(true)} />
      ) : items.length === 0 ? (
        <Empty message={t('audit.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="audit-table">
            <thead>
              <tr>
                <th>{t('audit.when')}</th>
                <th>{t('audit.action')}</th>
                <th>{t('audit.actor')}</th>
                <th>{t('audit.target')}</th>
                <th>{t('audit.details')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id}>
                  <td>{formatDate(e.createdAt, true)}</td>
                  <td>
                    <code>{e.action}</code>
                  </td>
                  <td>
                    {e.actorUserId ? (
                      <Link href={`/users/${e.actorUserId}`}>{e.actorUserId.slice(0, 8)}</Link>
                    ) : (
                      t('audit.system')
                    )}
                  </td>
                  <td>
                    {e.targetType}
                    {e.targetId && ` ${e.targetId.slice(0, 8)}`}
                  </td>
                  <td className="small clip" title={JSON.stringify(e.metadata)}>
                    {JSON.stringify(e.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <InlineError error={items.length ? error : null} />
      {cursor && (
        <button type="button" className="btn btn-secondary" onClick={() => void load(false)}>
          {t('common.loadMore')}
        </button>
      )}
    </>
  );
}
