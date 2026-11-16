'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { AdminIncidentView } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../shell';

/** Incident reports, safety ones first. */
export default function IncidentsPage() {
  const { t } = useI18n();
  const [all, setAll] = useState(false);
  const list = useResource(() => api().admin.safety.incidents(all ? undefined : 'open'), [all]);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('incidents.title')}</h1>
        <label className="small">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />{' '}
          {t('sos.showResolved')}
        </label>
      </div>
      {list.data!.length === 0 ? (
        <Empty message={t('incidents.none')} />
      ) : (
        <div className="cards">
          {list.data!.map((i) => (
            <Incident key={i.id} i={i} onChange={() => void list.reload()} />
          ))}
        </div>
      )}
    </>
  );
}

function Incident({ i, onChange }: { i: AdminIncidentView; onChange: () => void }) {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const [note, setNote] = useState('');
  const [error, setError] = useState<unknown>(null);
  const update = async (status: 'investigating' | 'resolved') => {
    setError(null);
    try {
      await api().admin.safety.updateIncident(i.id, { status, ...(note && { note }) });
      onChange();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <section className="card" data-testid="incident-card">
      <div className="page-header">
        <h2>{t(`incident.${i.category}` as MessageKey)}</h2>
        <span className={`pill pill-${i.priority === 'high' ? 'bad' : 'muted'}`}>
          {t(`priority.${i.priority}` as MessageKey)}
        </span>
        <span className="pill">{t(`incidentStatus.${i.status}` as MessageKey)}</span>
      </div>
      <p>{i.description}</p>
      <p className="small muted">
        {t('incidents.reporter')}: {i.reporter.name ?? '—'}{' '}
        {i.reporter.phone && <a href={`tel:${i.reporter.phone}`}>{i.reporter.phone}</a>} (
        {t(`sos.${i.reportedAs}` as MessageKey)}) · {formatDate(i.createdAt, true)}
        {i.rideId && (
          <>
            {' · '}
            <Link href={`/rides/${i.rideId}`}>{t('sos.ride')}</Link>
          </>
        )}
      </p>
      {i.resolutionNote && <p className="small">{i.resolutionNote}</p>}
      <InlineError error={error} />
      {can('safety.manage') && i.status !== 'resolved' && (
        <>
          <div className="field">
            <label htmlFor={`note-${i.id}`}>{t('incidents.note')}</label>
            <input id={`note-${i.id}`} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="toolbar">
            {i.status === 'open' && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void update('investigating')}
              >
                {t('incidents.investigate')}
              </button>
            )}
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void update('resolved')}
            >
              {t('incidents.resolve')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
