'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';
import type { AdminBusBookingView } from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../shell';

const blank = { name: '', managerPhone: '', fee: '10', contactPhone: '', contactEmail: '' };

export default function BusOperatorsPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const operators = useResource(() => api().admin.buses.operators(), []);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [error, setError] = useState<unknown>(null);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<AdminBusBookingView[] | null>(null);
  const [findError, setFindError] = useState<unknown>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api().admin.buses.createOperator({
        name: form.name,
        managerPhone: form.managerPhone,
        serviceFeeBps: Math.round(Number(form.fee) * 100),
        ...(form.contactPhone && { contactPhone: form.contactPhone }),
        ...(form.contactEmail && { contactEmail: form.contactEmail }),
      });
      setCreating(false);
      setForm(blank);
      await operators.reload();
    } catch (err) {
      setError(err);
    }
  };

  const find = async (e: FormEvent) => {
    e.preventDefault();
    setFindError(null);
    const q = query.trim();
    try {
      setFound(
        await api().admin.buses.bookings(
          /^[A-Za-z0-9]{8}$/.test(q) ? { reference: q } : { phone: q },
        ),
      );
    } catch (err) {
      setFindError(err);
    }
  };

  if (operators.loading && !operators.data) return <Loading />;
  if (operators.error)
    return <ErrorState error={operators.error} onRetry={() => void operators.reload()} />;
  return (
    <>
      <div className="page-header">
        <h1>{t('buses.title')}</h1>
        {can('buses.manage') && (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            {t('buses.create')}
          </button>
        )}
      </div>
      {operators.data!.length === 0 ? (
        <Empty message={t('buses.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="operators-table">
            <thead>
              <tr>
                <th>{t('col.name')}</th>
                <th>{t('col.status')}</th>
                <th className="num">{t('buses.fee')}</th>
                <th className="num">{t('buses.balance')}</th>
                <th>{t('buses.managers')}</th>
              </tr>
            </thead>
            <tbody>
              {operators.data!.map((o) => (
                <tr key={o.id}>
                  <td>
                    <Link href={`/buses/${o.id}`}>{o.name}</Link>
                  </td>
                  <td>
                    <span className={`pill pill-${o.status === 'active' ? 'ok' : 'bad'}`}>
                      {t(`busStatus.${o.status}` as MessageKey)}
                    </span>
                  </td>
                  <td className="num">{o.serviceFeeBps / 100}%</td>
                  <td className="num">{formatKobo(o.balanceKobo)}</td>
                  <td>{o.managers.map((m) => m.name ?? m.phone).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>{t('buses.findBooking')}</h2>
      <form className="toolbar" onSubmit={(e) => void find(e)}>
        <input
          type="search"
          aria-label={t('buses.findHint')}
          placeholder={t('buses.findHint')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          required
        />
        <button className="btn btn-secondary">{t('buses.find')}</button>
      </form>
      <InlineError error={findError} />
      {found &&
        (found.length === 0 ? (
          <Empty message={t('buses.noBookings')} />
        ) : (
          <div className="table-wrap">
            <table data-testid="bookings-table">
              <thead>
                <tr>
                  <th>{t('bus.col.reference')}</th>
                  <th>{t('bus.col.passenger')}</th>
                  <th>{t('bus.col.departs')}</th>
                  <th>{t('bus.col.route')}</th>
                  <th>{t('col.status')}</th>
                  <th className="num">{t('bus.col.total')}</th>
                </tr>
              </thead>
              <tbody>
                {found.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <Link href={`/buses/bookings/${b.id}`}>
                        <code>{b.reference}</code>
                      </Link>
                    </td>
                    <td>{b.passenger.name ?? b.passenger.phone}</td>
                    <td>{formatDate(b.departure.departsAt, true)}</td>
                    <td>
                      {b.departure.route.originCity} → {b.departure.route.destinationCity}
                    </td>
                    <td>{t(`bookingStatus.${b.status}` as MessageKey)}</td>
                    <td className="num">{formatKobo(b.totalKobo)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Modal title={t('buses.create')} open={creating} onClose={() => setCreating(false)}>
        <form onSubmit={(e) => void create(e)}>
          {(
            [
              ['name', 'buses.name', true],
              ['managerPhone', 'buses.managerPhone', true],
              ['fee', 'buses.fee', true],
              ['contactPhone', 'buses.contactPhone', false],
              ['contactEmail', 'buses.contactEmail', false],
            ] as const
          ).map(([k, label, required]) => (
            <div className="field" key={k}>
              <label htmlFor={`op-${k}`}>{t(label)}</label>
              <input
                id={`op-${k}`}
                value={form[k]}
                required={required}
                {...(k === 'fee' && { type: 'number', min: 0, max: 50, step: 0.01 })}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
              {k === 'managerPhone' && <span className="hint">{t('buses.managerHint')}</span>}
              {k === 'fee' && <span className="hint">{t('buses.feeHint')}</span>}
            </div>
          ))}
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary">{t('buses.create')}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
