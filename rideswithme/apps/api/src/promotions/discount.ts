import { applyBasisPoints } from '@rideswithme/utilities';

/** The smallest amount a passenger pays for a ride with a promotion (₦100). */
export const MIN_PAYABLE_KOBO = 10_000;

export interface PromotionTerms {
  discountType: 'percent' | 'fixed';
  percentBps: number | null;
  amountKobo: number | null;
  maxDiscountKobo: number | null;
  minFareKobo: number;
  categoryKeys: string[];
}

/**
 * The discount a promotion gives on a fare: a percentage (capped) or a fixed
 * amount, never so much that the passenger pays less than the booking fee or
 * MIN_PAYABLE_KOBO. 0 when the fare or vehicle type does not qualify.
 */
export function promotionDiscount(
  p: PromotionTerms,
  fareKobo: number,
  categoryKey: string,
  bookingFeeKobo: number,
): { discountKobo: number; reason: 'min_fare' | 'category' | null } {
  if (p.categoryKeys.length > 0 && !p.categoryKeys.includes(categoryKey))
    return { discountKobo: 0, reason: 'category' };
  if (fareKobo < p.minFareKobo) return { discountKobo: 0, reason: 'min_fare' };
  let d =
    p.discountType === 'percent'
      ? applyBasisPoints(fareKobo, p.percentBps ?? 0)
      : (p.amountKobo ?? 0);
  if (p.maxDiscountKobo !== null) d = Math.min(d, p.maxDiscountKobo);
  const floor = Math.max(bookingFeeKobo, MIN_PAYABLE_KOBO);
  d = Math.max(0, Math.min(d, fareKobo - floor));
  return { discountKobo: d, reason: null };
}
