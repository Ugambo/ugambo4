/**
 * The payment service provider (Paystack in production, a fake in development
 * and tests). Amounts are kobo. Results from these calls are server-to-server
 * answers; the app's return from the checkout page is never trusted.
 */
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export type ChargeStatus = 'success' | 'failed' | 'abandoned' | 'pending';

export interface CardAuthorization {
  authorizationCode: string;
  signature: string;
  reusable: boolean;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  bank: string | null;
}

export interface ChargeResult {
  reference: string;
  status: ChargeStatus;
  amountKobo: number;
  feeKobo: number;
  paidAt: Date | null;
  /** The provider's words, kept for support (e.g. "Insufficient Funds"). */
  message: string | null;
  authorization: CardAuthorization | null;
}

export type TransferStatus = 'pending' | 'success' | 'failed' | 'reversed';

export interface TransferResult {
  reference: string;
  status: TransferStatus;
  transferCode: string | null;
  feeKobo: number;
  message: string | null;
}

export type ProviderRefundStatus = 'pending' | 'processed' | 'failed';

export interface RefundResult {
  providerRefundId: string;
  status: ProviderRefundStatus;
}

/** A webhook reduced to what we act on. */
export type ProviderEvent =
  | { type: 'charge'; key: string; charge: ChargeResult }
  | { type: 'transfer'; key: string; transfer: TransferResult; amountKobo: number }
  | {
      type: 'refund';
      key: string;
      providerRefundId: string | null;
      transactionReference: string;
      status: ProviderRefundStatus;
      amountKobo: number;
    }
  | {
      type: 'dispute';
      key: string;
      disputeId: string;
      transactionReference: string;
      /** open while being reviewed; won/lost once resolved. */
      outcome: 'open' | 'won' | 'lost';
      amountKobo: number;
      reason: string | null;
    }
  | { type: 'ignored'; key: string };

export interface PaymentProvider {
  readonly name: 'paystack' | 'fake';

  /** A hosted checkout page for the payer (card or bank transfer). */
  initializeCheckout(input: {
    reference: string;
    email: string;
    amountKobo: number;
    returnUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ checkoutUrl: string }>;

  /** Asks the provider how a checkout or charge ended. */
  verifyCharge(reference: string): Promise<ChargeResult>;

  /** Charges a saved card without the payer present. */
  chargeCard(input: {
    reference: string;
    authorizationCode: string;
    email: string;
    amountKobo: number;
    metadata: Record<string, string>;
  }): Promise<ChargeResult>;

  createTransferRecipient(input: {
    name: string;
    accountNumber: string;
    bankCode: string;
  }): Promise<{ recipientCode: string }>;

  transfer(input: {
    reference: string;
    recipientCode: string;
    amountKobo: number;
    reason: string;
  }): Promise<TransferResult>;

  verifyTransfer(reference: string): Promise<TransferResult>;

  refund(input: {
    transactionReference: string;
    amountKobo: number;
    note: string;
  }): Promise<RefundResult>;

  /** Checks a webhook's signature against its exact raw bytes. */
  verifySignature(rawBody: Buffer, signature: string | undefined): boolean;

  parseEvent(body: unknown): ProviderEvent;
}
