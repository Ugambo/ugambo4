'use client';

import Link from 'next/link';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { type Gender, PASSENGER_ID_TYPES, type PassengerIdType } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { InlineError, Loading, useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { shrinkPhoto, uploadKycPhoto } from '@/lib/photo';

/** The latest date of birth allowed (18 years ago today), for the date picker. */
function latestBirthDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().slice(0, 10);
}

/**
 * Before the first ride: the passenger's details, then their NIN with a photo
 * of an ID and a selfie for staff to review (DECISIONS D-083).
 */
export default function VerifyPage() {
  const { t } = useI18n();
  const me = useResource(() => api().me.get(), []);
  const kyc = useResource(() => api().me.verification(), []);
  const [editDetails, setEditDetails] = useState(false);

  if (!me.data || !kyc.data) return <Loading />;
  const v = kyc.data;
  const reload = async () => {
    await Promise.all([me.reload(), kyc.reload()]);
    setEditDetails(false);
  };
  const needsDetails = v.missingDetails.length > 0 || editDetails;
  const step = needsDetails
    ? 'details'
    : v.status === 'not_started' || v.status === 'rejected'
      ? 'identity'
      : v.status;

  return (
    <section className="card verify" data-testid="verify">
      <h1>{t('kyc.title')}</h1>
      <ol className="steps" aria-label={t('kyc.title')}>
        <li aria-current={step === 'details' ? 'step' : undefined}>{t('kyc.step.details')}</li>
        <li aria-current={step === 'identity' ? 'step' : undefined}>{t('kyc.step.identity')}</li>
        <li aria-current={step === 'pending' || step === 'approved' ? 'step' : undefined}>
          {t('kyc.step.review')}
        </li>
      </ol>
      {!v.required && <p className="notice notice-ok">{t('kyc.notRequired')}</p>}

      {step === 'details' && (
        <DetailsForm
          me={me.data}
          onSaved={() => void reload()}
          onCancel={v.missingDetails.length ? undefined : () => setEditDetails(false)}
        />
      )}

      {step === 'identity' && (
        <>
          {v.status === 'rejected' && (
            <p className="notice notice-bad" data-testid="kyc-rejected">
              {t('kyc.rejected', { reason: v.rejectionReason ?? '' })}
            </p>
          )}
          <IdentityForm onSent={() => void reload()} />
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={() => setEditDetails(true)}
          >
            {t('kyc.editDetails')}
          </button>
        </>
      )}

      {step === 'pending' && (
        <div className="notice notice-wait" data-testid="kyc-pending">
          <strong>{t('kyc.pendingTitle')}</strong>
          <p>{t('kyc.pending')}</p>
        </div>
      )}

      {step === 'approved' && (
        <div data-testid="kyc-approved">
          <p className="notice notice-ok">{t('kyc.approved')}</p>
          <Link href="/" className="btn btn-accent">
            {t('welcome.book')}
          </Link>
        </div>
      )}
    </section>
  );
}

