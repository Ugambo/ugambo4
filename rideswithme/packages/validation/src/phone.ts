/**
 * Nigerian mobile numbers in E.164 form: +234 followed by a 10-digit national
 * significant number starting 70, 71, 80, 81, 90 or 91.
 */
export const NIGERIAN_MOBILE_E164 = /^\+234[789][01]\d{8}$/;

/**
 * Normalises the ways people type Nigerian mobile numbers into E.164.
 * Accepts 0803 123 4567, 803-123-4567, 2348031234567, +234 (0) 803 123 4567.
 * Returns null when the input is not a Nigerian mobile number.
 */
export function normalizeNigerianPhone(input: string): string | null {
  let s = input
    .trim()
    .replace(/\(0\)/g, '')
    .replace(/[\s\-().]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (s.startsWith('+')) {
    s = s.slice(1);
    if (!s.startsWith('234')) return null;
  }
  if (!/^\d+$/.test(s)) return null;

  let national: string;
  if (s.startsWith('234') && s.length === 13) national = s.slice(3);
  else if (s.startsWith('2340') && s.length === 14) national = s.slice(4);
  else if (s.startsWith('0') && s.length === 11) national = s.slice(1);
  else if (s.length === 10) national = s;
  else return null;

  const e164 = `+234${national}`;
  return NIGERIAN_MOBILE_E164.test(e164) ? e164 : null;
}

/** Masks a phone number for display and logs: +234803*****67 */
export function maskPhone(e164: string): string {
  if (e164.length < 8) return '***';
  return `${e164.slice(0, 7)}${'*'.repeat(e164.length - 9)}${e164.slice(-2)}`;
}
