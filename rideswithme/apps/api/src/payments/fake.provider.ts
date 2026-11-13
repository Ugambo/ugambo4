import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import type Redis from 'ioredis';
import { parsePaystackEvent, signPaystack, toCharge } from './paystack.provider';
import type {
  ChargeResult,
  PaymentProvider,
  ProviderEvent,
  RefundResult,
  TransferResult,
} from './payment.provider';

/** Signs the fake provider's webhooks. Not a secret: the fake is refused in production. */
export const FAKE_WEBHOOK_SECRET = 'rideswithme-fake-payments';

/** Test cards on the fake checkout page. */
export type FakeCard = 'good' | 'declines_later';

export type WebhookSink = (rawBody: Buffer, signature: string) => Promise<unknown>;

interface FakeTx {
  reference: string;
  amountKobo: number;
  email: string;
  returnUrl: string;
  status: 'pending' | 'success' | 'failed' | 'abandoned';
  authorizationCode?: string;
  card?: FakeCard;
  paidAt?: string;
}

const TTL = 7 * 86_400;

/** Paystack's local card fee: 1.5% + ₦100 (no ₦100 under ₦2,500), capped at ₦2,000. */
export function fakeChargeFee(amountKobo: number): number {
  const fee = Math.round(amountKobo * 0.015) + (amountKobo >= 250_000 ? 10_000 : 0);
  return Math.min(fee, 200_000);
}

/** Paystack's NGN transfer fees: ₦10 up to ₦5,000, ₦25 up to ₦50,000, then ₦50. */
export function fakeTransferFee(amountKobo: number): number {
  if (amountKobo <= 500_000) return 1_000;
  if (amountKobo <= 5_000_000) return 2_500;
  return 5_000;
}

