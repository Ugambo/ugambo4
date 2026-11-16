'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../../shell';

export default function TicketPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const tk = useResource(() => api().admin.support.ticket(id), [id]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (tk.loading && !tk.data) return <Loading />;
  if (tk.error || !tk.data) return <ErrorState error={tk.error} onRetry={() => void tk.reload()} />;
  const ticket = tk.data;
  const act = async (fn: () => Promise<typeof ticket>) => {
    setError(null);
    try {
      tk.setData(await fn());
      return true;
    } catch (err) {
      setError(err);
      return false;
    }
  };
  const reply = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api().admin.support.reply(id, body)).then((ok) => ok && setBody(''));
  };
  return (
    <>
      <p>
        <Link href="/support">← {t('common.back')}</Link>
      </p>
      <div className="page-header">
        <h1>{ticket.subject}</h1>
        <span className="pill" data-testid="ticket-status">
          {t(`ticketStatus.${ticket.status}` as MessageKey)}
        </span>
      </div>
      <p className="small muted">
        <Link href={`/users/${ticket.user.id}`}>{ticket.user.name ?? ticket.user.phone}</Link> ·{' '}
        {t(`ticketCategory.${ticket.category}` as MessageKey)}
        {ticket.rideId && (
          <>
            {' · '}
            <Link href={`/rides/${ticket.rideId}`}>{t('sos.ride')}</Link>
          </>
        )}
      </p>
      <ul className="chat" data-testid="ticket-messages">
        {ticket.messages.map((m) => (
          <li key={m.id} className={m.fromStaff ? 'mine' : undefined}>
            <span className="small">
              {t(m.fromStaff ? 'support.fromStaff' : 'support.fromUser')} ·{' '}
              {formatDate(m.createdAt, true)}
            </span>
            <br />
            {m.body}
          </li>
        ))}
      </ul>
      <InlineError error={error} />
      {can('support.manage') && (
        <>
          <form className="card" onSubmit={reply}>
            <div className="field">
              <label htmlFor="reply">{t('support.replyLabel')}</label>
              <textarea
                id="reply"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>
            <button className="btn btn-primary">{t('support.reply')}</button>
          </form>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              void act(() =>
                api().admin.support.setStatus(
                  id,
                  ticket.status === 'resolved' ? 'open' : 'resolved',
                ),
              )
            }
          >
            {t(ticket.status === 'resolved' ? 'support.reopen' : 'support.resolve')}
          </button>
        </>
      )}
    </>
  );
}