function DetailsForm({
  me,
  onSaved,
  onCancel,
}: {
  me: Awaited<ReturnType<ReturnType<typeof api>['me']['get']>>;
  onSaved: () => void;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  const [fullName, setFullName] = useState(me.fullName ?? '');
  const [email, setEmail] = useState(me.email ?? '');
  const [gender, setGender] = useState<Gender | ''>(me.gender ?? '');
  const [dob, setDob] = useState(me.dateOfBirth ?? '');
  const [ecName, setEcName] = useState(me.emergencyContact?.name ?? '');
  const [ecPhone, setEcPhone] = useState(me.emergencyContact?.phone ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!gender) return;
    setError(null);
    setBusy(true);
    try {
      await api().me.update({
        fullName,
        email: email.trim() || null,
        gender,
        dateOfBirth: dob,
        emergencyContact: { name: ecName, phone: ecPhone },
      });
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void save(e)} data-testid="kyc-details">
      <h2>{t('kyc.step.details')}</h2>
      <p className="small">{t('kyc.detailsIntro')}</p>
      <div className="field">
        <label htmlFor="kyc-name">{t('profile.name')}</label>
        <input
          id="kyc-name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          minLength={2}
          maxLength={120}
          autoComplete="name"
        />
        <p className="small muted">{t('kyc.nameHint')}</p>
      </div>
      <fieldset className="field">
        <legend>{t('kyc.gender')}</legend>
        <div className="checkbox-row">
          {(['female', 'male'] as const).map((g) => (
            <label key={g}>
              <input
                type="radio"
                name="gender"
                value={g}
                checked={gender === g}
                onChange={() => setGender(g)}
                required
              />{' '}
              {t(`kyc.gender.${g}`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label htmlFor="kyc-dob">{t('kyc.dob')}</label>
        <input
          id="kyc-dob"
          type="date"
          value={dob}
          max={latestBirthDate()}
          min="1906-01-01"
          onChange={(e) => setDob(e.target.value)}
          required
          autoComplete="bday"
        />
        <p className="small muted">{t('kyc.dobHint')}</p>
      </div>
      <div className="field">
        <label htmlFor="kyc-email">{t('profile.email')}</label>
        <input
          id="kyc-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <fieldset className="field">
        <legend>{t('kyc.emergency')}</legend>
        <p className="small muted">{t('kyc.emergencyHint')}</p>
        <label htmlFor="kyc-ec-name">{t('kyc.emergencyName')}</label>
        <input
          id="kyc-ec-name"
          value={ecName}
          onChange={(e) => setEcName(e.target.value)}
          required
          minLength={2}
          maxLength={80}
        />
        <label htmlFor="kyc-ec-phone">{t('kyc.emergencyPhone')}</label>
        <input
          id="kyc-ec-phone"
          type="tel"
          inputMode="tel"
          value={ecPhone}
          onChange={(e) => setEcPhone(e.target.value)}
          required
        />
      </fieldset>
      <InlineError error={error} />
      <div className="toolbar">
        <button className="btn btn-primary" disabled={busy || !gender}>
          {t('kyc.continue')}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            {t('common.back')}
          </button>
        )}
      </div>
    </form>
  );
}

type Photo = { blob: Blob; preview: string } | null;

function PhotoPicker({
  id,
  label,
  hint,
  capture,
  photo,
  onPick,
}: {
  id: string;
  label: string;
  hint: string;
  capture: 'user' | 'environment';
  photo: Photo;
  onPick: (p: Photo, problem: MessageKey | null) => void;
}) {
  const { t } = useI18n();
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      onPick(await shrinkPhoto(file), null);
    } catch {
      onPick(null, 'kyc.notPhoto');
    }
  };
  return (
    <div className="field photo-picker">
      <span className="label">{label}</span>
      <p className="small muted">{hint}</p>
      {photo && <img src={photo.preview} alt={label} className="photo-preview" />}
      <label htmlFor={id} className="btn btn-secondary">
        {t(photo ? 'kyc.retake' : 'kyc.takePhoto')}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        capture={capture}
        className="visually-hidden"
        onChange={(e) => void pick(e)}
      />
    </div>
  );
}

function IdentityForm({ onSent }: { onSent: () => void }) {
  const { t } = useI18n();
  const [idType, setIdType] = useState<PassengerIdType>('nin_slip');
  const [nin, setNin] = useState('');
  const [idPhoto, setIdPhoto] = useState<Photo>(null);
  const [selfie, setSelfie] = useState<Photo>(null);
  const [problem, setProblem] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => setProblem(null), [idPhoto, selfie]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!idPhoto || !selfie) {
      setProblem('kyc.needPhotos');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const [idUploadId, selfieUploadId] = await Promise.all([
        uploadKycPhoto('id', idPhoto.blob),
        uploadKycPhoto('selfie', selfie.blob),
      ]);
      await api().me.submitVerification({ idType, nin, idUploadId, selfieUploadId });
      onSent();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void send(e)} data-testid="kyc-identity">
      <h2>{t('kyc.step.identity')}</h2>
      <p className="small">{t('kyc.identityIntro')}</p>
      <div className="field">
        <label htmlFor="kyc-nin">{t('kyc.nin')}</label>
        <input
          id="kyc-nin"
          inputMode="numeric"
          autoComplete="off"
          value={nin}
          onChange={(e) => setNin(e.target.value)}
          required
          pattern="[0-9 ]{11,14}"
        />
        <p className="small muted">{t('kyc.ninHint')}</p>
      </div>
      <div className="field">
        <label htmlFor="kyc-id-type">{t('kyc.idType')}</label>
        <select
          id="kyc-id-type"
          value={idType}
          onChange={(e) => setIdType(e.target.value as PassengerIdType)}
        >
          {PASSENGER_ID_TYPES.map((k) => (
            <option key={k} value={k}>
              {t(`kyc.id.${k}`)}
            </option>
          ))}
        </select>
      </div>
      <PhotoPicker
        id="kyc-id-photo"
        label={t('kyc.idPhoto')}
        hint={t('kyc.idPhotoHint')}
        capture="environment"
        photo={idPhoto}
        onPick={(p, err) => {
          setIdPhoto(p);
          setProblem(err);
        }}
      />
      <PhotoPicker
        id="kyc-selfie"
        label={t('kyc.selfie')}
        hint={t('kyc.selfieHint')}
        capture="user"
        photo={selfie}
        onPick={(p, err) => {
          setSelfie(p);
          setProblem(err);
        }}
      />
      {problem && (
        <p className="inline-error" role="alert">
          {t(problem)}
        </p>
      )}
      <InlineError error={error} />
      <p className="small muted">{t('kyc.privacy')}</p>
      <button className="btn btn-primary" disabled={busy}>
        {t(busy ? 'kyc.sending' : 'kyc.send')}
      </button>
    </form>
  );
}
