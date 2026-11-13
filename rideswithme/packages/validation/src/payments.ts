import { z } from 'zod';
import { DISPUTE_REASONS, PAYMENT_RETURN_TARGETS } from '@rideswithme/shared-types';

const kobo = z.number().int().positive().max(1_000_000_000);

export const topUpSchema = z
  .object({ amountKobo: kobo, returnTo: z.enum(PAYMENT_RETURN_TARGETS).default('app') })
  .strict();
export type TopUpInput = z.input<typeof topUpSchema>;

export const addCardSchema = z
  .object({ returnTo: z.enum(PAYMENT_RETURN_TARGETS).default('app') })
  .strict();
export type AddCardInput = z.input<typeof addCardSchema>;

export const payoutRequestSchema = z.object({ amountKobo: kobo }).strict();
export type PayoutRequestInput = z.input<typeof payoutRequestSchema>;

export const raiseDisputeSchema = z
  .object({
    reason: z.enum(DISPUTE_REASONS),
    details: z.string().trim().max(1000).optional(),
  })
  .strict();
export type RaiseDisputeInput = z.input<typeof raiseDisputeSchema>;

export const refundSchema = z
  .object({
    amountKobo: kobo,
    destination: z.enum(['wallet', 'card']).default('wallet'),
    fundedBy: z.enum(['platform', 'driver']).default('platform'),
    reason: z.string().trim().min(3).max(500),
    disputeId: z.string().uuid().optional(),
  })
  .strict();
export type RefundInput = z.input<typeof refundSchema>;

export const resolveDisputeSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal('refund'),
      amountKobo: kobo,
      destination: z.enum(['wallet', 'card']).default('wallet'),
      fundedBy: z.enum(['platform', 'driver']).default('platform'),
      note: z.string().trim().min(3).max(500),
    })
    .strict(),
  z.object({ outcome: z.literal('reject'), note: z.string().trim().min(3).max(500) }).strict(),
]);
export type ResolveDisputeInput = z.input<typeof resolveDisputeSchema>;

export const walletAdjustmentSchema = z
  .object({
    /** Positive credits the user's wallet, negative debits it; the other side is platform revenue. */
    amountKobo: z
      .number()
      .int()
      .refine((n) => n !== 0, 'Must not be zero')
      .refine((n) => Math.abs(n) <= 100_000_000),
    kind: z.enum(['passenger', 'driver']),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type WalletAdjustmentInput = z.input<typeof walletAdjustmentSchema>;

export const pageQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
