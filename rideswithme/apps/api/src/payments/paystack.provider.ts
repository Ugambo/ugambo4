import { createHmac, timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ErrorCode } from '@rideswithme/shared-types';
import { AppException } from '../common/app-exception';
import type {
  CardAuthorization,
  ChargeResult,
  ChargeStatus,
  PaymentProvider,
  ProviderEvent,
  RefundResult,
  TransferResult,
  TransferStatus,
} from './payment.provider';

const TIMEOUT_MS = 20_000;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const int = (v: unknown): number => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isSafeInteger(n) ? n : 0;
};

export function signPaystack(rawBody: Buffer | string, secret: string): string {
  return createHmac('sha512', secret).update(rawBody).digest('hex');
}

export function chargeStatus(s: unknown): ChargeStatus {
  if (s === 'success') return 'success';
  if (s === 'failed' || s === 'reversed') return 'failed';
  if (s === 'abandoned') return 'abandoned';
  return 'pending'; // ongoing, pending, processing, queued, send_otp…
}

function transferStatus(s: unknown): TransferStatus {
  if (s === 'success') return 'success';
  if (s === 'failed' || s === 'abandoned' || s === 'rejected' || s === 'blocked') return 'failed';
  if (s === 'reversed') return 'reversed';
  return 'pending'; // pending, received, otp, processing
}

function authorization(a: unknown): CardAuthorization | null {
  const o = obj(a);
  const code = str(o.authorization_code);
  if (!code) return null;
  return {
    authorizationCode: code,
    signature: str(o.signature) ?? code,
    reusable: o.reusable === true,
    brand: str(o.brand) ?? str(o.card_type) ?? 'card',
    last4: (str(o.last4) ?? '0000').slice(-4),
    expMonth: int(o.exp_month) || 12,
    expYear: int(o.exp_year) || 2099,
    bank: str(o.bank),
  };
}

export function toCharge(data: unknown): ChargeResult {
  const d = obj(data);
  const paidAt = str(d.paid_at) ?? str(d.paidAt);
  return {
    reference: str(d.reference) ?? '',
    status: chargeStatus(d.status),
    amountKobo: int(d.amount),
    feeKobo: int(d.fees),
    paidAt: paidAt ? new Date(paidAt) : null,
    message: str(d.gateway_response) ?? str(d.message),
    authorization: authorization(d.authorization),
  };
}

function toTransfer(data: unknown): TransferResult {
  const d = obj(data);
  return {
    reference: str(d.reference) ?? '',
    status: transferStatus(d.status),
    transferCode: str(d.transfer_code),
    feeKobo: int(d.fee_charged ?? d.fee),
    message: str(d.reason) ?? str(d.message),
  };
}

/** Reduces a Paystack webhook body to the events we act on. */
export function parsePaystackEvent(body: unknown): ProviderEvent {
  const b = obj(body);
  const event = str(b.event) ?? 'unknown';
  const d = obj(b.data);
  const id = str(d.id) ?? (typeof d.id === 'number' ? String(d.id) : null);
  if (event === 'charge.success') {
    const charge = toCharge(d);
    return { type: 'charge', key: `charge.success:${charge.reference}`, charge };
  }
  if (
    event === 'transfer.success' ||
    event === 'transfer.failed' ||
    event === 'transfer.reversed'
  ) {
    const transfer = toTransfer({ ...d, status: event.split('.')[1] });
    return {
      type: 'transfer',
      key: `${event}:${transfer.reference}`,
      transfer,
      amountKobo: int(d.amount),
    };
  }
  if (event === 'refund.processed' || event === 'refund.failed' || event === 'refund.pending') {
    const transactionReference =
      str(d.transaction_reference) ?? str(obj(d.transaction).reference) ?? '';
    return {
      type: 'refund',
      key: `${event}:${id ?? transactionReference}:${int(d.amount)}`,
      providerRefundId: id,
      transactionReference,
      status:
        event === 'refund.processed'
          ? 'processed'
          : event === 'refund.failed'
            ? 'failed'
            : 'pending',
      amountKobo: int(d.amount),
    };
  }
  if (
    event === 'charge.dispute.create' ||
    event === 'charge.dispute.remind' ||
    event === 'charge.dispute.resolve'
  ) {
    const tx = obj(d.transaction);
    const resolution = str(d.resolution);
    const outcome: 'open' | 'won' | 'lost' =
      event !== 'charge.dispute.resolve' ? 'open' : resolution === 'declined' ? 'won' : 'lost';
    return {
      type: 'dispute',
      key: `${event}:${id ?? ''}`,
      disputeId: id ?? '',
      transactionReference: str(tx.reference) ?? '',
      outcome,
      amountKobo: int(d.refund_amount) || int(tx.amount),
      reason: str(d.category) ?? str(d.message),
    };
  }
  return { type: 'ignored', key: `${event}:${id ?? str(d.reference) ?? ''}` };
}

/** Paystack (https://paystack.com/docs/api). */
export class PaystackProvider implements PaymentProvider {
  readonly name = 'paystack' as const;
  private readonly logger = new Logger(PaystackProvider.name);