/**
 * A stand-in for Paystack in development and tests. It keeps its state in
 * Redis (so several API copies agree), serves a checkout page through
 * /v1/dev/fake-checkout, and sends Paystack-shaped, correctly signed webhooks
 * back into the API, so the real webhook path is exercised.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  private sink: WebhookSink | null = null;
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    private readonly redis: Redis,
    private readonly publicApiUrl: string,
  ) {}

  /** Where webhooks are delivered (the API's own webhook handler). */
  setWebhookSink(sink: WebhookSink) {
    this.sink = sink;
  }

  /** Waits for webhooks already sent (tests). */
  async settled(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight]);
  }

  private key = (kind: string, ref: string) => `fakepay:${kind}:${ref}`;

  private async load<T>(kind: string, ref: string): Promise<T | null> {
    const raw = await this.redis.get(this.key(kind, ref));
    return raw ? (JSON.parse(raw) as T) : null;
  }

  private save(kind: string, ref: string, value: unknown) {
    return this.redis.set(this.key(kind, ref), JSON.stringify(value), 'EX', TTL);
  }

  /** Sends a webhook shortly after the current call returns, as Paystack does. */
  private emit(event: string, data: Record<string, unknown>) {
    const sink = this.sink;
    if (!sink) return;
    const raw = Buffer.from(JSON.stringify({ event, data }));
    const p: Promise<unknown> = new Promise((r) => setTimeout(r, 5))
      .then(() => sink(raw, signPaystack(raw, FAKE_WEBHOOK_SECRET)))
      .catch(() => undefined)
      .finally(() => this.inflight.delete(p));
    this.inflight.add(p);
  }

  private authorization(tx: FakeTx) {
    const card = tx.card ?? 'good';
    return {
      authorization_code: tx.authorizationCode,
      signature: `SIG_${card}_${createHash('sha256').update(tx.email).digest('hex').slice(0, 12)}`,
      reusable: true,
      brand: 'visa',
      card_type: 'visa',
      last4: card === 'good' ? '4081' : '4084',
      exp_month: '12',
      exp_year: '2030',
      bank: 'Test Bank',
    };
  }

  private chargeData(tx: FakeTx) {
    return {
      reference: tx.reference,
      status: tx.status,
      amount: tx.amountKobo,
      fees: tx.status === 'success' ? fakeChargeFee(tx.amountKobo) : 0,
      paid_at: tx.paidAt ?? null,
      gateway_response:
        tx.status === 'success' ? 'Approved' : tx.status === 'failed' ? 'Declined' : null,
      authorization: tx.authorizationCode ? this.authorization(tx) : null,
    };
  }

  async initializeCheckout(input: {
    reference: string;
    email: string;
    amountKobo: number;
    returnUrl: string;
  }) {
    const tx: FakeTx = {
      reference: input.reference,
      amountKobo: input.amountKobo,
      email: input.email,
      returnUrl: input.returnUrl,
      status: 'pending',
    };
    await this.save('tx', input.reference, tx);
    return {
      checkoutUrl: `${this.publicApiUrl.replace(/\/$/, '')}/v1/dev/fake-checkout/${encodeURIComponent(input.reference)}`,
    };
  }

  /** For the checkout page. */
  async checkout(reference: string): Promise<FakeTx | null> {
    return this.load<FakeTx>('tx', reference);
  }

  /** The payer finishes (or abandons) the checkout page. Returns where to send them. */
  async completeCheckout(
    reference: string,
    outcome: 'pay' | 'decline' | 'cancel',
    card: FakeCard = 'good',
  ): Promise<string | null> {
    const tx = await this.load<FakeTx>('tx', reference);
    if (!tx || tx.status !== 'pending') return tx?.returnUrl ?? null;
    if (outcome === 'pay') {
      tx.status = 'success';
      tx.card = card;
      tx.authorizationCode = `AUTH_fake_${card}_${randomUUID().slice(0, 8)}`;
      tx.paidAt = new Date().toISOString();
    } else {
      tx.status = outcome === 'decline' ? 'failed' : 'abandoned';
    }
    await this.save('tx', reference, tx);
    if (tx.status === 'success') this.emit('charge.success', this.chargeData(tx));
    const url = new URL(tx.returnUrl);
    url.searchParams.set('reference', reference);
    return url.toString();
  }

  async verifyCharge(reference: string): Promise<ChargeResult> {
    const tx = await this.load<FakeTx>('tx', reference);
    if (!tx)
      return {
        reference,
        status: 'pending',
        amountKobo: 0,
        feeKobo: 0,
        paidAt: null,
        message: 'Not found',
        authorization: null,
      };
    return toCharge(this.chargeData(tx));
  }

  async chargeCard(input: {
    reference: string;
    authorizationCode: string;
    email: string;
    amountKobo: number;
  }): Promise<ChargeResult> {
    const existing = await this.load<FakeTx>('tx', input.reference);
    if (existing) return this.verifyCharge(input.reference);
    const declines = input.authorizationCode.includes('_declines_later_');
    const tx: FakeTx = {
      reference: input.reference,
      amountKobo: input.amountKobo,
      email: input.email,
      returnUrl: '',
      status: declines ? 'failed' : 'success',
      authorizationCode: input.authorizationCode,
      card: declines ? 'declines_later' : 'good',
      ...(declines ? {} : { paidAt: new Date().toISOString() }),
    };
    await this.save('tx', input.reference, tx);
    if (!declines) this.emit('charge.success', this.chargeData(tx));
    const result = await this.verifyCharge(input.reference);
    return declines ? { ...result, message: 'Insufficient Funds' } : result;
  }

  async createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
    // Account numbers ending 0000 stand for an account that refuses transfers.
    const fails = input.accountNumber.endsWith('0000');
    return { recipientCode: `RCP_fake_${fails ? 'fail_' : ''}${input.accountNumber.slice(-4)}` };
  }

  async transfer(input: {
    reference: string;
    recipientCode: string;
    amountKobo: number;
    reason: string;
  }): Promise<TransferResult> {
    const existing = await this.load<TransferResult & { amountKobo: number }>(
      'transfer',
      input.reference,
    );
    if (existing) return existing;
    const fee = fakeTransferFee(input.amountKobo);
    const result = {
      reference: input.reference,
      status: 'pending' as const,
      transferCode: `TRF_fake_${randomUUID().slice(0, 8)}`,
      feeKobo: fee,
      message: null,
      amountKobo: input.amountKobo,
    };
    await this.save('transfer', input.reference, result);
    const outcome = input.recipientCode.includes('_fail_') ? 'failed' : 'success';
    void this.save('transfer', input.reference, { ...result, status: outcome }).then(() =>
      this.emit(`transfer.${outcome}`, {
        reference: input.reference,
        transfer_code: result.transferCode,
        amount: input.amountKobo,
        fee_charged: fee,
        status: outcome,
        reason: outcome === 'failed' ? 'Account could not be credited' : input.reason,
      }),
    );
    return result;
  }

  async verifyTransfer(reference: string): Promise<TransferResult> {
    const t = await this.load<TransferResult>('transfer', reference);
    return (
      t ?? { reference, status: 'failed', transferCode: null, feeKobo: 0, message: 'Not found' }
    );
  }

  async refund(input: { transactionReference: string; amountKobo: number }): Promise<RefundResult> {
    const id = String(Math.floor(Math.random() * 1e9));
    this.emit('refund.processed', {
      id,
      transaction_reference: input.transactionReference,
      amount: input.amountKobo,
      status: 'processed',
    });
    return { providerRefundId: id, status: 'pending' };
  }

  /** A chargeback opened (or resolved) by the card holder's bank. */
  emitDispute(
    transactionReference: string,
    amountKobo: number,
    stage: 'create' | 'resolve',
    resolution?: 'declined' | 'merchant-accepted',
    id = '777',
  ) {
    this.emit(`charge.dispute.${stage}`, {
      id,
      refund_amount: amountKobo,
      category: 'fraud',
      resolution: resolution ?? null,
      transaction: { reference: transactionReference, amount: amountKobo },
    });
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
    const expected = Buffer.from(signPaystack(rawBody, FAKE_WEBHOOK_SECRET), 'hex');
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }

  parseEvent(body: unknown): ProviderEvent {
    return parsePaystackEvent(body);
  }
}
