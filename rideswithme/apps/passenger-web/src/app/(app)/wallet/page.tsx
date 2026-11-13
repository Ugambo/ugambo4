'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, Suspense, useCallback, useEffect, useState } from 'react';
import { ApiError, newIdempotencyKey } from '@rideswithme/api-client';
import type {
  PaymentView,
  SavedCardView,
  WalletEntryView,
  WalletView,
} from '@rideswithme/shared-types';
import { formatKobo, nairaToKobo, type PassengerMessageKey } from '@rideswithme/utilities';
import { api } from '@/lib/api';
import { Empty, ErrorState, InlineError, Loading, useI18n } from '@/lib/i18n';

const PRESETS = [100_000, 200_000, 500_000, 1_000_000];

export default function WalletPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Wallet />
    </Suspense>
  );
}

/** Balance, money owed, top-ups through the payment page, saved cards and activity. */
function Wallet() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [cards, setCards] = useState<SavedCardView[]>([]);
  const [entries, setEntries] = useState<WalletEntryView[]>([]);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [returned, setReturned] = useState<PaymentView | 'checking' | null>(null);

  const load = useCallback(async () => {
    try {
      const [w, c, e] = await Promise.all([
        api().wallet.get(),
        api().payments.cards(),
        api().wallet.transactions(),
      ]);
      setWallet(w);
      setCards(c);
      setEntries(e.items);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Back from the payment page: ask the server (which asks the provider) how it went.
  const reference = params.get('reference');
  useEffect(() => {
    if (!reference) return;
    let stop = false;
    setReturned('checking');
    void (async () => {
      for (let i = 0; i < 15 && !stop; i++) {
        try {
          const p = await api().payments.get(reference, true);
          if (p.status !== 'pending' || i === 14) {
            if (!stop) setReturned(p);
            break;
          }
        } catch {
          // keep trying
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      if (!stop) {
        await load();
        router.replace('/wallet');
      }
    })();
    return () => {
      stop = true;
    };
  }, [reference, load, router]);

  async function startCheckout(fn: (key: string) => Promise<{ checkoutUrl: string }>) {
    setBusy(true);
    setError(null);
    try {
      const { checkoutUrl } = await fn(newIdempotencyKey());
      window.location.assign(checkoutUrl);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  const topUp = (e: FormEvent) => {
    e.preventDefault();
    let kobo: number;
    try {
      kobo = nairaToKobo(amount);
    } catch {
      setError(new ApiError(0, 'VALIDATION_FAILED', 'Not an amount'));
      return;
    }
    void startCheckout((key) => api().wallet.topUp({ amountKobo: kobo, returnTo: 'web' }, key));
  };

  const removeCard = async (id: string) => {
    try {
      await api().payments.removeCard(id);
      await load();
    } catch (err) {
      setError(err);
    }
  };

  if (loadError && !wallet) return <ErrorState error={loadError} onRetry={() => void load()} />;
  if (!wallet) return <Loading />;
  const { limits } = wallet;

  return (
    <div className="wallet-layout">
      <section className="card" aria-labelledby="wallet-title">
        <h1 id="wallet-title">{t('wallet.title')}</h1>
        {returned === 'checking' && (
          <p className="notice notice-wait" role="status">
            {t('wallet.checking')}
          </p>
        )}
        {returned && returned !== 'checking' && (
          <p
            className={`notice ${returned.status === 'succeeded' ? 'notice-ok' : returned.status === 'pending' ? 'notice-wait' : 'notice-bad'}`}
            role="status"
            data-testid="payment-result"
          >
            {returned.status === 'succeeded'
              ? t('wallet.topUpDone', { amount: formatKobo(returned.amountKobo) })
              : returned.status === 'pending'
                ? t('wallet.topUpPending')
                : t('wallet.topUpFailed')}
          </p>
        )}
        <p className="small muted">{t('wallet.balance')}</p>
        <p className="wallet-balance" data-testid="wallet-balance">
          {formatKobo(wallet.balanceKobo)}
        </p>
        {wallet.heldKobo > 0 && (
          <p className="small muted">{t('wallet.held', { amount: formatKobo(wallet.heldKobo) })}</p>
        )}
        {wallet.owedKobo > 0 && (
          <div className="notice notice-bad" data-testid="wallet-owed">
            <strong>{t('wallet.owed', { amount: formatKobo(wallet.owedKobo) })}</strong>
            <div className="small">{t('wallet.owedHint')}</div>
          </div>
        )}

        <form onSubmit={topUp} className="topup">
          <h2>{t('wallet.topUp')}</h2>
          <div className="chips">
            {PRESETS.filter((k) => k >= limits.topUpMinKobo && k <= limits.topUpMaxKobo).map(
              (k) => (
                <button
                  key={k}
                  type="button"
                  className="chip"
                  onClick={() => setAmount(String(k / 100))}
                >
                  {formatKobo(k)}
                </button>
              ),
            )}
          </div>
          <div className="field">
            <label htmlFor="amount">{t('wallet.amount')}</label>
            <input
              id="amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              required
            />
            <span className="hint">
              {t('wallet.amountHint', {
                min: formatKobo(limits.topUpMinKobo),
                max: formatKobo(limits.topUpMaxKobo),
              })}
            </span>
          </div>
          <InlineError error={error} />
          <button className="btn btn-accent btn-block btn-large" disabled={busy || !amount}>
            {t('wallet.topUp')}
          </button>
        </form>
      </section>

      <section className="card" aria-labelledby="cards-title">
        <h2 id="cards-title">{t('wallet.cards')}</h2>
        {cards.length === 0 ? (
          <p className="muted">{t('wallet.cardsEmpty')}</p>
        ) : (
          <ul className="plain-list cards" data-testid="cards">
            {cards.map((c) => (
              <li key={c.id}>
                <span>
                  {t('pay.card', { brand: c.brand.toUpperCase(), last4: c.last4 })}{' '}
                  <span className="small muted">
                    {String(c.expMonth).padStart(2, '0')}/{String(c.expYear).slice(-2)}
                    {c.expired && ` · ${t('wallet.expired')}`}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => void removeCard(c.id)}
                >
                  {t('wallet.removeCard')}
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="small muted">
          {t('wallet.addCardHint', { amount: formatKobo(limits.cardCheckKobo) })}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() =>
            void startCheckout((key) => api().payments.addCard({ returnTo: 'web' }, key))
          }
        >
          {t('wallet.addCard')}
        </button>
      </section>

      <section className="card" aria-labelledby="activity-title">
        <h2 id="activity-title">{t('wallet.history')}</h2>
        {entries.length === 0 ? (
          <Empty message={t('wallet.empty')} />
        ) : (
          <ul className="plain-list entries" data-testid="wallet-activity">
            {entries.map((e) => (
              <li key={e.id}>
                <span className="entry-main">
                  <strong>{t(`entry.${e.kind}` as PassengerMessageKey)}</strong>
                  <span className="small muted">{formatDate(e.createdAt, true)}</span>
                </span>
                <span className={`num ${e.amountKobo > 0 ? 'money-in' : ''}`}>
                  {e.amountKobo > 0 ? '+' : '−'}
                  {formatKobo(Math.abs(e.amountKobo))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
