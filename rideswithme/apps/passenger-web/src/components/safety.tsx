'use client';

import { type FormEvent, useCallback, useEffect, useState } from 'react';
import {
  INCIDENT_CATEGORIES,
  RATING_TAGS,
  type IncidentCategory,
  type RatingTag,
  type RideMessageView,
  type RideView,
  type SosAlertView,
} from '@rideswithme/shared-types';
import type { PassengerMessageKey } from '@rideswithme/utilities';
import { api } from '@/lib/api';
import { InlineError, useI18n } from '@/lib/i18n';
import { useOnReconnect, useRealtimeEvent } from '@/lib/realtime';

/** Asks the browser for a quick location fix (never blocks SOS: 4 seconds at most). */
function quickLocation(): Promise<{ lat: number; lng: number; recordedAt: string } | undefined> {
  if (!('geolocation' in navigator)) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 4000);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        clearTimeout(timer);
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          recordedAt: new Date(p.timestamp).toISOString(),
        });
      },
      () => {
        clearTimeout(timer);
        resolve(undefined);
      },
      { enableHighAccuracy: true, timeout: 4000, maximumAge: 30_000 },
    );
  });
}

/** SOS: two taps (open, then send), never more; the alert goes even without a location. */
export function SosButton({ rideId }: { rideId?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [alert, setAlert] = useState<SosAlertView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    api()
      .safety.currentSos()
      .then((a) => a && a.id && setAlert(a))
      .catch(() => undefined);
  }, []);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const location = await quickLocation();
      setAlert(
        await api().safety.sos({ ...(rideId && { rideId }), ...(location && { location }) }),
      );
      setOpen(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sos" data-testid="sos">
      {alert && alert.status !== 'resolved' ? (
        <p className="notice notice-bad" role="status" data-testid="sos-status">
          {t(alert.status === 'acknowledged' ? 'sos.acknowledged' : 'sos.sent')}{' '}
          <a href="tel:112">{t('sos.call')}</a>
        </p>
      ) : open ? (
        <div className="confirm" role="alertdialog" aria-labelledby="sos-q">
          <p id="sos-q">
            <strong>{t('sos.title')}</strong>
          </p>
          <p className="small">{t('sos.explain')}</p>
          <InlineError error={error} />
          <div className="confirm-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              {t('ride.keep')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              disabled={busy}
              onClick={() => void send()}
            >
              {t('sos.send')}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-danger sos-button" onClick={() => setOpen(true)}>
          {t('sos.button')}
        </button>
      )}
    </div>
  );
}

/** A link others can follow the trip with (copied, or the phone's share sheet). */
export function ShareTrip({ rideId }: { rideId: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const create = async () => {
    setError(null);
    try {
      const s = await api().safety.share(rideId);
      setUrl(s.url);
      if (navigator.share)
        await navigator.share({ title: t('share.native'), url: s.url }).catch(() => undefined);
    } catch (err) {
      setError(err);
    }
  };
  const stop = async () => {
    await api().safety.stopSharing(rideId).catch(setError);
    setUrl(null);
  };
  return (
    <div className="share" data-testid="share">
      {url ? (
        <>
          <p className="small">{t('share.explain')}</p>
          <div className="toolbar">
            <input readOnly value={url} aria-label={t('share.button')} data-testid="share-url" />
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => void navigator.clipboard?.writeText(url).then(() => setCopied(true))}
            >
              {t('share.copy')}
            </button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => void stop()}>
              {t('share.stop')}
            </button>
          </div>
          {copied && <p className="small">{t('share.copied')}</p>}
        </>
      ) : (
        <button type="button" className="btn btn-secondary" onClick={() => void create()}>
          {t('share.button')}
        </button>
      )}
      <InlineError error={error} />
    </div>
  );
}

const QUICK: PassengerMessageKey[] = ['chat.quick.here', 'chat.quick.coming', 'chat.quick.wait'];

