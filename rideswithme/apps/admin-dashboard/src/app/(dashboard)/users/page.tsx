'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type AdminUserSummary,
  type Language,
  ROLE_KEYS,
  type RoleKey,
  type UserStatus,
} from '@rideswithme/shared-types';
import { Modal } from '@/components/modal';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../shell';

/** A super admin opens an account; the person signs in later with an SMS code. */
function NewUserModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (u: AdminUserSummary) => void;
}) {
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [language, setLanguage] = useState<Language>('en');
  const [roles, setRoles] = useState<RoleKey[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

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
        roles,
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
      <form onSubmit={(e) => void submit(e)}>
        <p className="small muted">{t('users.newHelp')}</p>
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
        <fieldset className="field">
          <legend>{t('users.extraRoles')}</legend>
          <div className="checkbox-row">
            {ROLE_KEYS.filter((r) => r !== 'passenger').map((r) => (
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
        <InlineError error={error} />
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {t('users.new')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function UsersPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [role, setRole] = useState<RoleKey | ''>('');
  const [status, setStatus] = useState<UserStatus | ''>('');
  const [items, setItems] = useState<AdminUserSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(id);
  }, [search]);

  async function load(reset: boolean) {
    setError(null);
    if (reset) setLoading(true);
    try {
      const page = await api().admin.listUsers({
        ...(debounced && { search: debounced }),
        ...(role && { role }),
        ...(status && { status }),
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
  }, [debounced, role, status]);

  return (
    <>
      <div className="page-header">
        <h1>{t('users.title')}</h1>
        {can('users.create') && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            {t('users.new')}
          </button>
        )}
      </div>
      <NewUserModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(u) => router.push(`/users/${u.id}`)}
      />
      <div className="toolbar">
        <input
          type="search"
          aria-label={t('users.search')}
          placeholder={t('users.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label={t('col.roles')}
          value={role}
          onChange={(e) => setRole(e.target.value as RoleKey | '')}
        >
          <option value="">{t('users.anyRole')}</option>
          {ROLE_KEYS.map((r) => (
            <option key={r} value={r}>
              {t(`role.${r}`)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('col.status')}
          value={status}
          onChange={(e) => setStatus(e.target.value as UserStatus | '')}
        >
          <option value="">{t('users.anyStatus')}</option>
          {(['active', 'suspended', 'deleted'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`userStatus.${s}`)}
            </option>
          ))}
        </select>
      </div>
      {loading ? (
        <Loading />
      ) : error && items.length === 0 ? (
        <ErrorState error={error} onRetry={() => void load(true)} />
      ) : items.length === 0 ? (
        <Empty message={t('users.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="users-table">
            <thead>
              <tr>
                <th>{t('col.name')}</th>
                <th>{t('col.phone')}</th>
                <th>{t('col.roles')}</th>
                <th>{t('col.status')}</th>
                <th>{t('col.joined')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <Link href={`/users/${u.id}`}>{u.fullName ?? t('drivers.unnamed')}</Link>
                  </td>
                  <td>{u.phone ?? '—'}</td>
                  <td>{u.roles.map((r) => t(`role.${r}`)).join(', ')}</td>
                  <td>
                    <span className={`pill pill-${u.status === 'active' ? 'ok' : 'bad'}`}>
                      {t(`userStatus.${u.status}`)}
                    </span>
                  </td>
                  <td>{formatDate(u.createdAt)}</td>
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
