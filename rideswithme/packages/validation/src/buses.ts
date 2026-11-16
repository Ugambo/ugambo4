import { z } from 'zod';
import { PAYMENT_RETURN_TARGETS, SEAT_CLASSES } from '@rideswithme/shared-types';
import { phoneSchema } from './auth';
import { plateNumberSchema } from './drivers';

/** Most seats one booking can hold (a family or small group). */
export const BUS_MAX_SEATS_PER_BOOKING = 6;
/** Most departures created in one request (two months of daily trips). */
export const BUS_MAX_DEPARTURES_PER_REQUEST = 62;

const name = (min: number, max: number) => z.string().trim().min(min).max(max);
const city = name(2, 60);
const terminal = name(2, 200);
const date = z.string().date();
const fareKobo = z.number().int().min(10_000).max(100_000_000);
const seatClass = z.enum(SEAT_CLASSES);
const reason = name(3, 300);

// --- Staff: operators ---

export const createBusOperatorSchema = z
  .object({
    name: name(2, 100),
    managerPhone: phoneSchema,
    serviceFeeBps: z.number().int().min(0).max(5000).optional(),
    contactPhone: phoneSchema.optional(),
    contactEmail: z.string().trim().email().max(254).optional(),
  })
  .strict();
export type CreateBusOperatorInput = z.input<typeof createBusOperatorSchema>;

export const updateBusOperatorSchema = z
  .object({
    serviceFeeBps: z.number().int().min(0).max(5000).optional(),
    contactPhone: phoneSchema.nullable().optional(),
    contactEmail: z.string().trim().email().max(254).nullable().optional(),
  })
  .strict();
export type UpdateBusOperatorInput = z.input<typeof updateBusOperatorSchema>;

export const addBusOperatorManagerSchema = z.object({ phone: phoneSchema }).strict();
export type AddBusOperatorManagerInput = z.input<typeof addBusOperatorManagerSchema>;

/** Money paid to an operator outside the app (e.g. a bank transfer from the Paystack dashboard). */
export const operatorSettlementSchema = z
  .object({ amountKobo: z.number().int().positive().max(10_000_000_000), note: reason })
  .strict();
export type OperatorSettlementInput = z.input<typeof operatorSettlementSchema>;

