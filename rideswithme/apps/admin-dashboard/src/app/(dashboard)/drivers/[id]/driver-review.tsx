'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import type {
  DocumentRequirement,
  DocumentViewUrl,
  OnlineBlocker,
} from '@rideswithme/shared-types';
import { DocumentStatusPill, DriverStatusPill } from '@/components/status-pill';
import { Modal } from '@/components/modal';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useResource } from '@/lib/use-resource';
import { useMe } from '../../shell';

type Action =
  | { kind: 'view'; requirement: DocumentRequirement }
  | { kind: 'approve'; requirement: DocumentRequirement }
  | { kind: 'reject'; requirement: DocumentRequirement; withdraw: boolean }
  | { kind: 'reject-driver' };

export function DriverReview({ driverId }: { driverId: string }) {
  const { t, formatDate } = useI18n();
  const me = useMe();
  const detail = useResource(() => api().admin.drivers.detail(driverId), [driverId]);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState<unknown>(null);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error || !detail.data)
    return <ErrorState error={detail.error} onRetry={() => void detail.reload()} />;

  const d = detail.data;
  const canVerify = !!me?.permissions.includes('drivers.verify');
  const canView = !!me?.permissions.includes('drivers.documents_view');
  const own = me?.id === d.userId;
  const docName = (key: string) => t(`docType.${key}` as MessageKey);
  const blockers = d.eligibility.blockers.filter((b) => b.code !== 'DRIVER_NOT_APPROVED');
  const readyToApprove =
    d.status === 'pending_review' && blockers.length === 0 && d.submission.gaps.length === 0;

  const approveDriver = async () => {
    setBusy(true);
    setDecisionError(null);
    try {
      detail.setData(await api().admin.drivers.approve(d.userId));
    } catch (err) {
      setDecisionError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <p>
        <Link href="/drivers">← {t('common.back')}</Link>
      </p>
      <div className="page-header">
        <h1>{d.profile.fullName ?? t('drivers.unnamed')}</h1>
        <DriverStatusPill status={d.status} />
      </div>

      {own && <p className="notice notice-wait">{t('review.ownApplication')}</p>}

      <section className="card">
        <dl className="facts">
          <div>
            <dt>{t('review.phone')}</dt>
            <dd>{d.phone}</dd>
          </div>
          <div>
            <dt>{t('review.nin')}</dt>
            <dd>
              {d.profile.ninLast4 ? t('review.endingIn', { last4: d.profile.ninLast4 }) : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('review.vehicle')}</dt>
            <dd>
              {d.vehicle
                ? `${t(`category.${d.vehicle.category.key}` as MessageKey)} · ${d.vehicle.plateNumber} · ${d.vehicle.colour} ${d.vehicle.make} ${d.vehicle.model} (${d.vehicle.year})`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('review.payout')}</dt>
            <dd>
              {d.payoutAccount
                ? `${d.payoutAccount.accountName} · ${t('review.endingIn', { last4: d.payoutAccount.accountNumberLast4 })} (${d.payoutAccount.bankCode})`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>{t('review.submitted')}</dt>
            <dd>{formatDate(d.submittedAt, true)}</dd>
          </div>
        </dl>
      </section>

      <p className={`notice ${d.eligibility.canGoOnline ? 'notice-ok' : 'notice-bad'}`}>
        {t(d.eligibility.canGoOnline ? 'review.canGoOnline' : 'review.cannotGoOnline')}
      </p>

      <section className="card">
        <h2>{t('review.documents')}</h2>
        {d.requirements.map((r) => (
          <div className="doc-row" key={r.key} data-testid={`doc-${r.key}`}>
            <div>
              <div className="doc-title">
                {docName(r.key)} <DocumentStatusPill status={r.status} />
              </div>
              {r.latest && (
                <div className="meta">
                  {t('review.uploaded')} {formatDate(r.latest.createdAt, true)}
                  {r.latest.expiresOn &&
                    ` · ${t('review.expiresOn')} ${formatDate(r.latest.expiresOn)}`}
                  {r.latest.numberLast4 && ` · ${t('review.number')} ${r.latest.numberLast4}`}
                  {r.latest.rejectionReason &&
                    ` · ${t('review.rejectionReason')}: ${r.latest.rejectionReason}`}
                </div>
              )}
            </div>
            {r.latest && (
              <div className="actions">
                {canView && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => setAction({ kind: 'view', requirement: r })}
                  >
                    {t('review.view')}
                  </button>
                )}
                {canVerify && !own && r.latest.status === 'pending' && (
                  <>
                    <button
                      type="button"
                      className="btn btn-primary btn-small"
                      onClick={() => setAction({ kind: 'approve', requirement: r })}
                    >
                      {t('review.approve')}
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-small"
                      onClick={() => setAction({ kind: 'reject', requirement: r, withdraw: false })}
                    >
                      {t('review.reject')}
                    </button>
                  </>
                )}
                {canVerify && !own && r.latest.status === 'approved' && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-small"
                    onClick={() => setAction({ kind: 'reject', requirement: r, withdraw: true })}
                  >
                    {t('review.withdraw')}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </section>

      {canVerify && !own && (
        <section className="card">
          <h2>{t('review.decisionTitle')}</h2>
          {d.status !== 'pending_review' ? (
            <p className="muted">{d.status === 'onboarding' ? t('review.notSubmitted') : null}</p>
          ) : readyToApprove ? (
            <p className="notice notice-ok">{t('review.readyToApprove')}</p>
          ) : (
            <>
              <p className="notice notice-wait">{t('review.notReady')}</p>
              <ul className="blockers">
                {blockers.map((b, i) => (
                  <li key={i}>{blockerText(b)}</li>
                ))}
              </ul>
            </>
          )}
          <InlineError error={decisionError} />
          {d.status === 'pending_review' && (
            <div className="decision">
              <button
                type="button"
                className="btn btn-primary"
                disabled={!readyToApprove || busy}
                onClick={() => void approveDriver()}
              >
                {t('review.approveDriver')}
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={busy}
                onClick={() => setAction({ kind: 'reject-driver' })}
              >
                {t('review.rejectDriver')}
              </button>
            </div>
          )}
        </section>
      )}

      <details className="card">
        <summary>{t('review.history')}</summary>
        {d.documentHistory.map((doc) => (
          <div className="doc-row" key={doc.id}>
            <div>
              <div className="doc-title">
                {docName(doc.documentType)} <DocumentStatusPill status={doc.status} />
              </div>
              <div className="meta">
                {t('review.uploaded')} {formatDate(doc.createdAt, true)}
                {doc.rejectionReason && ` · ${doc.rejectionReason}`}
              </div>
            </div>
          </div>
        ))}
      </details>

      {action?.kind === 'view' && (
        <DocumentViewer
          driverId={d.userId}
          requirement={action.requirement}
          title={docName(action.requirement.key)}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === 'approve' && (
        <ApproveDocument
          driverId={d.userId}
          requirement={action.requirement}
          title={t('review.approveDocTitle', { document: docName(action.requirement.key) })}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null);
            void detail.reload();
          }}
        />
      )}
      {(action?.kind === 'reject' || action?.kind === 'reject-driver') && (
        <RejectWithReason
          title={
            action.kind === 'reject-driver'
              ? t('review.rejectDriverTitle')
              : t(action.withdraw ? 'review.withdrawTitle' : 'review.rejectDocTitle', {
                  document: docName(action.requirement.key),
                })
          }
          onClose={() => setAction(null)}
          submit={async (reason) => {
            if (action.kind === 'reject-driver')
              detail.setData(await api().admin.drivers.reject(d.userId, reason));
            else {
              await api().admin.drivers.rejectDocument(d.userId, action.requirement.latest!.id, {
                reason,
                withdrawApproval: action.withdraw,
              });
              await detail.reload();
            }
            setAction(null);
          }}
        />
      )}
    </>
  );

  function blockerText(b: OnlineBlocker): string {
    return 'documentType' in b
      ? t(`blocker.${b.code}` as MessageKey, { document: docName(b.documentType) })
      : t(`blocker.${b.code}` as MessageKey);
  }
}

function DocumentViewer({
  driverId,
  requirement,
  title,
  onClose,
}: {
  driverId: string;
  requirement: DocumentRequirement;
  title: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const link = useResource<DocumentViewUrl>(
    () => api().admin.drivers.documentUrl(driverId, requirement.latest!.id),
    [requirement.latest?.id],
  );
  return (
    <Modal title={title} open onClose={onClose} wide>
      <div className="modal-body viewer">
        {link.loading && <Loading />}
        {link.error ? <ErrorState error={link.error} onRetry={() => void link.reload()} /> : null}
        {link.data &&
          (link.data.contentType === 'application/pdf' ? (
            <iframe src={link.data.url} title={title} />
          ) : (
            <img src={link.data.url} alt={title} />
          ))}
        <p className="small muted">{t('review.documentLinkExpires')}</p>
      </div>
    </Modal>
  );
}

function ApproveDocument({
  driverId,
  requirement,
  title,
  onClose,
  onDone,
}: {
  driverId: string;
  requirement: DocumentRequirement;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useI18n();
  const [expiresOn, setExpiresOn] = useState(requirement.latest?.expiresOn ?? '');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api().admin.drivers.approveDocument(
        driverId,
        requirement.latest!.id,
        expiresOn ? { expiresOn } : {},
      );
      onDone();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} open onClose={onClose}>
      <form className="modal-body" onSubmit={(e) => void submit(e)}>
        {requirement.requiresExpiry && (
          <div className="field">
            <label htmlFor="expiresOn">{t('review.expiresOn')}</label>
            <input
              id="expiresOn"
              type="date"
              required
              value={expiresOn}
              onChange={(e) => setExpiresOn(e.target.value)}
            />
            <span className="hint">{t('review.expiryPrompt')}</span>
          </div>
        )}
        <InlineError error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {t('review.approve')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function RejectWithReason({
  title,
  onClose,
  submit,
}: {
  title: string;
  onClose: () => void;
  submit: (reason: string) => Promise<void>;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await submit(reason.trim());
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={title} open onClose={onClose}>
      <form className="modal-body" onSubmit={(e) => void onSubmit(e)}>
        <div className="field">
          <label htmlFor="reason">{t('review.reason')}</label>
          <textarea
            id="reason"
            required
            minLength={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
        <InlineError error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-danger" disabled={busy || reason.trim().length < 3}>
            {t('review.reject')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
