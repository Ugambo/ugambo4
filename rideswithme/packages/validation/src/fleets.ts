import { z } from 'zod';
import { phoneSchema } from './auth';

export const createFleetSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    managerPhone: phoneSchema,
    contactPhone: phoneSchema.optional(),
    contactEmail: z.string().trim().email().max(254).optional(),
  })
  .strict();
export type CreateFleetInput = z.input<typeof createFleetSchema>;

export const addFleetManagerSchema = z.object({ phone: phoneSchema }).strict();
export type AddFleetManagerInput = z.input<typeof addFleetManagerSchema>;

export const inviteFleetDriverSchema = z.object({ phone: phoneSchema }).strict();
export type InviteFleetDriverInput = z.input<typeof inviteFleetDriverSchema>;

export const fleetTripsQuerySchema = z
  .object({
    driverId: z.string().uuid().optional(),
    from: z.string().date().optional(),
    to: z.string().date().optional(),
    cursor: z.string().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
export type FleetTripsQuery = z.output<typeof fleetTripsQuerySchema>;

export const adminCancelRideSchema = z
  .object({ reason: z.string().trim().min(3).max(300) })
  .strict();
export type AdminCancelRideInput = z.input<typeof adminCancelRideSchema>;