/** Messages with the driver while they are on the way or on the trip. */
export function RideChat({ ride }: { ride: RideView }) {
  const { t, formatTime } = useI18n();
  const [messages, setMessages] = useState<RideMessageView[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => {
    api()
      .safety.messages(ride.id)
      .then(setMessages)
      .catch(() => undefined);
  }, [ride.id]);
  useEffect(load, [load]);
  useOnReconnect(load);
  useRealtimeEvent<RideMessageView>('ride:message', (m) => {
    if (m.rideId === ride.id)
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  });
  const send = async (body: string) => {
    setError(null);
    try {
      const m = await api().safety.sendMessage(ride.id, body);
      setMessages((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      setText('');
    } catch (err) {
      setError(err);
    }
  };
  return (
    <section className="ride-chat" data-testid="ride-chat">
      <h2>{t('chat.title', { name: ride.driver?.firstName ?? '' })}</h2>
      <ul className="chat" aria-live="polite">
        {messages.length === 0 && <li className="small muted">{t('chat.empty')}</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.mine ? 'mine' : undefined}>
            {m.body} <span className="small">{formatTime(m.createdAt)}</span>
          </li>
        ))}
      </ul>
      <div className="chips">
        {QUICK.map((k) => (
          <button key={k} type="button" className="chip" onClick={() => void send(t(k))}>
            {t(k)}
          </button>
        ))}
      </div>
      <form
        className="toolbar"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (text.trim()) void send(text.trim());
        }}
      >
        <input
          aria-label={t('chat.placeholder')}
          placeholder={t('chat.placeholder')}
          value={text}
          maxLength={500}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary btn-small">{t('chat.send')}</button>
      </form>
      <p className="small muted">{t('chat.privacy')}</p>
      <InlineError error={error} />
    </section>
  );
}

const PASSENGER_TAGS: RatingTag[] = RATING_TAGS.filter(
  (x) => x !== 'no_show' && x !== 'respectful',
);

/** Stars, tags and a comment for the driver, once, within a week of the trip. */
export function RateRide({ ride, onRated }: { ride: RideView; onRated: () => void }) {
  const { t } = useI18n();
  const [stars, setStars] = useState(0);
  const [tags, setTags] = useState<RatingTag[]>([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<unknown>(null);
  if (ride.rating.given)
    return (
      <p className="small" data-testid="rated">
        {t('rate.given', { count: ride.rating.given })}
      </p>
    );
  if (!ride.rating.canRate) return null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api().ratings.rate(ride.id, {
        stars,
        tags,
        ...(comment.trim() && { comment: comment.trim() }),
      });
      onRated();
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="rate" onSubmit={(e) => void submit(e)} data-testid="rate-form">
      <h2>{t('rate.title', { name: ride.driver?.firstName ?? '' })}</h2>
      <div
        className="stars"
        role="radiogroup"
        aria-label={t('rate.title', { name: ride.driver?.firstName ?? '' })}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={t('rate.stars', { count: n })}
            className={`star${n <= stars ? ' star-on' : ''}`}
            onClick={() => setStars(n)}
          >
            ★
          </button>
        ))}
      </div>
      {stars > 0 && (
        <>
          <div className="chips">
            {PASSENGER_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`chip${tags.includes(tag) ? ' chip-on' : ''}`}
                aria-pressed={tags.includes(tag)}
                onClick={() =>
                  setTags((x) =>
                    x.includes(tag) ? x.filter((y) => y !== tag) : [...x, tag].slice(0, 5),
                  )
                }
              >
                {t(`tag.${tag}` as PassengerMessageKey)}
              </button>
            ))}
          </div>
          <div className="field">
            <label htmlFor="rate-comment">{t('rate.comment')}</label>
            <textarea
              id="rate-comment"
              rows={2}
              maxLength={500}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
          </div>
          <InlineError error={error} />
          <button className="btn btn-primary">{t('rate.send')}</button>
        </>
      )}
    </form>
  );
}

/** Report a problem on a trip (incident). */
export function ReportProblem({ rideId }: { rideId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IncidentCategory>('lost_item');
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  if (sent) return <p className="notice notice-ok">{t('report.sent')}</p>;
  if (!open)
    return (
      <button type="button" className="btn btn-ghost" onClick={() => setOpen(true)}>
        {t('report.title')}
      </button>
    );
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api().safety.report({ rideId, category, description });
      setSent(true);
    } catch (err) {
      setError(err);
    }
  };
  return (
    <form className="dispute-form" onSubmit={(e) => void submit(e)} data-testid="report-form">
      <h2>{t('report.title')}</h2>
      <p className="small muted">{t('report.urgent')}</p>
      <fieldset>
        <legend>{t('report.category')}</legend>
        {INCIDENT_CATEGORIES.map((c) => (
          <label key={c} className="radio-row">
            <input
              type="radio"
              name="incident"
              checked={category === c}
              onChange={() => setCategory(c)}
            />
            {t(`incident.${c}` as PassengerMessageKey)}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="report-text">{t('report.description')}</label>
        <textarea
          id="report-text"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required
          minLength={5}
          maxLength={2000}
        />
      </div>
      <InlineError error={error} />
      <button className="btn btn-primary">{t('report.send')}</button>
    </form>
  );
}
