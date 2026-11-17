'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { TICKET_CATEGORIES, type TicketCategory } from '@rideswithme/shared-types';
import type { PassengerMessageKey } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

/** Contact support, follow requests, and see reports about trips. */
export default function HelpPage() {
  const { t, formatDate } = useI18n();
  const tickets = useResource(() => api().support.list(), []);
  const reports = useResource(() => api().safety.reports(), []);
  // Set by super admins on the dashboard's Settings page; hidden when not set.
  const contact = useResource(
    () =>
      api()
        .supportContact()
        .catch(() => null),
    [],
  );
  const [category, setCategory] = useState<TicketCategory>('ride');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api().support.create({ category, subject, body });
      setSubject('');
      setBody('');
      await tickets.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (tickets.loading && !tickets.data) return <Loading />;
  if (tickets.error)
    return <ErrorState error={tickets.error} onRetry={() => void tickets.reload()} />;
  return (
    <>
      <section className="card">
        <h1>{t('help.title')}</h1>
        {(contact.data?.phone || contact.data?.email) && (
          <p data-testid="support-contact">
            {contact.data.phone && (
              <a href={`tel:${contact.data.phone.replace(/\s/g, '')}`}>
                {t('help.callUs', { phone: contact.data.phone })}
              </a>
            )}
            {contact.data.phone && contact.data.email && ' · '}
            {contact.data.email && (
              <a href={`mailto:${contact.data.email}`}>
                {t('help.emailUs', { email: contact.data.email })}
              </a>
            )}
          </p>
        )}
        <form onSubmit={(e) => void send(e)} data-testid="ticket-form">
          <h2>{t('help.new')}</h2>
          <div className="field">
            <label htmlFor="t-cat">{t('help.category')}</label>
            <select
              id="t-cat"
              value={category}
              onChange={(e) => setCategory(e.target.value as TicketCategory)}
            >
              {TICKET_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {t(`ticketCategory.${c}` as PassengerMessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="t-subject">{t('help.subject')}</label>
            <input
              id="t-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              required
              minLength={3}
              maxLength={120}
            />
          </div>
          <div className="field">
            <label htmlFor="t-body">{t('help.body')}</label>
            <textarea
              id="t-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              maxLength={4000}
            />
          </div>
          <InlineError error={error} />
          <button className="btn btn-primary">{t('help.send')}</button>
        </form>
      </section>
      <section className="card">
        <h2>{t('help.requests')}</h2>
        {tickets.data!.length === 0 ? (
          <Empty message={t('help.none')} />
        ) : (
          <ul className="ride-list" data-testid="tickets">
            {tickets.data!.map((tk) => (
              <li key={tk.id}>
                <Link href={`/help/${tk.id}`} className="ride-row">
                  <span className="ride-row-main">
                    <strong>{tk.subject}</strong>
                    <span className="small muted">{formatDate(tk.lastMessageAt, true)}</span>
                  </span>
                  <span className="pill">
                    {t(`ticketStatus.${tk.status}` as PassengerMessageKey)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      {(reports.data ?? []).length > 0 && (
        <section className="card">
          <h2>{t('help.reports')}</h2>
          <ul className="plain-list">
            {reports.data!.map((r) => (
              <li key={r.id}>
                <strong>{t(`incident.${r.category}` as PassengerMessageKey)}</strong> ·{' '}
                {t(`incidentStatus.${r.status}` as PassengerMessageKey)}
                {r.resolutionNote && <p className="small">{r.resolutionNote}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
