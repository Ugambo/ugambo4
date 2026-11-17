'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import {
  type AdminVehicleCategoryView,
  SETTING_GROUPS,
  type SettingKey,
  type SettingUnit,
  type SettingValue,
  type SettingView,
} from '@rideswithme/shared-types';
import { formatKobo } from '@rideswithme/utilities';
import type { UpdateVehicleCategoryInput } from '@rideswithme/validation';
import { useResource } from '@rideswithme/web-core/client';
import { ErrorState, InlineError, Loading } from '@/components/states';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { MessageKey } from '@/lib/messages';

/** What staff type for a value: naira for kobo, percent for bps, a list for phones. */
function toInput(unit: SettingUnit, v: SettingValue): string {
  if (v === null) return '';
  if (Array.isArray(v)) return v.join(', ');
  if (unit === 'kobo') return String(Number(v) / 100);
  if (unit === 'bps') return String(Number(v) / 100);
  return String(v);
}

/** Back from what staff typed to the value the API takes; undefined when it is not a number. */
function fromInput(unit: SettingUnit, text: string): SettingValue | undefined {
  const s = text.trim();
  if (unit === 'phones')
    return s
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  if (unit === 'phone' || unit === 'email') return s === '' ? null : s;
  if (s === '' || !/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  return unit === 'kobo' || unit === 'bps' ? Math.round(n * 100) : Math.round(n);
}

function shown(unit: SettingUnit, v: SettingValue, none: string): string {
  if (v === null || (Array.isArray(v) && v.length === 0)) return none;
  if (Array.isArray(v)) return v.join(', ');
  if (unit === 'kobo') return formatKobo(Number(v));
  if (unit === 'bps') return `${Number(v) / 100}%`;
  return String(v);
}

const UNIT_SUFFIX: Partial<Record<SettingUnit, MessageKey>> = {
  kobo: 'settings.unit.naira',
  seconds: 'settings.unit.seconds',
  minutes: 'settings.unit.minutes',
  hours: 'settings.unit.hours',
  days: 'settings.unit.days',
  bps: 'settings.unit.percent',
};

/** Super admins: settings that apply at once (no restart), and which vehicle types are offered. */
export default function SettingsPage() {
  const { t, formatDate } = useI18n();
  const settings = useResource(() => api().admin.settings.list(), []);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [reset, setReset] = useState<Set<SettingKey>>(new Set());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!settings.data) return;
    setDraft(Object.fromEntries(settings.data.map((s) => [s.key, toInput(s.unit, s.value)])));
    setReset(new Set());
  }, [settings.data]);

  if (settings.loading && !settings.data) return <Loading />;
  if (settings.error || !settings.data)
    return <ErrorState error={settings.error} onRetry={() => void settings.reload()} />;
  const list = settings.data;

  const changes = (): { values: Record<string, SettingValue>; bad: SettingKey[] } => {
    const values: Record<string, SettingValue> = {};
    const bad: SettingKey[] = [];
    for (const s of list) {
      if (reset.has(s.key)) {
        values[s.key] = null;
        continue;
      }
      const text = draft[s.key] ?? '';
      if (text === toInput(s.unit, s.value)) continue;
      const v = fromInput(s.unit, text);
      if (v === undefined) bad.push(s.key);
      else values[s.key] = v;
    }
    return { values, bad };
  };
  const pending = changes();
  const count = Object.keys(pending.values).length;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await api().admin.settings.update({ values: pending.values, reason });
      await settings.reload();
      setReason('');
      setSaved(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const field = (s: SettingView) => {
    const id = `setting-${s.key}`;
    const suffix = UNIT_SUFFIX[s.unit];
    const isReset = reset.has(s.key);
    return (
      <div className="field" key={s.key} data-testid={id}>
        <label htmlFor={id}>
          {t(`settings.${s.key}` as MessageKey)}
          {suffix ? ` (${t(suffix)})` : ''}
        </label>
        {s.unit === 'phones' ? (
          <textarea
            id={id}
            rows={2}
            value={draft[s.key] ?? ''}
            disabled={isReset}
            onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
          />
        ) : (
          <input
            id={id}
            inputMode={s.unit === 'phone' ? 'tel' : s.unit === 'email' ? 'email' : 'decimal'}
            value={draft[s.key] ?? ''}
            disabled={isReset}
            aria-invalid={pending.bad.includes(s.key) || undefined}
            onChange={(e) => setDraft({ ...draft, [s.key]: e.target.value })}
          />
        )}
        <p className="small muted">
          {t(`settings.${s.key}.help` as MessageKey)}{' '}
          {t('settings.default', { value: shown(s.unit, s.defaultValue, t('settings.notSet')) })}
          {s.changed &&
            s.updatedAt &&
            ` · ${t('settings.changedBy', {
              name: s.updatedBy?.name ?? '—',
              date: formatDate(s.updatedAt, true),
            })}`}
        </p>
        {s.changed && (
          <label className="small">
            <input
              type="checkbox"
              checked={isReset}
              onChange={(e) => {
                const next = new Set(reset);
                if (e.target.checked) next.add(s.key);
                else next.delete(s.key);
                setReset(next);
              }}
            />{' '}
            {t('settings.reset')}
          </label>
        )}
      </div>
    );
  };

  return (
    <>
      <div className="page-header">
        <h1>{t('settings.title')}</h1>
      </div>
      <p className="small muted">{t('settings.intro')}</p>
      <form onSubmit={(e) => void save(e)}>
        {SETTING_GROUPS.map((g) => (
          <section className="card" key={g}>
            <h2>{t(`settings.group.${g}`)}</h2>
            {list.filter((s) => s.group === g).map(field)}
          </section>
        ))}
        <section className="card">
          <div className="field">
            <label htmlFor="settings-reason">{t('settings.reason')}</label>
            <textarea
              id="settings-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={3}
            />
          </div>
          {pending.bad.length > 0 && <p className="inline-error">{t('settings.notNumber')}</p>}
          {saved && <p className="notice notice-ok">{t('settings.saved')}</p>}
          <InlineError error={error} />
          <button
            className="btn btn-primary"
            disabled={busy || count === 0 || pending.bad.length > 0}
          >
            {t('settings.save', { count })}
          </button>
        </section>
      </form>
      <VehicleTypes />
    </>
  );
}

