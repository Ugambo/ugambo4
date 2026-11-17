import { z } from 'zod';
import { PASSENGER_ID_TYPES } from '@rideswithme/shared-types';
import { ninSchema } from './drivers';

/** A photo for the identity check: the ID or the selfie (JPEG or PNG, up to 10 MB). */
export const requestKycUploadSchema = z
  .object({
    kind: z.enum(['id', 'selfie']),
    contentType: z.enum(['image/jpeg', 'image/png']),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(10 * 1024 * 1024),
  })
  .strict();
export type RequestKycUploadInput = z.input<typeof requestKycUploadSchema>;

export const submitKycSchema = z
  .object({
    idType: z.enum(PASSENGER_ID_TYPES),
    nin: ninSchema,
    idUploadId: z.string().uuid(),
    selfieUploadId: z.string().uuid(),
  })
  .strict();
export type SubmitKycInput = z.input<typeof submitKycSchema>;

export const rejectKycSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type RejectKycInput = z.input<typeof rejectKycSchema>;

export const listKycQuerySchema = z
  .object({ status: z.enum(['pending', 'approved', 'rejected']).default('pending') })
  .strict();
