/**
 * Money helpers. All amounts are integer kobo (1 naira = 100 kobo).
 * Never use floating point for money: parse strings, multiply with BigInt.
 */
export type Kobo = number;

export class MoneyError extends Error {}

export function assertKobo(value: number, label = 'amount'): asserts value is Kobo {
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError(`${label} must be a whole number of kobo, got ${value}`);
  }
}

/** Parses a naira amount typed by a person, e.g. "1,500" or "1500.50", into kobo. */
export function nairaToKobo(input: string): Kobo {
  const s = input.trim().replace(/^₦/, '').replace(/,/g, '');
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!match) throw new MoneyError(`Not a naira amount: "${input}"`);
  const [, sign, whole = '0', fraction = ''] = match;
  const kobo = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0') || '0');
  const result = Number(sign ? -kobo : kobo);
  assertKobo(result);
  return result;
}

/** Formats kobo as naira for display, e.g. 150050 -> "₦1,500.50", 150000 -> "₦1,500". */
export function formatKobo(kobo: Kobo, options: { alwaysShowKobo?: boolean } = {}): string {
  assertKobo(kobo);
  const negative = kobo < 0;
  const abs = Math.abs(kobo);
  const naira = Math.trunc(abs / 100);
  const rest = abs % 100;
  const grouped = naira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction =
    rest !== 0 || options.alwaysShowKobo ? `.${rest.toString().padStart(2, '0')}` : '';
  return `${negative ? '-' : ''}₦${grouped}${fraction}`;
}

/**
 * Applies a percentage expressed in basis points (1% = 100 bps) to an amount,
 * rounding half away from zero to the nearest kobo.
 */
export function applyBasisPoints(amount: Kobo, basisPoints: number): Kobo {
  assertKobo(amount);
  if (!Number.isSafeInteger(basisPoints)) throw new MoneyError('basisPoints must be an integer');
  const product = BigInt(amount) * BigInt(basisPoints);
  const divisor = 10_000n;
  const negative = product < 0n;
  const absProduct = negative ? -product : product;
  let quotient = absProduct / divisor;
  if ((absProduct % divisor) * 2n >= divisor) quotient += 1n;
  const result = Number(negative ? -quotient : quotient);
  assertKobo(result);
  return result;
}

export function sumKobo(...amounts: Kobo[]): Kobo {
  let total = 0n;
  for (const a of amounts) {
    assertKobo(a);
    total += BigInt(a);
  }
  const result = Number(total);
  assertKobo(result, 'sum');
  return result;
}
