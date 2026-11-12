import { describe, expect, it } from 'vitest';
import {
  isoDateSchema,
  ninSchema,
  payoutAccountSchema,
  plateNumberSchema,
  requestDocumentUploadSchema,
  upsertVehicleSchema,
} from './drivers';

describe('driver schemas', () => {
  it('normalises NIN and rejects wrong lengths', () => {
    expect(ninSchema.parse('123 4567 8901')).toBe('12345678901');
    expect(ninSchema.safeParse('1234567890').success).toBe(false);
    expect(ninSchema.safeParse('1234567890a').success).toBe(false);
  });

  it('normalises plate numbers', () => {
    expect(plateNumberSchema.parse('abc-123 de')).toBe('ABC123DE');
    expect(plateNumberSchema.parse('KTN 452 XA')).toBe('KTN452XA');
    expect(plateNumberSchema.safeParse('ABCDEFG').success).toBe(false);
    expect(plateNumberSchema.safeParse('12345').success).toBe(false);
    expect(plateNumberSchema.safeParse('AB1').success).toBe(false);
  });

  it('validates real calendar dates', () => {
    expect(isoDateSchema.safeParse('2027-02-28').success).toBe(true);
    expect(isoDateSchema.safeParse('2027-02-30').success).toBe(false);
    expect(isoDateSchema.safeParse('28/02/2027').success).toBe(false);
  });

  it('limits vehicle year to the next model year', () => {
    const schema = upsertVehicleSchema(new Date('2026-11-12T00:00:00Z'));
    const base = {
      categoryKey: 'car',
      plateNumber: 'ABC123DE',
      make: 'Toyota',
      model: 'Corolla',
      colour: 'Silver',
    };
    expect(schema.safeParse({ ...base, year: 2027 }).success).toBe(true);
    expect(schema.safeParse({ ...base, year: 2028 }).success).toBe(false);
    expect(schema.safeParse({ ...base, year: 1985 }).success).toBe(false);
  });

  it('validates NUBAN payout accounts', () => {
    expect(
      payoutAccountSchema.parse({
        bankCode: '058',
        accountNumber: '0123 456 789',
        accountName: 'Musa Ali',
      }).accountNumber,
    ).toBe('0123456789');
    expect(
      payoutAccountSchema.safeParse({
        bankCode: '58',
        accountNumber: '0123456789',
        accountName: 'Musa',
      }).success,
    ).toBe(false);
  });

  it('caps upload size and file type', () => {
    expect(
      requestDocumentUploadSchema.safeParse({
        documentType: 'drivers_licence',
        contentType: 'image/heic',
        sizeBytes: 100,
      }).success,
    ).toBe(false);
    expect(
      requestDocumentUploadSchema.safeParse({
        documentType: 'drivers_licence',
        contentType: 'application/pdf',
        sizeBytes: 11 * 1024 * 1024,
      }).success,
    ).toBe(false);
    expect(
      requestDocumentUploadSchema.safeParse({
        documentType: 'drivers_licence',
        contentType: 'application/pdf',
        sizeBytes: 2048,
      }).success,
    ).toBe(true);
  });
});
