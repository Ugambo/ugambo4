'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../../shell';

/** The ID photo or selfie, from a link that works for a minute (each view is audited). */
function KycPhoto({
  userId,
  which,
  label,
}: {
  userId: string;
  which: 'id' | 'selfie';
  label: string;
}) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    api()
      .admin.passengerVerifications.viewUrl(userId, which)
      .then((r) => live && setUrl(r.url))
      .catch((err: unknown) => live && setError(err));
    return () => {
      live = false;
    };
  }, [userId, which]);
  return (
    <figure className="card kyc-photo" data-testid={`kyc-photo-${which}`}>
      <figcaption>
        <strong>{label}</strong>
      </figcaption>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={label} />
        </a>
      ) : error ? (
        <InlineError error={error} />
      ) : (
        <Loading />
      )}
      {url && <p className="small muted">{t('kyc.photoNote')}</p>}
    </figure>
  );
}

/** One passenger's identity check: their details, the two photos, and the decision. */
export default function PassengerVerificationPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const { id } = useParams<{ id: string }>();
  const v = useResource(() => api().admin.passengerVerifications.get(id), [id]);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  if (v.loading && !v.data) return <Loading />;
  if (v.error || !v.data) return <ErrorState error={v.error} onRetry={() => void v.reload()} />;
  const d = v.data;

  const act = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      await fn();
      setRejecting(false);
      await v.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const reject = (e: FormEvent) => {
    e.preventDefault();
    void act(() => api().admin.passengerVerifications.reject(d.userId, reason));
  };
  const age = d.dateOfBirth
    ? Math.floor((Date.now() - Date.parse(`${d.dateOfBirth}T00:00:00Z`)) / (365.25 * 86_400_000))
    : null;

  return (
    <>
      <div className="page-header">
        <h1>{d.name ?? t('drivers.unnamed')}</h1>
        <span
          className={`pill pill-${d.status === 'approved' ? 'ok' : d.status === 'rejected' ? 'bad' : 'wait'}`}
          data-testid="kyc-status"
        >
          {t(`kyc.tab.${d.status}`)}
        </span>
        {d.status === 'pending' && can('passengers.verify') && (
          <>
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void act(() => api().admin.passengerVerifications.approve(d.userId))}
            >
              {t('kyc.approve')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => {
                setReason('');
                setRejecting(true);
              }}
            >
              {t('kyc.reject')}
            </button>
          </>
        )}
      </div>
      <p className="small muted">{t('kyc.checkHint')}</p>
      <InlineError error={rejecting ? null : error} />

      <div className="card">
        <dl className="facts">
          <div>
            <dt>{t('col.phone')}</dt>
            <dd>{d.phone ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('kyc.gender')}</dt>
            <dd>{d.gender ? t(`kyc.gender.${d.gender}`) : '—'}</dd>
          </div>
          <div>
            <dt>{t('kyc.dob')}</dt>
            <dd>
              {d.dateOfBirth
                ? `${formatDate(d.dateOfBirth)} (${t('kyc.age', { age: age ?? 0 })})`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('kyc.col.id')}</dt>
            <dd>
              {t(`kyc.id.${d.idType}`)} · NIN •••{d.ninLast4}
            </dd>
          </div>
          <div>
            <dt>{t('kyc.emergency')}</dt>
            <dd>
              {d.emergencyContact ? `${d.emergencyContact.name}, ${d.emergencyContact.phone}` : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('col.email')}</dt>
            <dd>{d.email ?? '—'}</dd>
          </div>
          <div>
            <dt>{t('kyc.col.sent')}</dt>
            <dd>{formatDate(d.submittedAt, true)}</dd>
          </div>
          {d.reviewedAt && (
            <div>
              <dt>{t('kyc.reviewed')}</dt>
              <dd>
                {formatDate(d.reviewedAt, true)} · {d.reviewedBy?.name ?? '—'}
              </dd>
            </div>
          )}
          {d.rejectionReason && (
            <div>
              <dt>{t('col.reason')}</dt>
              <dd>{d.rejectionReason}</dd>
            </div>
          )}
        </dl>
        <Link href={`/users/${d.userId}`} className="small">
          {t('kyc.openUser')}
        </Link>
      </div>

      <div className="kyc-photos">
        <KycPhoto userId={d.userId} which="id" label={t('kyc.idPhoto')} />
        <KycPhoto userId={d.userId} which="selfie" label={t('kyc.selfie')} />
      </div>

      <Modal title={t('kyc.reject')} open={rejecting} onClose={() => setRejecting(false)}>
        <form onSubmit={reject}>
          <div className="field">
            <label htmlFor="kyc-reason">{t('kyc.rejectReason')}</label>
            <textarea
              id="kyc-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
              maxLength={500}
            />
            <p className="small muted">{t('kyc.rejectHint')}</p>
          </div>
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setRejecting(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-danger" disabled={busy}>
              {t('kyc.reject')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
