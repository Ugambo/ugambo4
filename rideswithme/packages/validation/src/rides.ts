import { z } from 'zod';
import { DRIVER_CANCEL_REASONS, PAYMENT_METHODS } from '@rideswithme/shared-types';

export const latLngSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  })
  .strict();

export const placeInputSchema = z
  .object({
    location: latLngSchema,
    address: z.string().trim().min(1).max(300),
    name: z.string().trim().max(120).optional(),
    placeId: z.string().max(300).optional(),
  })
  .strict();

export const fareEstimateSchema = z
  .object({ pickup: placeInputSchema, dropoff: placeInputSchema })
  .strict();
export type FareEstimateInput = z.input<typeof fareEstimateSchema>;

/** Scheduled rides: at least 15 minutes and at most 7 days ahead. */
export const SCHEDULE_MIN_LEAD_MINUTES = 15;
export const SCHEDULE_MAX_AHEAD_DAYS = 7;

export const createRideSchema = z
  .object({
    quoteId: z.string().uuid(),
    paymentMethod: z.enum(PAYMENT_METHODS).default('cash'),
    /** Required when paying by card: one of the passenger's saved cards. */
    cardId: z.string().uuid().optional(),
    scheduledFor: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine((v) => (v.paymentMethod === 'card') === !!v.cardId, {
    message: 'Choose a saved card to pay by card (and only then)',
    path: ['cardId'],
  });
export type CreateRideInput = z.input<typeof createRideSchema>;

export const passengerCancelSchema = z
  .object({ reason: z.string().trim().max(200).optional() })
  .strict();
export type PassengerCancelInput = z.input<typeof passengerCancelSchema>;

export const driverCancelSchema = z
  .object({ reason: z.enum(DRIVER_CANCEL_REASONS), note: z.string().trim().max(200).optional() })
  .strict();
export type DriverCancelInput = z.input<typeof driverCancelSchema>;

export const locationPointSchema = z
  .object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracy: z.number().min(0).max(10_000).optional(),
    heading: z.number().min(0).max(360).optional(),
    speed: z.number().min(0).max(100).optional(),
    /** Device time of the reading. */
    recordedAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type LocationPoint = z.output<typeof locationPointSchema>;

/** Points are sent in batches so a phone can flush what it buffered while offline. */
export const locationUpdateSchema = z
  .object({ points: z.array(locationPointSchema).min(1).max(500) })
  .strict();
export type LocationUpdateInput = z.input<typeof locationUpdateSchema>;

export const availabilitySchema = z
  .object({ online: z.boolean(), location: locationPointSchema.optional() })
  .strict()
  .refine((v) => !v.online || v.location, {
    message: 'Location is required to go online',
    path: ['location'],
  });
export type AvailabilityInput = z.input<typeof availabilitySchema>;

export const completeRideSchema = z
  .object({
    /** What the driver says they received in cash; recorded for disputes. */
    cashCollectedKobo: z.number().int().min(0).max(100_000_000),
  })
  .strict();
export type CompleteRideInput = z.input<typeof completeRideSchema>;

export const savedPlaceSchema = z
  .object({
    label: z.enum(['home', 'work', 'other']),
    name: z.string().trim().min(1).max(60),
    address: z.string().trim().min(1).max(300),
    location: latLngSchema,
    placeId: z.string().max(300).optional(),
  })
  .strict();
export type SavedPlaceInput = z.input<typeof savedPlaceSchema>;

const coord = z.coerce.number();
export const autocompleteQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(100),
    lat: coord.min(-90).max(90).optional(),
    lng: coord.min(-180).max(180).optional(),
    sessionToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
  })
  .strict();
export const placeDetailsQuerySchema = z
  .object({
    sessionToken: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/)
      .optional(),
  })
  .strict();
export const reverseGeocodeQuerySchema = z
  .object({ lat: coord.min(-90).max(90), lng: coord.min(-180).max(180) })
  .strict();

export const listRidesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type ListRidesQuery = z.output<typeof listRidesQuerySchema>;

// --- Admin ---

const kobo = z.number().int().min(0).max(1_000_000_000);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const peakWindowSchema = z
  .object({
    days: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    start: hhmm,
    end: hhmm,
    multiplierBps: z.number().int().min(10_000).max(30_000),
  })
  .strict()
  .refine((w) => w.start < w.end, {
    message: 'start must be before end (windows cannot cross midnight)',
  });

export const fareRuleSchema = z
  .object({
    baseFareKobo: kobo,
    perKmKobo: kobo,
    perMinuteKobo: kobo,
    minimumFareKobo: kobo,
    bookingFeeKobo: kobo,
    cancellationFeeKobo: kobo,
    cancellationGraceSeconds: z.number().int().min(0).max(3600),
    waitingFreeMinutes: z.number().int().min(0).max(60),
    waitingPerMinuteKobo: kobo,
    commissionBps: z.number().int().min(0).max(5000),
    roundingIncrementKobo: z.number().int().min(1).max(100_000),
    peakWindows: z.array(peakWindowSchema).max(20).default([]),
  })
  .strict()
  .refine((r) => r.minimumFareKobo >= r.baseFareKobo, {
    message: 'Minimum fare must be at least the base fare',
  });
export type FareRuleInput = z.input<typeof fareRuleSchema>;

const ring = z.array(z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)])).min(4);
export const serviceAreaSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_-]{1,40}$/),
    name: z.string().trim().min(2).max(80),
    boundary: z.union([
      z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1) }),
      z.object({
        type: z.literal('MultiPolygon'),
        coordinates: z.array(z.array(ring).min(1)).min(1),
      }),
    ]),
    isActive: z.boolean().default(true),
  })
  .strict();
export type ServiceAreaInput = z.input<typeof serviceAreaSchema>;

export const listAdminRidesQuerySchema = z
  .object({
    status: z.string().max(40).optional(),
    passengerId: z.string().uuid().optional(),
    driverId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type ListAdminRidesQuery = z.output<typeof listAdminRidesQuerySchema>;
