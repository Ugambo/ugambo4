import { z } from 'zod';
import {
  DOCUMENT_TYPES,
  DRIVER_STATUSES,
  MAX_DOCUMENT_UPLOAD_BYTES,
  UPLOAD_CONTENT_TYPES,
} from '@rideswithme/shared-types';

const digitsOnly = (s: string) => s.replace(/[\s-]/g, '');

/** National Identification Number: 11 digits. */
export const ninSchema = z
  .string()
  .transform(digitsOnly)
  .pipe(z.string().regex(/^\d{11}$/, 'NIN must be 11 digits'));

/**
 * Plate numbers in upper case without spaces or dashes ("abc-123 de" -> "ABC123DE").
 * Deliberately lenient: Nigeria has several plate formats (private, commercial,
 * government, older series).
 */
export const plateNumberSchema = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[\s-]/g, ''))
  .pipe(
    z
      .string()
      .regex(/^[A-Z0-9]{5,10}$/, 'Plate number must be 5 to 10 letters and digits')
      .refine((s) => /[A-Z]/.test(s) && /\d/.test(s), 'Plate number needs letters and digits'),
  );

/** YYYY-MM-DD that is a real calendar date. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Not a real date');

const shortText = z.string().trim().min(1).max(40);

export const updateDriverProfileSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    nin: ninSchema.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateDriverProfileInput = z.input<typeof updateDriverProfileSchema>;

export const upsertVehicleSchema = (now: Date = new Date()) =>
  z
    .object({
      categoryKey: z.string().min(1).max(31),
      plateNumber: plateNumberSchema,
      make: shortText,
      model: shortText,
      colour: shortText,
      year: z.coerce
        .number()
        .int()
        .min(1990)
        .max(now.getUTCFullYear() + 1),
    })
    .strict();
export type UpsertVehicleInput = z.input<ReturnType<typeof upsertVehicleSchema>>;

export const payoutAccountSchema = z
  .object({
    /** CBN/NIP bank code, e.g. 058. Resolved against the bank list in Phase 5. */
    bankCode: z.string().regex(/^\d{3,6}$/, 'Invalid bank code'),
    /** 10-digit NUBAN account number. */
    accountNumber: z
      .string()
      .transform(digitsOnly)
      .pipe(z.string().regex(/^\d{10}$/, 'Account number must be 10 digits')),
    accountName: z.string().trim().min(2).max(100),
  })
  .strict();
export type PayoutAccountInput = z.input<typeof payoutAccountSchema>;

export const documentTypeSchema = z.enum(DOCUMENT_TYPES);

export const requestDocumentUploadSchema = z
  .object({
    documentType: documentTypeSchema,
    contentType: z.enum(UPLOAD_CONTENT_TYPES),
    sizeBytes: z.number().int().min(1).max(MAX_DOCUMENT_UPLOAD_BYTES),
  })
  .strict();
export type RequestDocumentUploadInput = z.input<typeof requestDocumentUploadSchema>;

const documentNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9/ -]{3,40}$/, 'Use letters, digits, spaces, / or -');

export const submitDocumentSchema = z
  .object({
    uploadId: z.string().uuid(),
    documentNumber: documentNumberSchema.optional(),
    expiresOn: isoDateSchema.optional(),
  })
  .strict();
export type SubmitDocumentInput = z.input<typeof submitDocumentSchema>;

export const approveDocumentSchema = z
  .object({
    /** Reviewer may set or correct the expiry date read from the document. */
    expiresOn: isoDateSchema.optional(),
  })
  .strict();
export type ApproveDocumentInput = z.input<typeof approveDocumentSchema>;

export const rejectWithReasonSchema = z
  .object({ reason: z.string().trim().min(3).max(500) })
  .strict();
export type RejectWithReasonInput = z.input<typeof rejectWithReasonSchema>;

export const rejectDocumentSchema = z
  .object({
    reason: z.string().trim().min(3).max(500),
    /**
     * Must be true to reject a document that is already approved (e.g. found to be
     * forged). Without it, a reviewer cannot silently overturn a colleague's decision.
     */
    withdrawApproval: z.boolean().default(false),
  })
  .strict();
export type RejectDocumentInput = z.input<typeof rejectDocumentSchema>;

export const listDriversQuerySchema = z
  .object({
    /** "review": waiting for a decision (submitted, or with pending documents), oldest first. */
    queue: z.enum(['review', 'all']).default('review'),
    status: z.enum(DRIVER_STATUSES).optional(),
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type ListDriversQuery = z.output<typeof listDriversQuerySchema>;
