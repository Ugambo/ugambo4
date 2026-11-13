import type { PaymentView } from '@rideswithme/shared-types';

/**
 * After the payer comes back from the payment page, asks the server (which
 * asks the provider) how the payment went, a few times while it is pending.
 * Returns the last answer; it may still be pending (the webhook settles it later).
 */
export async function waitForPayment(
  check: (id: string) => Promise<PaymentView>,
  paymentId: string,
  opts: { tries?: number; delayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<PaymentView> {
  const tries = opts.tries ?? 8;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let last: PaymentView | null = null;
  let lastError: unknown = null;
  for (let i = 0; i < tries; i++) {
    try {
      last = await check(paymentId);
      if (last.status !== 'pending') return last;
    } catch (err) {
      lastError = err;
    }
    if (i < tries - 1) await sleep(opts.delayMs ?? 2000);
  }
  if (last) return last;
  throw lastError;
}
