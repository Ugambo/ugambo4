import type { FareRuleView, PeakWindow } from '@rideswithme/shared-types';
import type { FareRuleInput } from '@rideswithme/validation';
import { nairaToKobo } from '@rideswithme/utilities';

/** The pricing form, as typed by staff: naira, percent and multipliers as text. */
export interface FareForm {
  base: string;
  perKm: string;
  perMinute: string;
  minimum: string;
  bookingFee: string;
  cancellationFee: string;
  graceSeconds: string;
  waitingFreeMinutes: string;
  waitingPerMinute: string;
  commissionPercent: string;
  rounding: string;
  peaks: { days: number[]; start: string; end: string; multiplier: string }[];
}

/** Kobo to a naira string with no trailing ".00" (12345 -> "123.45", 50000 -> "500"). */
export function nairaText(kobo: number): string {
  const naira = Math.trunc(kobo / 100);
  const rest = Math.abs(kobo % 100);
  return rest === 0 ? String(naira) : `${naira}.${String(rest).padStart(2, '0')}`;
}

/** Basis points to a percent or multiplier string (2000 -> "20", 1250 -> "12.5"; 12000 -> "1.2"). */
const bpsText = (bps: number, per: number) => String(bps / per);

/** "20" or "12.5" percent -> basis points (integer, at most two decimals). */
export function percentToBps(text: string): number {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text.trim())) throw new Error(`Not a percentage: "${text}"`);
  const [whole, frac = ''] = text.trim().split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** "1.2" -> 12000 basis points (at most four decimals). */
export function multiplierToBps(text: string): number {
  if (!/^\d(\.\d{1,4})?$/.test(text.trim())) throw new Error(`Not a multiplier: "${text}"`);
  const [whole, frac = ''] = text.trim().split('.');
  return Number(whole) * 10_000 + Number(frac.padEnd(4, '0'));
}

const int = (text: string, what: string): number => {
  if (!/^\d+$/.test(text.trim())) throw new Error(`Not a whole number: ${what}`);
  return Number(text.trim());
};

export function formFromRule(r: FareRuleView): FareForm {
  return {
    base: nairaText(r.baseFareKobo),
    perKm: nairaText(r.perKmKobo),
    perMinute: nairaText(r.perMinuteKobo),
    minimum: nairaText(r.minimumFareKobo),
    bookingFee: nairaText(r.bookingFeeKobo),
    cancellationFee: nairaText(r.cancellationFeeKobo),
    graceSeconds: String(r.cancellationGraceSeconds),
    waitingFreeMinutes: String(r.waitingFreeMinutes),
    waitingPerMinute: nairaText(r.waitingPerMinuteKobo),
    commissionPercent: bpsText(r.commissionBps, 100),
    rounding: nairaText(r.roundingIncrementKobo),
    peaks: r.peakWindows.map((p) => ({
      days: [...p.days],
      start: p.start,
      end: p.end,
      multiplier: bpsText(p.multiplierBps, 10_000),
    })),
  };
}

/** Converts the form to the API's kobo and basis points. Throws with a readable message on bad input. */
export function ruleFromForm(f: FareForm): FareRuleInput {
  const peaks: PeakWindow[] = f.peaks.map((p) => ({
    days: [...p.days].sort(),
    start: p.start,
    end: p.end,
    multiplierBps: multiplierToBps(p.multiplier),
  }));
  return {
    baseFareKobo: nairaToKobo(f.base),
    perKmKobo: nairaToKobo(f.perKm),
    perMinuteKobo: nairaToKobo(f.perMinute),
    minimumFareKobo: nairaToKobo(f.minimum),
    bookingFeeKobo: nairaToKobo(f.bookingFee),
    cancellationFeeKobo: nairaToKobo(f.cancellationFee),
    cancellationGraceSeconds: int(f.graceSeconds, 'free cancellation seconds'),
    waitingFreeMinutes: int(f.waitingFreeMinutes, 'free waiting minutes'),
    waitingPerMinuteKobo: nairaToKobo(f.waitingPerMinute),
    commissionBps: percentToBps(f.commissionPercent),
    roundingIncrementKobo: nairaToKobo(f.rounding),
    peakWindows: peaks,
  };
}
