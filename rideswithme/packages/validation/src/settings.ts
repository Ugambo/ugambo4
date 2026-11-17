import { z } from 'zod';
import { SETTING_KEYS, type SettingKey } from '@rideswithme/shared-types';

const value = z.union([
  z.number().int().min(0),
  z.string().trim().max(500),
  z.array(z.string().trim().max(20)).max(20),
  z.null(),
]);

/**
 * Changes to system settings: a value per setting, or null to go back to the
 * .env value. Each value is checked against that setting's own rule by the API.
 */
export const updateSettingsSchema = z
  .object({
    values: z
      .record(z.enum(SETTING_KEYS as [SettingKey, ...SettingKey[]]), value)
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' }),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export type UpdateSettingsInput = z.input<typeof updateSettingsSchema>;

export const updateVehicleCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(40).optional(),
    description: z.string().trim().max(200).optional(),
    seats: z.number().int().min(1).max(60).optional(),
    isEnabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });
export type UpdateVehicleCategoryInput = z.input<typeof updateVehicleCategorySchema>;
