import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeNigerianPhone } from './phone';

describe('normalizeNigerianPhone', () => {
  it.each([
    ['08031234567', '+2348031234567'],
    ['0803 123 4567', '+2348031234567'],
    ['803-123-4567', '+2348031234567'],
    ['2348031234567', '+2348031234567'],
    ['+2348031234567', '+2348031234567'],
    ['+234 (0) 803 123 4567', '+2348031234567'],
    ['002348031234567', '+2348031234567'],
    ['23408031234567', '+2348031234567'],
    ['07061234567', '+2347061234567'],
    ['09121234567', '+2349121234567'],
  ])('normalises %s', (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it.each([
    '',
    '12345',
    '0803123456', // too short
    '080312345678', // too long
    '01234567890', // landline-style prefix
    '+447911123456', // not Nigerian
    '0803abc4567',
    '06031234567',
  ])('rejects %s', (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });
});

describe('maskPhone', () => {
  it('keeps country code, operator prefix and last two digits', () => {
    expect(maskPhone('+2348031234567')).toBe('+234803*****67');
  });
});
