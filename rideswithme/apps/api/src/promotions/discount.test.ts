import { describe, expect, it } from 'vitest';
import { promotionDiscount, type PromotionTerms } from './discount';

const percent = (bps: number, extra: Partial<PromotionTerms> = {}): PromotionTerms => ({
  discountType: 'percent',
  percentBps: bps,
  amountKobo: null,
  maxDiscountKobo: null,
  minFareKobo: 0,
  categoryKeys: [],
  ...extra,
});

describe('promotionDiscount', () => {
  it('takes a percentage, capped', () => {
    expect(promotionDiscount(percent(2000), 250_000, 'car', 20_000).discountKobo).toBe(50_000);
    expect(
      promotionDiscount(percent(2000, { maxDiscountKobo: 30_000 }), 250_000, 'car', 20_000)
        .discountKobo,
    ).toBe(30_000);
  });

  it('takes a fixed amount but always leaves the booking fee (at least ₦100) to pay', () => {
    const fixed: PromotionTerms = {
      ...percent(1),
      discountType: 'fixed',
      percentBps: null,
      amountKobo: 500_000,
    };
    expect(promotionDiscount(fixed, 180_000, 'car', 20_000).discountKobo).toBe(160_000);
    expect(promotionDiscount(fixed, 180_000, 'car', 0).discountKobo).toBe(170_000);
  });

  it('gives nothing below the minimum fare or for other vehicle types', () => {
    expect(promotionDiscount(percent(1000, { minFareKobo: 200_000 }), 150_000, 'car', 0)).toEqual({
      discountKobo: 0,
      reason: 'min_fare',
    });
    expect(
      promotionDiscount(percent(1000, { categoryKeys: ['keke_napep'] }), 150_000, 'car', 0),
    ).toEqual({
      discountKobo: 0,
      reason: 'category',
    });
  });
});
