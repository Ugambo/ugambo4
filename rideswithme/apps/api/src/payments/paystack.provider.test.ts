import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/app-exception';
import { fakeChargeFee, fakeTransferFee } from './fake.provider';
import { parsePaystackEvent, PaystackProvider, signPaystack } from './paystack.provider';

const SECRET = 'sk_test_example';

function stub(status: number, body: unknown) {
  return vi.fn(
    async (_url: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  );
}

describe('PaystackProvider', () => {
  it('starts a checkout with the amount in kobo and our reference', async () => {
    const fetch = stub(200, {
      status: true,
      data: { authorization_url: 'https://checkout.paystack.com/abc' },
    });
    const p = new PaystackProvider(SECRET, 'https://api.paystack.co', fetch);
    const r = await p.initializeCheckout({
      reference: 'ref-1',
      email: 'a@b.ng',
      amountKobo: 150_000,
      returnUrl: 'https://rideswithme.ng/wallet',
      metadata: { purpose: 'wallet_topup' },
    });
    expect(r.checkoutUrl).toBe('https://checkout.paystack.com/abc');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://api.paystack.co/transaction/initialize');
    expect((init!.headers as Record<string, string>).Authorization).toBe(`Bearer ${SECRET}`);
    expect(JSON.parse(init!.body as string)).toMatchObject({
      reference: 'ref-1',
      amount: 150_000,
      currency: 'NGN',
      callback_url: 'https://rideswithme.ng/wallet',
    });
  });

  it('reads a verified charge, including fees and the card', async () => {
    const fetch = stub(200, {
      status: true,
      data: {
        reference: 'ref-1',
        status: 'success',
        amount: 150_000,
        fees: 2_250,
        paid_at: '2026-11-12T10:00:00.000Z',
        gateway_response: 'Successful',
        authorization: {
          authorization_code: 'AUTH_x',
          signature: 'SIG_y',
          reusable: true,
          brand: 'visa',
          last4: '4081',
          exp_month: '12',
          exp_year: '2030',
          bank: 'TEST BANK',
        },
      },
    });
    const c = await new PaystackProvider(SECRET, 'https://api.paystack.co', fetch).verifyCharge(
      'ref-1',
    );
    expect(c).toMatchObject({
      status: 'success',
      amountKobo: 150_000,
      feeKobo: 2_250,
      message: 'Successful',
    });
    expect(c.authorization).toMatchObject({
      authorizationCode: 'AUTH_x',
      signature: 'SIG_y',
      last4: '4081',
      expMonth: 12,
      expYear: 2030,
    });
  });

  it('treats a refused card charge as a failed charge, and an outage as unavailable', async () => {
    const refused = stub(400, { status: false, message: 'Card expired' });
    const failed = await new PaystackProvider(SECRET, 'https://x', refused).chargeCard({
      reference: 'r',
      authorizationCode: 'AUTH',
      email: 'e@x.ng',
      amountKobo: 100,
      metadata: {},
    });
    expect(failed).toMatchObject({ status: 'failed', message: 'Card expired' });

    const down = stub(503, { status: false });
    await expect(
      new PaystackProvider(SECRET, 'https://x', down).verifyCharge('r'),
    ).rejects.toBeInstanceOf(AppException);
    const unreachable = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      new PaystackProvider(SECRET, 'https://x', unreachable).verifyCharge('r'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('accepts only webhooks signed with the secret key over the exact bytes', () => {
    const p = new PaystackProvider(SECRET, 'https://x', stub(200, {}));
    const raw = Buffer.from('{"event":"charge.success","data":{"reference":"r","amount":100}}');
    const sig = signPaystack(raw, SECRET);
    expect(p.verifySignature(raw, sig)).toBe(true);
    expect(p.verifySignature(Buffer.from(raw.toString().replace('100', '999')), sig)).toBe(false);
    expect(p.verifySignature(raw, signPaystack(raw, 'another-key'))).toBe(false);
    expect(p.verifySignature(raw, undefined)).toBe(false);
    expect(p.verifySignature(raw, 'abc')).toBe(false);
  });
});

describe('parsePaystackEvent', () => {
  it('reads charges, transfers, refunds and disputes, each with a stable key', () => {
    expect(
      parsePaystackEvent({
        event: 'charge.success',
        data: { reference: 'r1', status: 'success', amount: 500 },
      }),
    ).toMatchObject({
      type: 'charge',
      key: 'charge.success:r1',
      charge: { status: 'success', amountKobo: 500 },
    });
    expect(
      parsePaystackEvent({
        event: 'transfer.reversed',
        data: { reference: 't1', amount: 900, transfer_code: 'TRF' },
      }),
    ).toMatchObject({
      type: 'transfer',
      key: 'transfer.reversed:t1',
      transfer: { status: 'reversed', transferCode: 'TRF' },
      amountKobo: 900,
    });
    expect(
      parsePaystackEvent({
        event: 'refund.processed',
        data: { id: 42, transaction_reference: 'r1', amount: 300 },
      }),
    ).toMatchObject({
      type: 'refund',
      providerRefundId: '42',
      transactionReference: 'r1',
      status: 'processed',
    });
    expect(
      parsePaystackEvent({
        event: 'charge.dispute.resolve',
        data: { id: 7, resolution: 'declined', transaction: { reference: 'r1', amount: 300 } },
      }),
    ).toMatchObject({ type: 'dispute', outcome: 'won', transactionReference: 'r1' });
    expect(parsePaystackEvent({ event: 'subscription.create', data: { id: 1 } })).toMatchObject({
      type: 'ignored',
    });
  });
});

describe('fake provider fees', () => {
  it('follows Paystack local pricing', () => {
    expect(fakeChargeFee(100_000)).toBe(1_500); // ₦1,000: 1.5%, no ₦100
    expect(fakeChargeFee(500_000)).toBe(17_500); // ₦5,000: 1.5% + ₦100
    expect(fakeChargeFee(50_000_000)).toBe(200_000); // capped at ₦2,000
    expect(fakeTransferFee(500_000)).toBe(1_000);
    expect(fakeTransferFee(500_001)).toBe(2_500);
    expect(fakeTransferFee(6_000_000)).toBe(5_000);
  });
});
