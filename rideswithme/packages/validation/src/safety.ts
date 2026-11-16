import { z } from 'zod';
import { INCIDENT_CATEGORIES, RATING_TAGS, TICKET_CATEGORIES } from '@rideswithme/shared-types';
import { promoCodeSchema } from './rides';

const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  recordedAt: z.string().datetime({ offset: true }).optional(),
});

/** SOS: everything optional, so a press is never refused for a missing field. */
export const raiseSosSchema = z
  .object({
    rideId: z.string().uuid().optional(),
    location: point.optional(),
    note: text(1, 500).optional(),
  })
  .strict();
export type RaiseSosInput = z.input<typeof raiseSosSchema>;

export const resolveSosSchema = z.object({ note: text(3, 1000) }).strict();
export type ResolveSosInput = z.input<typeof resolveSosSchema>;

export const rideMessageSchema = z.object({ body: text(1, 500) }).strict();
export type RideMessageInput = z.input<typeof rideMessageSchema>;

export const reportIncidentSchema = z
  .object({
    rideId: z.string().uuid().optional(),
    category: z.enum(INCIDENT_CATEGORIES),
    description: text(5, 2000),
  })
  .strict();
export type ReportIncidentInput = z.input<typeof reportIncidentSchema>;

export const updateIncidentSchema = z
  .object({
    status: z.enum(['investigating', 'resolved']),
    note: text(3, 2000).optional(),
  })
  .strict()
  .refine((v) => v.status !== 'resolved' || !!v.note, {
    message: 'Explain how it was resolved',
    path: ['note'],
  });
export type UpdateIncidentInput = z.input<typeof updateIncidentSchema>;

export const rateRideSchema = z
  .object({
    stars: z.number().int().min(1).max(5),
    tags: z.array(z.enum(RATING_TAGS)).max(5).default([]),
    comment: text(1, 500).optional(),
  })
  .strict();
export type RateRideInput = z.input<typeof rateRideSchema>;

export const promotionSchema = z
  .object({
    code: promoCodeSchema,
    description: text(3, 200),
    discountType: z.enum(['percent', 'fixed']),
    percentBps: z.number().int().min(1).max(10_000).optional(),
    amountKobo: z.number().int().positive().max(100_000_000).optional(),
    maxDiscountKobo: z.number().int().positive().max(100_000_000).optional(),
    minFareKobo: z.number().int().min(0).max(100_000_000).default(0),
    categoryKeys: z.array(z.string().max(40)).max(10).default([]),
    firstRideOnly: z.boolean().default(false),
    perUserLimit: z.number().int().min(1).max(100).default(1),
    maxRedemptions: z.number().int().min(1).max(10_000_000).optional(),
    startsAt: z.string().datetime({ offset: true }),
    endsAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine((p) => Date.parse(p.endsAt) > Date.parse(p.startsAt), {
    message: 'Must end after it starts',
    path: ['endsAt'],
  })
  .refine(
    (p) =>
      p.discountType === 'percent'
        ? !!p.percentBps && !p.amountKobo
        : !!p.amountKobo && !p.percentBps,
    {
      message: 'A percentage promotion needs percentBps; a fixed one needs amountKobo',
      path: ['discountType'],
    },
  );
export type PromotionInput = z.input<typeof promotionSchema>;

export const updatePromotionSchema = z
  .object({
    description: text(3, 200).optional(),
    endsAt: z.string().datetime({ offset: true }).optional(),
    maxRedemptions: z.number().int().min(1).max(10_000_000).nullable().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdatePromotionInput = z.input<typeof updatePromotionSchema>;

export const createTicketSchema = z
  .object({
    category: z.enum(TICKET_CATEGORIES),
    subject: text(3, 120),
    body: text(1, 4000),
    rideId: z.string().uuid().optional(),
    busBookingId: z.string().uuid().optional(),
  })
  .strict();
export type CreateTicketInput = z.input<typeof createTicketSchema>;

export const ticketMessageSchema = z.object({ body: text(1, 4000) }).strict();
export type TicketMessageInput = z.input<typeof ticketMessageSchema>;

export const ticketStatusSchema = z
  .object({ status: z.enum(['open', 'waiting_on_user', 'resolved']) })
  .strict();

export const adminTicketsQuerySchema = z
  .object({
    status: z.enum(['open', 'waiting_on_user', 'resolved']).optional(),
    userId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();
export type AdminTicketsQuery = z.output<typeof adminTicketsQuerySchema>;

export const pushTokenSchema = z
  .object({
    token: z.string().min(10).max(300),
    app: z.enum(['passenger', 'driver']),
    platform: z.enum(['ios', 'android']),
  })
  .strict();
export type PushTokenInput = z.input<typeof pushTokenSchema>;

export const deletionRequestSchema = z.object({ reason: text(1, 500).optional() }).strict();
export type DeletionRequestInput = z.input<typeof deletionRequestSchema>;