/** Which vehicle types drivers may register and passengers may book, with their names and seats. */
function VehicleTypes() {
  const { t } = useI18n();
  const types = useResource(() => api().admin.settings.vehicleCategories(), []);
  if (types.loading && !types.data) return <Loading />;
  if (types.error || !types.data)
    return <ErrorState error={types.error} onRetry={() => void types.reload()} />;
  return (
    <section className="card" data-testid="vehicle-types">
      <h2>{t('settings.group.vehicles')}</h2>
      <p className="small muted">{t('vehicleTypes.intro')}</p>
      {types.data.map((c) => (
        <VehicleTypeRow key={c.key} type={c} onSaved={() => void types.reload()} />
      ))}
    </section>
  );
}

function VehicleTypeRow({
  type,
  onSaved,
}: {
  type: AdminVehicleCategoryView;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(type.name);
  const [description, setDescription] = useState(type.description);
  const [seats, setSeats] = useState(String(type.seats));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const save = async (input: UpdateVehicleCategoryInput) => {
    setError(null);
    setBusy(true);
    try {
      await api().admin.settings.updateVehicleCategory(type.key, input);
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };
  const edited =
    name !== type.name || description !== type.description || seats !== String(type.seats);

  return (
    <div className="vehicle-type" data-testid={`vehicle-type-${type.key}`}>
      <div className="row-between">
        <h3>
          {type.name}{' '}
          <span className={`pill pill-${type.isEnabled ? 'ok' : 'bad'}`}>
            {t(type.isEnabled ? 'vehicleTypes.on' : 'vehicleTypes.off')}
          </span>
        </h3>
        <button
          type="button"
          className={`btn ${type.isEnabled ? 'btn-secondary' : 'btn-primary'}`}
          disabled={busy}
          onClick={() => void save({ isEnabled: !type.isEnabled })}
        >
          {t(type.isEnabled ? 'vehicleTypes.turnOff' : 'vehicleTypes.turnOn')}
        </button>
      </div>
      {type.isEnabled && type.areasWithFares === 0 && (
        <p className="notice notice-wait">
          {t('vehicleTypes.noFares')} <Link href="/pricing">{t('nav.pricing')}</Link>
        </p>
      )}
      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ name, description, seats: Number(seats) });
        }}
      >
        <label className="visually-hidden" htmlFor={`vt-name-${type.key}`}>
          {t('col.name')}
        </label>
        <input
          id={`vt-name-${type.key}`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={40}
        />
        <label className="small" htmlFor={`vt-seats-${type.key}`}>
          {t('vehicleTypes.seats')}
        </label>
        <input
          id={`vt-seats-${type.key}`}
          type="number"
          min={1}
          max={60}
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          required
          style={{ width: '5rem' }}
        />
        <label className="visually-hidden" htmlFor={`vt-desc-${type.key}`}>
          {t('vehicleTypes.description')}
        </label>
        <input
          id={`vt-desc-${type.key}`}
          value={description}
          placeholder={t('vehicleTypes.description')}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={200}
        />
        <button className="btn btn-secondary" disabled={busy || !edited}>
          {t('common.save')}
        </button>
      </form>
      <InlineError error={error} />
    </div>
  );
}