export const adminBusBookingsQuerySchema = z
  .object({
    reference: z
      .string()
      .trim()
      .transform((s) => s.toUpperCase())
      .pipe(z.string().regex(/^[A-Z0-9]{8}$/))
      .optional(),
    phone: phoneSchema.optional(),
    scheduleId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
export type AdminBusBookingsQuery = z.output<typeof adminBusBookingsQuerySchema>;

export const reasonSchema = z.object({ reason }).strict();
export type ReasonInput = z.input<typeof reasonSchema>;

// --- Operators: routes, seat layouts, departures ---

export const busRouteSchema = z
  .object({
    originCity: city,
    originTerminal: terminal,
    destinationCity: city,
    destinationTerminal: terminal,
    durationMinutes: z.number().int().min(10).max(2880),
  })
  .strict()
  .refine((r) => r.originCity.toLowerCase() !== r.destinationCity.toLowerCase(), {
    message: 'Origin and destination must differ',
    path: ['destinationCity'],
  });
export type BusRouteInput = z.input<typeof busRouteSchema>;

export const updateBusRouteSchema = z
  .object({
    originTerminal: terminal.optional(),
    destinationTerminal: terminal.optional(),
    durationMinutes: z.number().int().min(10).max(2880).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateBusRouteInput = z.input<typeof updateBusRouteSchema>;

export const busSeatLayoutSchema = z
  .object({
    name: name(2, 60),
    rows: z.number().int().min(1).max(30),
    columns: z.number().int().min(1).max(8),
    seats: z
      .array(
        z
          .object({
            label: z
              .string()
              .trim()
              .transform((s) => s.toUpperCase())
              .pipe(z.string().regex(/^[A-Z0-9]{1,4}$/, 'Seat labels are 1 to 4 letters or digits')),
            row: z.number().int().min(1),
            col: z.number().int().min(1),
            seatClass,
          })
          .strict(),
      )
      .min(1)
      .max(240),
  })
  .strict()
  .superRefine((l, ctx) => {
    const labels = new Set<string>();
    const cells = new Set<string>();
    l.seats.forEach((s, i) => {
      if (s.row > l.rows || s.col > l.columns)
        ctx.addIssue({ code: 'custom', message: 'Seat outside the grid', path: ['seats', i] });
      if (labels.has(s.label))
        ctx.addIssue({ code: 'custom', message: 'Duplicate seat label', path: ['seats', i] });
      if (cells.has(`${s.row}:${s.col}`))
        ctx.addIssue({ code: 'custom', message: 'Two seats in one place', path: ['seats', i] });
      labels.add(s.label);
      cells.add(`${s.row}:${s.col}`);
    });
  });
export type BusSeatLayoutInput = z.input<typeof busSeatLayoutSchema>;

const faresSchema = z
  .array(z.object({ seatClass, fareKobo }).strict())
  .min(1)
  .max(3)
  .refine((f) => new Set(f.map((x) => x.seatClass)).size === f.length, 'One fare per seat class');

export const createBusDeparturesSchema = z
  .object({
    routeId: z.string().uuid(),
    layoutId: z.string().uuid(),
    /** Departure days (Nigerian time); one departure is created per day. */
    dates: z
      .array(date)
      .min(1)
      .max(BUS_MAX_DEPARTURES_PER_REQUEST)
      .refine((d) => new Set(d).size === d.length, 'Each day once'),
    /** HH:MM, Nigerian time. */
    departureTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Time as HH:MM'),
    fares: faresSchema,
    vehiclePlate: plateNumberSchema.optional(),
  })
  .strict();
export type CreateBusDeparturesInput = z.input<typeof createBusDeparturesSchema>;

export const updateBusDepartureSchema = z
  .object({ fares: faresSchema.optional(), vehiclePlate: plateNumberSchema.nullable().optional() })
  .strict();
export type UpdateBusDepartureInput = z.input<typeof updateBusDepartureSchema>;

export const operatorDeparturesQuerySchema = z
  .object({
    from: date.optional(),
    to: date.optional(),
    routeId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  })
  .strict();
export type OperatorDeparturesQuery = z.output<typeof operatorDeparturesQuerySchema>;

/** A ticket code as typed or scanned: "RWMBUS:ABCD234567", "abcd 2345 67". */
export const ticketCodeSchema = z
  .string()
  .max(40)
  .transform((s) =>
    s
      .toUpperCase()
      .replace(/^RWMBUS:/, '')
      .replace(/[\s-]/g, ''),
  )
  .pipe(z.string().regex(/^[A-Z0-9]{10}$/, 'Ticket codes are 10 letters and digits'));

export const checkInSchema = z.object({ code: ticketCodeSchema }).strict();
export type CheckInInput = z.input<typeof checkInSchema>;

// --- Passengers ---

export const busSearchQuerySchema = z
  .object({ from: city, to: city, date })
  .strict();
export type BusSearchQuery = z.output<typeof busSearchQuerySchema>;

export const createBusBookingSchema = z
  .object({
    scheduleId: z.string().uuid(),
    seats: z
      .array(z.object({ seatId: z.string().uuid(), passengerName: name(2, 100) }).strict())
      .min(1)
      .max(BUS_MAX_SEATS_PER_BOOKING)
      .refine((s) => new Set(s.map((x) => x.seatId)).size === s.length, 'Each seat once'),
  })
  .strict();
export type CreateBusBookingInput = z.input<typeof createBusBookingSchema>;

export const payBusBookingSchema = z.discriminatedUnion('method', [
  z.object({ method: z.literal('wallet') }).strict(),
  z.object({ method: z.literal('card'), cardId: z.string().uuid() }).strict(),
  z
    .object({
      method: z.literal('checkout'),
      returnTo: z.enum(PAYMENT_RETURN_TARGETS).default('app'),
    })
    .strict(),
]);
export type PayBusBookingInput = z.input<typeof payBusBookingSchema>;
