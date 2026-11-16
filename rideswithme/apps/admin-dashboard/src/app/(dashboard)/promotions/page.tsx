'use client';

import { type FormEvent, useState } from 'react';
import { formatKobo, nairaToKobo } from '@rideswithme/utilities';
import { useResource } from '@rideswithme/web-core/client';
import { Modal } from '@/components/modal';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { useCan } from '../shell';

const local = (d: Date) => new Date(d.getTime() + 3_600_000).toISOString().slice(0, 16);
const blank = () => ({
  code: '',
  description: '',
  type: 'percent' as 'percent' | 'fixed',
  value: '',
  max: '',
  minFare: '0',
  perUser: '1',
  maxUses: '',
  firstRide: false,
  starts: local(new Date()),
  ends: local(new Date(Date.now() + 30 * 86_400_000)),
});

/** Promotion codes for rides: RideswithMe pays the discount. */
export default function PromotionsPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const list = useResource(() => api().admin.promotions.list(), []);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [error, setError] = useState<unknown>(null);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      // Times are typed in Nigerian time (UTC+1).
      const iso = (v: string) => new Date(`${v}:00+01:00`).toISOString();
      await api().admin.promotions.create({
        code: f.code,
        description: f.description,
        discountType: f.type,
        ...(f.type === 'percent'
          ? { percentBps: Math.round(Number(f.value) * 100) }
          : { amountKobo: nairaToKobo(f.value) }),
        ...(f.max && { maxDiscountKobo: nairaToKobo(f.max) }),
        minFareKobo: nairaToKobo(f.minFare || '0'),
        perUserLimit: Number(f.perUser),
        ...(f.maxUses && { maxRedemptions: Number(f.maxUses) }),
        firstRideOnly: f.firstRide,
        startsAt: iso(f.starts),
        endsAt: iso(f.ends),
      });
      setOpen(false);
      setF(blank());
      await list.reload();
    } catch (err) {
      setError(err);
    }
  };

  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <ErrorState error={list.error} onRetry={() => void list.reload()} />;
  const field = (
    k: keyof ReturnType<typeof blank>,
    label: Parameters<typeof t>[0],
    props: Record<string, unknown> = {},
  ) => (
    <div className="field">
      <label htmlFor={`promo-${k}`}>{t(label)}</label>
      <input
        id={`promo-${k}`}
        value={String(f[k])}
        onChange={(e) => setF({ ...f, [k]: e.target.value })}
        {...props}
      />
    </div>
  );
  return (
    <>
      <div className="page-header">
        <h1>{t('promotions.title')}</h1>
        {can('promotions.manage') && (
          <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
            {t('promotions.create')}
          </button>
        )}
      </div>
      <p className="small muted">{t('promotions.funded')}</p>
      {list.data!.length === 0 ? (
        <Empty message={t('promotions.empty')} />
      ) : (
        <div className="table-wrap">
          <table data-testid="promotions-table">
            <tbody>
              {list.data!.map((p) => (
                <tr key={p.id}>
                  <td>
                    <strong>{p.code}</strong>
                    <br />
                    <span className="small muted">{p.description}</span>
                  </td>
                  <td>
                    {p.discountType === 'percent'
                      ? `${(p.percentBps ?? 0) / 100}%${p.maxDiscountKobo ? ` (≤ ${formatKobo(p.maxDiscountKobo)})` : ''}`
                      : formatKobo(p.amountKobo ?? 0)}
                  </td>
                  <td className="small">
                    {formatDate(p.startsAt)} – {formatDate(p.endsAt)}
                  </td>
                  <td className="small">
                    {t('promotions.used', {
                      used: p.redemptions.used,
                      reserved: p.redemptions.reserved,
                      amount: formatKobo(p.redemptions.discountKobo),
                    })}
                  </td>
                  <td>
                    <span className={`pill pill-${p.isActive ? 'ok' : 'muted'}`}>
                      {t(p.isActive ? 'promotions.active' : 'promotions.inactive')}
                    </span>
                  </td>
                  <td>
                    {can('promotions.manage') && (
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() =>
                          void api()
                            .admin.promotions.update(p.id, { isActive: !p.isActive })
                            .then(() => list.reload())
                        }
                      >
                        {t(p.isActive ? 'promotions.switchOff' : 'promotions.switchOn')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal title={t('promotions.create')} open={open} onClose={() => setOpen(false)}>
        <form onSubmit={(e) => void create(e)}>
          {field('code', 'promotions.code', { required: true, pattern: '[A-Za-z0-9]{4,20}' })}
          {field('description', 'promotions.description', { required: true, minLength: 3 })}
          <div className="field">
            <label htmlFor="promo-type">{t('promotions.type')}</label>
            <select
              id="promo-type"
              value={f.type}
              onChange={(e) => setF({ ...f, type: e.target.value as 'percent' | 'fixed' })}
            >
              <option value="percent">{t('promotions.percent')}</option>
              <option value="fixed">{t('promotions.fixed')}</option>
            </select>
          </div>
          {field('value', f.type === 'percent' ? 'promotions.percentValue' : 'promotions.amount', {
            required: true,
            inputMode: 'decimal',
          })}
          {f.type === 'percent' && field('max', 'promotions.max', { inputMode: 'decimal' })}
          {field('minFare', 'promotions.minFare', { inputMode: 'decimal' })}
          {field('perUser', 'promotions.perUser', { type: 'number', min: 1 })}
          {field('maxUses', 'promotions.maxUses', { type: 'number', min: 1 })}
          {field('starts', 'promotions.starts', { type: 'datetime-local', required: true })}
          {field('ends', 'promotions.ends', { type: 'datetime-local', required: true })}
          <label className="small">
            <input
              type="checkbox"
              checked={f.firstRide}
              onChange={(e) => setF({ ...f, firstRide: e.target.checked })}
            />{' '}
            {t('promotions.firstRide')}
          </label>
          <InlineError error={error} />
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary">{t('promotions.create')}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
