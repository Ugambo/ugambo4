'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { ApiError } from '@rideswithme/api-client';
import type { FareRuleView } from '@rideswithme/shared-types';
import { useResource } from '@rideswithme/web-core/client';
import { Empty, ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { type FareForm, formFromRule, ruleFromForm } from '@/lib/fare-form';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';
import { useCan } from '../shell';

const FIELDS: [keyof Omit<FareForm, 'peaks'>, MessageKey][] = [
  ['base', 'pricing.base'],
  ['perKm', 'pricing.perKm'],
  ['perMinute', 'pricing.perMinute'],
  ['minimum', 'pricing.minimum'],
  ['bookingFee', 'pricing.bookingFee'],
  ['commissionPercent', 'pricing.commission'],
  ['cancellationFee', 'pricing.cancellationFee'],
  ['graceSeconds', 'pricing.grace'],
  ['waitingFreeMinutes', 'pricing.waitingFree'],
  ['waitingPerMinute', 'pricing.waitingPerMinute'],
  ['rounding', 'pricing.rounding'],
];

/** Fare rules per service area and vehicle type. Saving adds a new rule; booked rides keep their snapshot. */
export default function PricingPage() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const rules = useResource(() => api().admin.pricing.fareRules(), []);
  const [areaKey, setAreaKey] = useState('');
  const [categoryKey, setCategoryKey] = useState('');
  const [form, setForm] = useState<FareForm | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const editable = can('pricing.manage');

  const areas = useMemo(
    () => [...new Map((rules.data ?? []).map((r) => [r.serviceArea.key, r.serviceArea])).values()],
    [rules.data],
  );
  const rule: FareRuleView | undefined = (rules.data ?? []).find(
    (r) => r.serviceArea.key === areaKey && r.category.key === categoryKey,
  );

  useEffect(() => {
    if (!areaKey && areas[0]) setAreaKey(areas[0].key);
  }, [areas, areaKey]);
  useEffect(() => {
    const first = (rules.data ?? []).find((r) => r.serviceArea.key === areaKey);
    if (
      first &&
      !(rules.data ?? []).some(
        (r) => r.serviceArea.key === areaKey && r.category.key === categoryKey,
      )
    )
      setCategoryKey(first.category.key);
  }, [areaKey, categoryKey, rules.data]);
  // Refill the form when the rule shown changes (also after saving, which makes a new rule)…
  useEffect(() => {
    setForm(rule ? formFromRule(rule) : null);
  }, [rule?.id]);
  // …but only clear messages when staff pick another area or vehicle type.
  useEffect(() => {
    setSaved(false);
    setError(null);
  }, [areaKey, categoryKey]);

  if (rules.loading && !rules.data) return <Loading />;
  if (rules.error) return <ErrorState error={rules.error} onRetry={() => void rules.reload()} />;
  if (areas.length === 0) return <Empty message={t('pricing.empty')} />;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    try {
      let input;
      try {
        input = ruleFromForm(form);
      } catch (err) {
        throw new ApiError(0, 'VALIDATION_FAILED', (err as Error).message);
      }
      await api().admin.pricing.saveFareRule(areaKey, categoryKey, input);
      setSaved(true);
      await rules.reload();
    } catch (err) {
      setError(err);
    }
  };
  const set = (k: keyof Omit<FareForm, 'peaks'>, v: string) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));
  const setPeak = (i: number, patch: Partial<FareForm['peaks'][number]>) =>
    setForm((f) =>
      f ? { ...f, peaks: f.peaks.map((p, j) => (j === i ? { ...p, ...patch } : p)) } : f,
    );

  return (
    <>
      <div className="page-header">
        <h1>{t('pricing.title')}</h1>
      </div>
      <p className="notice notice-wait">{t('pricing.placeholderWarning')}</p>
      {!editable && <p className="muted">{t('pricing.readOnly')}</p>}
      <div className="toolbar">
        <label htmlFor="pricing-area">{t('pricing.area')}</label>
        <select id="pricing-area" value={areaKey} onChange={(e) => setAreaKey(e.target.value)}>
          {areas.map((a) => (
            <option key={a.key} value={a.key}>
              {a.name}
            </option>
          ))}
        </select>
        <label htmlFor="pricing-category">{t('pricing.vehicle')}</label>
        <select
          id="pricing-category"
          value={categoryKey}
          onChange={(e) => setCategoryKey(e.target.value)}
        >
          {(rules.data ?? [])
            .filter((r) => r.serviceArea.key === areaKey)
            .map((r) => (
              <option key={r.category.key} value={r.category.key}>
                {r.category.name}
              </option>
            ))}
        </select>
        {rule && <span className="small muted">{formatDate(rule.createdAt, true)}</span>}
      </div>
      {form && (
        <form onSubmit={(e) => void save(e)} className="card" data-testid="pricing-form">
          <fieldset disabled={!editable} className="pricing-grid">
            {FIELDS.map(([k, label]) => (
              <div className="field" key={k}>
                <label htmlFor={`fare-${k}`}>{t(label)}</label>
                <input
                  id={`fare-${k}`}
                  inputMode="decimal"
                  value={form[k]}
                  onChange={(e) => set(k, e.target.value)}
                  required
                />
              </div>
            ))}
          </fieldset>
          <h2>{t('pricing.peak')}</h2>
          <fieldset disabled={!editable}>
            {form.peaks.map((p, i) => (
              <div className="peak" key={i}>
                <div className="days" role="group" aria-label={t('pricing.peak')}>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <label key={d}>
                      <input
                        type="checkbox"
                        checked={p.days.includes(d)}
                        onChange={(e) =>
                          setPeak(i, {
                            days: e.target.checked ? [...p.days, d] : p.days.filter((x) => x !== d),
                          })
                        }
                      />
                      {t(`day.${d}` as MessageKey)}
                    </label>
                  ))}
                </div>
                <label>
                  {t('pricing.peakFrom')}{' '}
                  <input
                    type="time"
                    value={p.start}
                    onChange={(e) => setPeak(i, { start: e.target.value })}
                  />
                </label>
                <label>
                  {t('pricing.peakTo')}{' '}
                  <input
                    type="time"
                    value={p.end}
                    onChange={(e) => setPeak(i, { end: e.target.value })}
                  />
                </label>
                <label>
                  {t('pricing.peakMultiplier')}{' '}
                  <input
                    inputMode="decimal"
                    size={5}
                    value={p.multiplier}
                    onChange={(e) => setPeak(i, { multiplier: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() =>
                    setForm((f) => (f ? { ...f, peaks: f.peaks.filter((_, j) => j !== i) } : f))
                  }
                >
                  {t('pricing.remove')}
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() =>
                setForm((f) =>
                  f
                    ? {
                        ...f,
                        peaks: [
                          ...f.peaks,
                          {
                            days: [1, 2, 3, 4, 5],
                            start: '07:00',
                            end: '09:00',
                            multiplier: '1.2',
                          },
                        ],
                      }
                    : f,
                )
              }
            >
              {t('pricing.peakAdd')}
            </button>
          </fieldset>
          <InlineError error={error} />
          {saved && <p className="notice notice-ok">{t('pricing.saved')}</p>}
          {editable && <button className="btn btn-primary">{t('pricing.save')}</button>}
        </form>
      )}
    </>
  );
}
