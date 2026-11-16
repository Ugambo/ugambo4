'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../shell';

export default function FleetsPage() {
  const { t } = useI18n();
  const can = useCan();
  const fleets = useResource(() => api().admin.fleets.list(), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    name: '',
    managerPhone: '',
    contactPhone: '',
    contactEmail: '',
  });
  const [error, setError] = useState<unknown>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api().admin.fleets.create({
        name: form.name,
        managerPhone: form.managerPhone,
        ...(form.contactPhone && { contactPhone: form.contactPhone }),
        ...(form.contactEmail && { contactEmail: form.contactEmail }),
      });
      setCreating(false);
      setForm({ name: '', managerPhone: '', contactPhone: '', contactEmail: '' });
      await fleets.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (fleets.loading && !fleets.data) return <Loading />;
  if (fleets.error) return <ErrorState error={fleets.error} onRetry={() => void fleets.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('fleets.title')}</h1>
        {can('fleets.manage') && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            {t('fleets.create')}
          </button>
        )}
      </div>
      {fleets.data!.length === 0 ? (
        <Empty message={t('fleets.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="fleets-table">
            <thead>
              <tr>
                <th>{t('col.name')}</th>
                <th>{t('col.status')}</th>
                <th className="num">{t('fleets.drivers')}</th>
                <th>{t('fleets.managers')}</th>
              </tr>
            </thead>
            <tbody>
              {fleets.data!.map((f) => (
                <tr key={f.id}>
                  <td>
                    <Link href={`/fleets/${f.id}`}>{f.name}</Link>
                  </td>
                  <td>
                    <span className={`pill pill-${f.status === 'active' ? 'ok' : 'bad'}`}>
                      {t(`fleetStatus.${f.status}`)}
                    </span>
                  </td>
                  <td className="num">{f.drivers}</td>
                  <td>{f.managers.map((m) => m.name ?? m.phone).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title={t('fleets.create')} open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={(e) => void create(e)}>
          {(
            [
              ['name', 'fleets.name', true],
              ['managerPhone', 'fleets.managerPhone', true],
              ['contactPhone', 'fleets.contactPhone', false],
              ['contactEmail', 'fleets.contactEmail', false],
            ] as const
          ).map(([k, label, required]) => (
            <div className="field" key={k}>
              <label htmlFor={`fleet-${k}`}>{t(label)}</label>
              <input
                id={`fleet-${k}`}
                value={form[k]}
                required={required}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
              {k === 'managerPhone' && <span className="hint">{t('fleets.managerHint')}</span>}
            </div>
          ))}
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary">{t('fleets.create')}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
