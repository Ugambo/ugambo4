'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useEffect, useRef, useState } from 'react';
import { newIdempotencyKey } from '@rideswithme/api-client';
import type { BusBookingView, SavedCardView, WalletView } from '@rideswithme/shared-types';
import { QrImage } from '@rideswithme/web-core/client';
import { BookingStatus, DepartureHeader, formatKobo, useSeatClass } from '@/components/bus-parts';
import { api } from '@/lib/api';
import { ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

export default function BookingPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Booking />
    </Suspense>
  );
}

function Booking() {
  const { t } = useI18n();
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const [b, setB] = useState<BusBookingView | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [checking, setChecking] = useState(false);

  const load = async () => {
    try {
      setB(await api().bus.booking(id));
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    }
  };

  useEffect(() => {
    void load();
  }, [id]);

  // Back from the payment page: ask the server (which asks the provider) until it is settled.
  const reference = params.get('reference');
  useEffect(() => {
    if (!reference) return;
    let stop = false;
    setChecking(true);
    void (async () => {
      for (let i = 0; i < 15 && !stop; i++) {
        try {
          const p = await api().payments.get(reference, true);
          if (p.status !== 'pending') break;
        } catch {
          // keep trying
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) {
        await load();
        setChecking(false);
        router.replace(`/buses/bookings/${id}`);
      }
    })();
    return () => {
      stop = true;
    };
  }, [reference]);

  if (loadError) return <ErrorState error={loadError} onRetry={() => void load()} />;
  if (!b) return <Loading />;

  return (
    <section className="card" data-testid="bus-booking">
      <p>
        <Link href="/buses/bookings">← {t('bus.myTickets')}</Link>
      </p>
      <div className="page-header">
        <h1>{t('bus.reference', { reference: b.reference })}</h1>
        <BookingStatus b={b} />
      </div>
      <DepartureHeader d={b.departure} />
      {checking && <p className="notice notice-wait">{t('bus.checking')}</p>}
      {b.status === 'held' && !checking && <PayForm b={b} onDone={setB} />}
      {b.status === 'expired' && (
        <p className="notice notice-bad">
          {t('bus.expired')}{' '}
          <Link href={`/buses/departures/${b.departure.id}`}>{t('bus.choose')}</Link>
        </p>
      )}
      {b.status === 'cancelled' && b.cancelledBy && b.cancelledBy !== 'passenger' && (
        <p className="notice notice-bad">
          {t(b.cancelledBy === 'operator' ? 'bus.cancelledByOperator' : 'bus.cancelledByAdmin', {
            reason: b.cancelReason ?? '',
          })}
        </p>
      )}
      {b.refundedKobo > 0 && (
        <p className="notice notice-ok" data-testid="refund-note">
          {t('bus.refunded', { amount: formatKobo(b.refundedKobo) })}
        </p>
      )}
      {b.status === 'confirmed' && (
        <>
          <p className="notice notice-ok">{t('bus.confirmed')}</p>
          <Tickets b={b} />
        </>
      )}
      <CancelSection b={b} onDone={setB} />
    </section>
  );
}

function Tickets({ b }: { b: BusBookingView }) {
  const { t } = useI18n();
  const seatClass = useSeatClass();
  return (
    <ul className="tickets" data-testid="tickets">
      {b.tickets.map((tk) => (
        <li key={tk.id} className="ticket">
          {tk.qrPayload && (
            <QrImage value={tk.qrPayload} size={160} alt={t('bus.qr', { label: tk.seatLabel })} />
          )}
          <div>
            <strong>{t('bus.ticketFor', { label: tk.seatLabel, name: tk.passengerName })}</strong>
            <span className="small muted">
              {seatClass(tk.seatClass)} · {formatKobo(tk.fareKobo)}
            </span>
            {tk.ticketCode && (
              <span className="ticket-code" data-testid="ticket-code">
                {t('bus.ticketCode', { code: tk.ticketCode })}
              </span>
            )}
            {tk.checkedInAt && <span className="pill pill-ok">{t('bus.boarded')}</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Wallet, a saved card, or the payment page. */
function PayForm({ b, onDone }: { b: BusBookingView; onDone: (b: BusBookingView) => void }) {
  const { t, formatTime } = useI18n();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [cards, setCards] = useState<SavedCardView[]>([]);
  const [method, setMethod] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    void Promise.all([api().wallet.get(), api().payments.cards()]).then(
      ([w, c]) => {
        setWallet(w);
        setCards(c.filter((x) => !x.expired));
        setMethod(w.balanceKobo >= b.totalKobo ? 'wallet' : c[0] ? `card:${c[0].id}` : 'checkout');
      },
      () => setMethod('checkout'),
    );
  }, [b.totalKobo]);

  const pay = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const input = method.startsWith('card:')
        ? { method: 'card' as const, cardId: method.slice(5) }
        : method === 'wallet'
          ? { method: 'wallet' as const }
          : { method: 'checkout' as const, returnTo: 'web' as const };
      const r = await api().bus.pay(b.id, input, key.current);
      if (r.checkoutUrl) {
        window.location.assign(r.checkoutUrl);
        return;
      }
      onDone(r.booking);
    } catch (err) {
      setError(err);
      key.current = newIdempotencyKey();
    } finally {
      setBusy(false);
    }
  };

  const option = (value: string, label: string, disabled = false) => (
    <label className="radio-row" key={value}>
      <input
        type="radio"
        name="pay"
        value={value}
        checked={method === value}
        disabled={disabled}
        onChange={() => setMethod(value)}
      />
      {label}
    </label>
  );

  return (
    <form onSubmit={(e) => void pay(e)} className="bus-pay" data-testid="bus-pay">
      <p className="small">{t('bus.heldUntil', { time: formatTime(b.holdExpiresAt) })}</p>
      {b.paymentPending && <p className="notice notice-wait">{t('bus.paymentPending')}</p>}
      <fieldset className="dispute-form">
        <legend>{t('bus.payWith')}</legend>
        {wallet &&
          option(
            'wallet',
            t('bus.payWallet', { amount: formatKobo(wallet.balanceKobo) }),
            wallet.balanceKobo < b.totalKobo,
          )}
        {cards.map((c) =>
          option(`card:${c.id}`, t('bus.payCard', { brand: c.brand, last4: c.last4 })),
        )}
        {option('checkout', t('bus.payCheckout'))}
      </fieldset>
      <InlineError error={error} />
      <button className="btn btn-primary btn-large" disabled={busy || !method}>
        {t('bus.pay', { amount: formatKobo(b.totalKobo) })}
      </button>
    </form>
  );
}

function CancelSection({ b, onDone }: { b: BusBookingView; onDone: (b: BusBookingView) => void }) {
  const { t, formatDate } = useI18n();
  const [error, setError] = useState<unknown>(null);
  if (b.status !== 'held' && b.status !== 'confirmed') return null;
  if (!b.cancelUntil)
    return b.status === 'confirmed' ? <p className="small muted">{t('bus.noCancel')}</p> : null;
  const cancel = async () => {
    if (
      b.status === 'confirmed' &&
      !window.confirm(t('bus.cancelConfirm', { amount: formatKobo(b.totalKobo) }))
    )
      return;
    setError(null);
    try {
      onDone(await api().bus.cancel(b.id));
    } catch (err) {
      setError(err);
    }
  };
  return (
    <div className="bus-cancel">
      {b.status === 'confirmed' && (
        <p className="small muted">
          {t('bus.cancelUntil', { time: formatDate(b.cancelUntil, true) })}
        </p>
      )}
      <InlineError error={error} />
      <button type="button" className="btn btn-secondary" onClick={() => void cancel()}>
        {b.status === 'held' ? t('bus.release') : t('bus.cancel')}
      </button>
    </div>
  );
}
