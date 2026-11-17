'use client';

import { type FormEvent, useEffect, useState } from 'react';
import {
  type AdminUserSummary,
  type Language,
  ROLE_KEYS,
  type RoleKey,
} from '@rideswithme/shared-types';
import { Modal } from '@/components/modal';
import { InlineError } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Kind = 'passenger' | 'driver';

/**
 * Staff open an account for a passenger or a driver; the person signs in later
 * with an SMS code to that phone. A driver then adds their vehicle and
 * documents in the driver app, and staff approve them as usual. Only those who
 * may give staff roles see the other roles.
 */
export function NewUserModal({
  open,
  kind: initialKind = 'passenger',
  staffRoles,
  onClose,
  onCreated,
}: {
  open: boolean;
  kind?: Kind;
  /** Show the other roles (fleet manager, admin...) as well. */
  staffRoles: boolean;
  onClose: () => void;
  onCreated: (u: AdminUserSummary) => void;
}) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Kind>(initialKind);
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [roles, setRoles] = useState<RoleKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setKind(initialKind);
      setError(null);
    }
  }, [open, initialKind]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const user = await api().admin.createUser({
        phone,
        fullName,
        email: email.trim() || null,
        preferredLanguage: language,
        roles: [...new Set<RoleKey>([...(kind === 'driver' ? ['driver' as const] : []), ...roles])],
      });
      setPhone('');
      setFullName('');
      setEmail('');
      setRoles([]);
      onCreated(user);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={t('users.new')} open={open} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} data-testid="new-user-form">
        <fieldset className="field">
          <legend>{t('users.kind')}</legend>
          <div className="checkbox-row">
            {(['passenger', 'driver'] as const).map((k) => (
              <label key={k}>
                <input
                  type="radio"
                  name="new-kind"
                  checked={kind === k}
                  onChange={() => setKind(k)}
                />{' '}
                {t(`role.${k}`)}
              </label>
            ))}
          </div>
        </fieldset>
        <p className="small muted">
          {t(kind === 'driver' ? 'users.newDriverHelp' : 'users.newHelp')}
        </p>
        <div className="field">
          <label htmlFor="new-phone">{t('col.phone')}</label>
          <input
            id="new-phone"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="new-name">{t('col.name')}</label>
          <input
            id="new-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            minLength={2}
            maxLength={120}
          />
        </div>
        <div className="field">
          <label htmlFor="new-email">{t('col.email')}</label>
          <input
            id="new-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-language">{t('col.language')}</label>
          <select
            id="new-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="en">{t('lang.en')}</option>
            <option value="ha">{t('lang.ha')}</option>
          </select>
        </div>
        {staffRoles && (
          <fieldset className="field">
            <legend>{t('users.extraRoles')}</legend>
            <div className="checkbox-row">
              {ROLE_KEYS.filter((r) => r !== 'passenger' && r !== 'driver').map((r) => (
                <label key={r}>
                  <input
                    type="checkbox"
                    checked={roles.includes(r)}
                    onChange={(e) =>
                      setRoles((prev) =>
                        e.target.checked ? [...prev, r] : prev.filter((x) => x !== r),
                      )
                    }
                  />{' '}
                  {t(`role.${r}`)}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <InlineError error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {t(kind === 'driver' ? 'users.newDriver' : 'users.newPassenger')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
