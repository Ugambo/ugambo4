import { describe, expect, it, vi } from 'vitest';
import type { PaymentView } from '@rideswithme/shared-types';
import { waitForPayment } from './payment-wait';

const view = (status: PaymentView['status']) => ({ id: 'p', status }) as PaymentView;
const noSleep = async () => undefined;

describe('waitForPayment', () => {
  it('stops as soon as the payment is no longer pending', async () => {
    const check = vi
      .fn()
      .mockResolvedValueOnce(view('pending'))
      .mockResolvedValueOnce(view('succeeded'));
    expect((await waitForPayment(check, 'p', { sleep: noSleep })).status).toBe('succeeded');
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('returns the last answer when still pending, and rides out network errors', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(view('pending'));
    expect((await waitForPayment(check, 'p', { tries: 3, sleep: noSleep })).status).toBe('pending');
    expect(check).toHaveBeenCalledTimes(3);
  });

  it('throws when it never got an answer', async () => {
    const check = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(waitForPayment(check, 'p', { tries: 2, sleep: noSleep })).rejects.toThrow(
      'offline',
    );
  });
});
