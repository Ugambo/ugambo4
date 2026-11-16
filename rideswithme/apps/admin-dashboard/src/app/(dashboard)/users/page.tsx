'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  type AdminUserSummary,
  ROLE_KEYS,
  type RoleKey,
  type UserStatus,
} from '@rideswithme/shared-types';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function UsersPage() {
  const { t, formatDate } = useI18n();
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
      </div>
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
