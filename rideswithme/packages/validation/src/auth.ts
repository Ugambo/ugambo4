import { z } from 'zod';
import { GENDERS, LANGUAGES, ROLE_KEYS } from '@rideswithme/shared-types';
import { normalizeNigerianPhone } from './phone';

export const phoneSchema = z
  .string()
  .max(32)
  .transform((value, ctx) => {
    const normalised = normalizeNigerianPhone(value);
    if (!normalised) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Enter a valid Nigerian mobile number',
      });
      return z.NEVER;
    }
    return normalised;
  });

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');
export const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Code must be 6 digits');

export const devicePlatformSchema = z.enum(['ios', 'android', 'web', 'unknown']);

export const requestOtpSchema = z
  .object({
    phone: phoneSchema,
    language: z.enum(LANGUAGES).optional(),
  })
  .strict();
export type RequestOtpInput = z.input<typeof requestOtpSchema>;

export const verifyOtpSchema = z
  .object({
    phone: phoneSchema,
    code: otpCodeSchema,
    /**
     * Version of the privacy policy and terms shown on the sign-in screen.
     * Recorded as consent for new users, and whenever the version changes.
     */
    acceptedPolicyVersion: z.string().min(1).max(32),
    device: z
      .object({
        name: z.string().trim().max(100).optional(),
        platform: devicePlatformSchema.default('unknown'),
      })
      .strict()
      .default({ platform: 'unknown' }),
  })
  .strict();
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

export const refreshTokenSchema = z.object({ refreshToken: z.string().min(10).max(512) }).strict();
export type RefreshTokenInput = z.input<typeof refreshTokenSchema>;

export const totpVerifySchema = z.object({ code: totpCodeSchema }).strict();
export type TotpVerifyInput = z.input<typeof totpVerifySchema>;

/** Passengers must be at least this old to have an account (DECISIONS D-083). */
export const MIN_PASSENGER_AGE = 18;

/** YYYY-MM-DD, a real date, between MIN_PASSENGER_AGE and 120 years ago. */
export const dateOfBirthSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) &&
      new Date(`${v}T00:00:00Z`).toISOString().startsWith(v),
    'Not a real date',
  )
  .refine((v) => {
    const born = new Date(`${v}T00:00:00Z`);
    const now = new Date();
    const adult = new Date(
      Date.UTC(now.getUTCFullYear() - MIN_PASSENGER_AGE, now.getUTCMonth(), now.getUTCDate()),
    );
    const oldest = new Date(Date.UTC(now.getUTCFullYear() - 120, 0, 1));
    return born <= adult && born >= oldest;
  }, `You must be at least ${MIN_PASSENGER_AGE}`);

export const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    preferredLanguage: z.enum(LANGUAGES).optional(),
    gender: z.enum(GENDERS).optional(),
    dateOfBirth: dateOfBirthSchema.optional(),
    /** Someone texted when they press SOS (not their own number). */
    emergencyContact: z
      .object({ name: z.string().trim().min(2).max(80), phone: phoneSchema })
      .strict()
      .optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateMeInput = z.input<typeof updateMeSchema>;

export const uuidSchema = z.string().uuid();

export const assignRoleSchema = z.object({ role: z.enum(ROLE_KEYS) }).strict();
export type AssignRoleInput = z.input<typeof assignRoleSchema>;

export const suspendUserSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type SuspendUserInput = z.input<typeof suspendUserSchema>;

const reasonSchema = z.string().trim().min(3).max(500);
const fullNameSchema = z.string().trim().min(2).max(120);
const emailSchema = z.string().trim().toLowerCase().email().max(254);

/** A super admin opens an account for someone. They sign in later with an SMS code as usual. */
export const createUserSchema = z
  .object({
    phone: phoneSchema,
    fullName: fullNameSchema,
    email: emailSchema.nullable().optional(),
    preferredLanguage: z.enum(LANGUAGES).default('en'),
    /** Roles besides passenger, which every account has. */
    roles: z.array(z.enum(ROLE_KEYS)).max(ROLE_KEYS.length).default([]),
  })
  .strict();
export type CreateUserInput = z.input<typeof createUserSchema>;

/** A super admin corrects someone's details. The reason is kept in the audit log. */
export const adminUpdateUserSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    phone: phoneSchema.optional(),
    email: emailSchema.nullable().optional(),
    preferredLanguage: z.enum(LANGUAGES).optional(),
    reason: reasonSchema,
  })
  .strict()
  .refine((v) => Object.keys(v).length > 1, { message: 'Nothing to update' });
export type AdminUpdateUserInput = z.input<typeof adminUpdateUserSchema>;

export const deleteUserSchema = z.object({ reason: reasonSchema }).strict();
export type DeleteUserInput = z.input<typeof deleteUserSchema>;

const limitSchema = z.coerce.number().int().min(1).max(100).default(25);

export const listUsersQuerySchema = z
  .object({
    search: z.string().trim().max(100).optional(),
    role: z.enum(ROLE_KEYS).optional(),
    status: z.enum(['active', 'suspended', 'deleted']).optional(),
    limit: limitSchema,
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type ListUsersQuery = z.output<typeof listUsersQuerySchema>;

export const listAuditLogsQuerySchema = z
  .object({
    actorUserId: uuidSchema.optional(),
    targetId: uuidSchema.optional(),
    action: z.string().max(100).optional(),
    limit: limitSchema,
    cursor: z.string().max(200).optional(),
  })
  .strict();
export type ListAuditLogsQuery = z.output<typeof listAuditLogsQuerySchema>;
