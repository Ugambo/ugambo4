'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useState } from 'react';
import type { PassengerMessageKey } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

export default function TicketPage() {
  const { t, formatDate } = useI18n();
  const { id } = useParams<{ id: string }>();
  const tk = useResource(() => api().support.get(id), [id]);
  const [body, setBody] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (tk.loading && !tk.data) return <Loading />;
  if (tk.error || !tk.data) return <ErrorState error={tk.error} onRetry={() => void tk.reload()} />;
  const reply = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      tk.setData(await api().support.reply(id, body));
      setBody('');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <section className="card">
      <Link href="/help" className="small">
        ← {t('common.back')}
      </Link>
      <div className="receipt-head">
        <h1>{tk.data.subject}</h1>
        <span className="pill" data-testid="ticket-status">
          {t(`ticketStatus.${tk.data.status}` as PassengerMessageKey)}
        </span>
      </div>
      <ul className="chat" data-testid="ticket-messages">
        {tk.data.messages.map((m) => (
          <li key={m.id} className={m.fromStaff ? undefined : 'mine'}>
            <span className="small">
              {t(m.fromStaff ? 'help.support' : 'help.you')} · {formatDate(m.createdAt, true)}
            </span>
            <br />
            {m.body}
          </li>
        ))}
      </ul>
      <form onSubmit={(e) => void reply(e)}>
        <div className="field">
          <label htmlFor="reply">{t('help.reply')}</label>
          <textarea
            id="reply"
            rows={3}
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
  );
}
