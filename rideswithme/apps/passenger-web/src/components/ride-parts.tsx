'use client';

import { useEffect, useState } from 'react';
import type { FareQuoteOption, RideView } from '@rideswithme/shared-types';
import { formatKobo, type PassengerMessageKey } from '@rideswithme/utilities';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export const CATEGORY_ICON: Record<string, string> = {
  car: '🚗',
  keke_napep: '🛺',
  taxi: '🚕',
  motorcycle: '🏍️',
};

/** One vehicle choice: icon, name, ETA, seats and fixed price. */
export function VehicleOption({
  option,
  selected,
  onSelect,
}: {
  option: FareQuoteOption;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useI18n();
  const eta =
    option.etaSeconds === null
      ? t('choose.noDrivers')
      : t('choose.eta', { minutes: Math.max(1, Math.round(option.etaSeconds / 60)) });
  return (
    <label
      className={`vehicle${selected ? ' vehicle-selected' : ''}`}
      data-testid={`option-${option.category.key}`}
    >
      <input
        type="radio"
        name="vehicle"
        checked={selected}
        onChange={onSelect}
        className="visually-hidden"
      />
      <span className="vehicle-icon" aria-hidden>
        {CATEGORY_ICON[option.category.key] ?? '🚗'}
      </span>
      <span className="vehicle-text">
        <strong>{option.category.name}</strong>
        <span className="small muted">
          {eta} · {t('choose.seats', { seats: option.category.seats })}
        </span>
      </span>
      <strong className="vehicle-price">{formatKobo(option.totalKobo)}</strong>
    </label>
  );
}

/** Driver photo, first name, vehicle and plate. Calling and messaging need a telephony vendor (B-3). */
export function DriverCard({ ride }: { ride: RideView }) {
  const { t } = useI18n();
  const [photo, setPhoto] = useState<string | null>(null);
  const driver = ride.driver;
  useEffect(() => {
    if (!driver?.hasPhoto) return;
    api()
      .rides.driverPhoto(ride.id)
      .then(
        (p) => setPhoto(p.url),
        () => setPhoto(null),
      );
  }, [ride.id, driver?.hasPhoto]);
  if (!driver) return null;
  return (
    <div className="driver-card" data-testid="driver-card">
      {photo ? (
        // Signed, short-lived link from private storage: not for the image optimiser.
        <img
          src={photo}
          alt={driver.firstName}
          className="driver-photo"
          onError={() => setPhoto(null)}
        />
      ) : (
        <span className="driver-photo driver-initial" aria-hidden>
          {driver.firstName.slice(0, 1)}
        </span>
      )}
      <span className="driver-text">
        <strong>{driver.firstName}</strong>
        <span className="small muted">★ {t('ride.newDriver')}</span>
        <span className="small">
          {driver.vehicle.colour} {driver.vehicle.make} {driver.vehicle.model}
        </span>
      </span>
      <span className="plate" aria-label={`${t('ride.plate')} ${driver.vehicle.plateNumber}`}>
        {driver.vehicle.plateNumber}
      </span>
    </div>
  );
}

/** Every line of a ride's price, and the total. */
export function FareLines({ ride }: { ride: RideView }) {
  const { t } = useI18n();
  const b = ride.fare.breakdown;
  const lines: [PassengerMessageKey, number][] = [
    ['receipt.base', b.baseKobo],
    ['receipt.distance', b.distanceKobo],
    ['receipt.time', b.timeKobo],
    ['receipt.peak', b.peakSurchargeKobo],
    ['receipt.minimum', b.minimumAdjustmentKobo],
    ['receipt.bookingFee', b.bookingFeeKobo],
    ['receipt.rounding', b.roundingKobo],
    ['receipt.waiting', ride.fare.waitingChargeKobo],
  ];
  const cancelled =
    ride.status === 'cancelled_by_passenger' || ride.status === 'cancelled_by_driver';
  const total = cancelled
    ? ride.fare.cancellationFeeKobo
    : (ride.fare.finalTotalKobo ?? ride.fare.quotedTotalKobo);
  return (
    <dl className="fare-lines" data-testid="fare-lines">
      {!cancelled &&
        lines
          .filter(([, v]) => v > 0)
          .map(([k, v]) => (
            <div key={k} className="fare-line">
              <dt>{t(k)}</dt>
              <dd>{formatKobo(v)}</dd>
            </div>
          ))}
      {cancelled && ride.fare.cancellationFeeKobo > 0 && (
        <div className="fare-line">
          <dt>{t('receipt.cancellationFee')}</dt>
          <dd>{formatKobo(ride.fare.cancellationFeeKobo)}</dd>
        </div>
      )}
      <div className="fare-line fare-total">
        <dt>{t('receipt.total')}</dt>
        <dd>{formatKobo(total)}</dd>
      </div>
    </dl>
  );
}

const STATUS_TONE: Record<RideView['status'], string> = {
  requested: 'pill-wait',
  searching: 'pill-wait',
  driver_assigned: 'pill-wait',
  driver_arrived: 'pill-ok',
  in_progress: 'pill-ok',
  completed: 'pill-ok',
  cancelled_by_passenger: 'pill-muted',
  cancelled_by_driver: 'pill-bad',
  no_driver_found: 'pill-bad',
};

export function StatusPill({ status }: { status: RideView['status'] }) {
  const { t } = useI18n();
  return <span className={`pill ${STATUS_TONE[status]}`}>{t(`status.${status}`)}</span>;
}

/** How the ride was paid: cash to collect, wallet, card (being charged or paid), or still owed. */
export function PaymentLine({ ride, past = false }: { ride: RideView; past?: boolean }) {
  const { t } = useI18n();
  const p = ride.payment;
  const total = ride.fare.finalTotalKobo ?? ride.fare.quotedTotalKobo;
  let text: string | null = null;
  let tone = 'muted';
  if (p.status === 'outstanding') {
    text = t('receipt.owed', { amount: formatKobo(p.outstandingKobo) });
    tone = 'notice notice-bad';
  } else if (p.method === 'cash' && ride.status === 'completed') {
    text = past ? t('receipt.paidCash') : t('ride.payCash', { amount: formatKobo(total) });
    tone = past ? 'muted' : 'pay-cash';
  } else if (p.method === 'wallet' && p.status === 'succeeded') {
    text = t('receipt.paidWallet');
  } else if (p.method === 'card' && p.status === 'pending') {
    text = t('receipt.cardPending');
  } else if (p.method === 'card' && p.status === 'succeeded' && p.card) {
    text = t('receipt.paidCard', {
      card: t('pay.card', { brand: p.card.brand.toUpperCase(), last4: p.card.last4 }),
    });
  }
  return (
    <>
      {text && (
        <p className={tone} data-testid={tone === 'pay-cash' ? 'pay-cash' : 'payment-line'}>
          {text}
        </p>
      )}
      {p.refundedKobo > 0 && (
        <p className="small">{t('receipt.refunded', { amount: formatKobo(p.refundedKobo) })}</p>
      )}
    </>
  );
}
