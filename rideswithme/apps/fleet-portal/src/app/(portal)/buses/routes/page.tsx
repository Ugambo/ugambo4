'use client';

import { type FormEvent, useState } from 'react';
import { useResource } from '@rideswithme/web-core/client';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

const blank = {
  originCity: '',
  originTerminal: '',
  destinationCity: '',
  destinationTerminal: '',
  durationMinutes: '',
};

export default function RoutesPage() {
  const { t } = useI18n();
  const routes = useResource(() => api().operator.routes(), []);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api().operator.createRoute({ ...form, durationMinutes: Number(form.durationMinutes) });
      setForm(blank);
      await routes.reload();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, isActive: boolean) => {
    try {
      await api().operator.updateRoute(id, { isActive });
      await routes.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (routes.loading && !routes.data) return <Loading />;
  if (routes.error) return <ErrorState error={routes.error} onRetry={() => void routes.reload()} />;
  const field = (k: keyof typeof blank, label: string, type = 'text') => (
    <div className="field">
      <label htmlFor={`route-${k}`}>{label}</label>
      <input
        id={`route-${k}`}
        type={type}
        value={form[k]}
        onChange={set(k)}
        required
        {...(type === 'number' ? { min: 10, max: 2880 } : { minLength: 2 })}
      />
    </div>
  );
  return (
    <>
      <div className="page-header">
        <h1>{t('routes.title')}</h1>
      </div>
      {routes.data!.length === 0 ? (
        <Empty message={t('routes.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="routes-table">
            <thead>
              <tr>
                <th>{t('col.route')}</th>
                <th>{t('routes.originTerminal')}</th>
                <th>{t('routes.destinationTerminal')}</th>
                <th>{t('routes.duration')}</th>
                <th>{t('col.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {routes.data!.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>
                      {r.originCity} → {r.destinationCity}
                    </strong>
                  </td>
                  <td>{r.originTerminal}</td>
                  <td>{r.destinationTerminal}</td>
                  <td>
                    {t('routes.hours', {
                      hours: Math.floor(r.durationMinutes / 60),
                      minutes: r.durationMinutes % 60,
                    })}
                  </td>
                  <td>
                    <span className={`pill pill-${r.isActive ? 'ok' : 'muted'}`}>
                      {t(r.isActive ? 'routes.active' : 'routes.inactive')}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => void toggle(r.id, !r.isActive)}
                    >
                      {t(r.isActive ? 'routes.switchOff' : 'routes.switchOn')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="card" onSubmit={(e) => void add(e)} data-testid="route-form">
        <h2>{t('routes.new')}</h2>
        <div className="form-grid">
          {field('originCity', t('routes.originCity'))}
          {field('originTerminal', t('routes.originTerminal'))}
          {field('destinationCity', t('routes.destinationCity'))}
          {field('destinationTerminal', t('routes.destinationTerminal'))}
          {field('durationMinutes', t('routes.duration'), 'number')}
        </div>
        <InlineError error={error} />
        <button className="btn btn-primary" disabled={busy}>
          {t('routes.save')}
        </button>
      </form>
    </>
  );
}