  constructor(
    private readonly secretKey: string,
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {}

  private async call(
    method: 'GET' | 'POST',
    path: string,
    body?: Json,
  ): Promise<{ ok: boolean; status: number; data: unknown; message: string | null }> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      this.logger.warn({ err: (err as Error).message, path }, 'Paystack request failed');
      throw new AppException(
        ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
        'Payment provider unreachable',
      );
    }
    const json = obj(await res.json().catch(() => ({})));
    if (res.status >= 500 || res.status === 429) {
      this.logger.warn({ status: res.status, path }, 'Paystack error');
      throw new AppException(
        ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
        'Payment provider unavailable',
      );
    }
    return {
      ok: res.ok && json.status === true,
      status: res.status,
      data: json.data,
      message: str(json.message),
    };
  }

  private fail(path: string, r: { status: number; message: string | null }): never {
    this.logger.warn({ status: r.status, path, message: r.message }, 'Paystack refused a request');
    throw new AppException(
      ErrorCode.PAYMENT_PROVIDER_UNAVAILABLE,
      r.message ?? 'Payment provider refused the request',
    );
  }

  async initializeCheckout(input: {
    reference: string;
    email: string;
    amountKobo: number;
    returnUrl: string;
    metadata: Record<string, string>;
  }) {
    const r = await this.call('POST', '/transaction/initialize', {
      reference: input.reference,
      email: input.email,
      amount: input.amountKobo,
      currency: 'NGN',
      callback_url: input.returnUrl,
      metadata: input.metadata,
    });
    if (!r.ok) this.fail('/transaction/initialize', r);
    const url = str(obj(r.data).authorization_url);
    if (!url) this.fail('/transaction/initialize', r);
    return { checkoutUrl: url };
  }

  async verifyCharge(reference: string): Promise<ChargeResult> {
    const r = await this.call('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
    if (r.status === 404 || (!r.ok && r.status === 400)) {
      return {
        reference,
        status: 'pending',
        amountKobo: 0,
        feeKobo: 0,
        paidAt: null,
        message: r.message,
        authorization: null,
      };
    }
    if (!r.ok) this.fail('/transaction/verify', r);
    return toCharge(r.data);
  }

  async chargeCard(input: {
    reference: string;
    authorizationCode: string;
    email: string;
    amountKobo: number;
    metadata: Record<string, string>;
  }): Promise<ChargeResult> {
    const r = await this.call('POST', '/transaction/charge_authorization', {
      reference: input.reference,
      authorization_code: input.authorizationCode,
      email: input.email,
      amount: input.amountKobo,
      currency: 'NGN',
      metadata: input.metadata,
    });
    if (!r.ok && /duplicate/i.test(r.message ?? '')) {
      // Already charged under this reference (a retry): ask how that charge ended.
      return this.verifyCharge(input.reference);
    }
    if (!r.ok) {
      // A refused charge (e.g. card expired) is an answer, not an outage.
      return {
        reference: input.reference,
        status: 'failed',
        amountKobo: input.amountKobo,
        feeKobo: 0,
        paidAt: null,
        message: r.message,
        authorization: null,
      };
    }
    return toCharge(r.data);
  }

  async createTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
    const r = await this.call('POST', '/transferrecipient', {
      type: 'nuban',
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: 'NGN',
    });
    const code = str(obj(r.data).recipient_code);
    if (!r.ok || !code) this.fail('/transferrecipient', r);
    return { recipientCode: code };
  }

  async transfer(input: {
    reference: string;
    recipientCode: string;
    amountKobo: number;
    reason: string;
  }) {
    const r = await this.call('POST', '/transfer', {
      source: 'balance',
      reference: input.reference,
      recipient: input.recipientCode,
      amount: input.amountKobo,
      reason: input.reason,
      currency: 'NGN',
    });
    if (!r.ok) {
      if (r.status === 400 && /duplicate|already/i.test(r.message ?? ''))
        return this.verifyTransfer(input.reference);
      return {
        reference: input.reference,
        status: 'failed' as const,
        transferCode: null,
        feeKobo: 0,
        message: r.message,
      };
    }
    return toTransfer({ ...obj(r.data), reference: input.reference });
  }

  async verifyTransfer(reference: string): Promise<TransferResult> {
    const r = await this.call('GET', `/transfer/verify/${encodeURIComponent(reference)}`);
    if (!r.ok) {
      if (r.status === 404 || r.status === 400)
        return { reference, status: 'failed', transferCode: null, feeKobo: 0, message: r.message };
      this.fail('/transfer/verify', r);
    }
    return toTransfer({ ...obj(r.data), reference });
  }

  async refund(input: {
    transactionReference: string;
    amountKobo: number;
    note: string;
  }): Promise<RefundResult> {
    const r = await this.call('POST', '/refund', {
      transaction: input.transactionReference,
      amount: input.amountKobo,
      merchant_note: input.note.slice(0, 200),
    });
    if (!r.ok) this.fail('/refund', r);
    const d = obj(r.data);
    const id = str(d.id) ?? (typeof d.id === 'number' ? String(d.id) : null);
    if (!id) this.fail('/refund', r);
    return { providerRefundId: id, status: d.status === 'processed' ? 'processed' : 'pending' };
  }

  verifySignature(rawBody: Buffer, signature: string | undefined): boolean {
    if (!signature || !/^[0-9a-f]{128}$/i.test(signature)) return false;
    const expected = Buffer.from(signPaystack(rawBody, this.secretKey), 'hex');
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }

  parseEvent(body: unknown): ProviderEvent {
    return parsePaystackEvent(body);
  }
}
