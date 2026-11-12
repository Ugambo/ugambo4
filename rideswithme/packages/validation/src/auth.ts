import { z } from 'zod';
import { LANGUAGES, ROLE_KEYS } from '@rideswithme/shared-types';
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

export const updateMeSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
    preferredLanguage: z.enum(LANGUAGES).optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateMeInput = z.input<typeof updateMeSchema>;

export const uuidSchema = z.string().uuid();

export const assignRoleSchema = z.object({ role: z.enum(ROLE_KEYS) }).strict();
export type AssignRoleInput = z.input<typeof assignRoleSchema>;

export const suspendUserSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
export type SuspendUserInput = z.input<typeof suspendUserSchema>;

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
