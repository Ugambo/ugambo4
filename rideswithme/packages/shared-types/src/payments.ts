/** Wallets, payments, cards, payouts, refunds and disputes. All amounts are kobo. */

export const PAYMENT_RETURN_TARGETS = ['web', 'app'] as const;
/** Where the checkout page sends the payer back to. */
export type PaymentReturnTarget = (typeof PAYMENT_RETURN_TARGETS)[number];

export interface WalletView {
  /** Spendable balance. */
  balanceKobo: number;
  /** Fares and fees still owed (paid automatically from the next top-up). */
  owedKobo: number;
  /** Held for rides in progress. */
  heldKobo: number;
  /** cardCheckKobo: charged (into the wallet) when a card is saved. */
  limits: {
    topUpMinKobo: number;
    topUpMaxKobo: number;
    maxBalanceKobo: number;
    cardCheckKobo: number;
  };
}

export type WalletEntryKind =
  | 'wallet_topup'
  | 'ride_hold'
  | 'ride_hold_release'
  | 'ride_settlement'
  | 'cash_commission'
  | 'cancellation_fee'
  | 'outstanding_collection'
  | 'payout'
  | 'payout_returned'
  | 'refund'
  | 'refund_returned'
  | 'adjustment'
  | 'opening_balance';

export interface WalletEntryView {
  id: string;
  kind: WalletEntryKind;
  /** Positive: money in. Negative: money out. */
  amountKobo: number;
  balanceAfterKobo: number;
  rideId: string | null;
  memo: string | null;
  createdAt: string;
}

export type PaymentPurpose = 'ride_fare' | 'cancellation_fee' | 'wallet_topup' | 'card_link';
export type PaymentStatus =
  'pending' | 'succeeded' | 'collected' | 'outstanding' | 'failed' | 'abandoned';

export interface PaymentView {
  id: string;
  purpose: PaymentPurpose;
  method: 'cash' | 'wallet' | 'card';
  status: PaymentStatus;
  amountKobo: number;
  outstandingKobo: number;
  refundedKobo: number;
  rideId: string | null;
  card: { brand: string; last4: string } | null;
  failureReason: string | null;
  createdAt: string;
  paidAt: string | null;
}

/** Open this page so the payer can pay; then check the payment's status. */
export interface CheckoutView {
  payment: PaymentView;
  checkoutUrl: string;
}

export interface SavedCardView {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  bank: string | null;
  expired: boolean;
}

/** How a ride is being paid for (on RideView). */
export interface RidePaymentView {
  method: 'cash' | 'wallet' | 'card';
  status: PaymentStatus | null;
  card: { brand: string; last4: string } | null;
  outstandingKobo: number;
  refundedKobo: number;
  disputed: boolean;
}

export type PayoutStatus = 'pending' | 'processing' | 'succeeded' | 'failed' | 'reversed';

export interface PayoutView {
  id: string;
  amountKobo: number;
  feeKobo: number;
  status: PayoutStatus;
  account: { bankCode: string; last4: string; name: string };
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
}

export interface EarningsPeriod {
  trips: number;
  /** What the driver keeps: fares less booking fees and commission. */
  earningsKobo: number;
  commissionKobo: number;
  bookingFeesKobo: number;
  /** Cash collected from passengers in the period. */
  cashCollectedKobo: number;
}

export interface DriverWalletView {
  /** Negative when the driver owes commission on cash trips. */
  balanceKobo: number;
  debtLimitKobo: number;
  /** False when the debt is over the limit: top up to go online again. */
  canGoOnline: boolean;
  payout: {
    minKobo: number;
    /** What can be withdrawn now (the positive balance). */
    availableKobo: number;
    /** Set while withdrawals are paused after a bank account change. */
    pausedUntil: string | null;
    account: { bankCode: string; last4: string; name: string } | null;
  };
  earnings: { today: EarningsPeriod; week: EarningsPeriod };
  limits: { topUpMinKobo: number; topUpMaxKobo: number };
}

export const DISPUTE_REASONS = [
  'overcharged',
  'wrong_route',
  'ride_did_not_happen',
  'driver_behaviour',
  'charged_twice',
  'other',
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export type DisputeStatus = 'open' | 'refunded' | 'rejected' | 'won' | 'lost';

export interface DisputeView {
  id: string;
  rideId: string | null;
  paymentId: string | null;
  source: 'passenger' | 'provider';
  status: DisputeStatus;
  reason: string;
  details: string | null;
  amountKobo: number | null;
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface RefundView {
  id: string;
  paymentId: string;
  amountKobo: number;
  destination: 'wallet' | 'card';
  fundedBy: 'platform' | 'driver';
  status: 'pending' | 'succeeded' | 'failed';
  reason: string;
  disputeId: string | null;
  failureReason: string | null;
  createdAt: string;
  completedAt: string | null;
}
