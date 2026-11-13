import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { ErrorCode, type PaymentMethod } from '@rideswithme/shared-types';
import { applyBasisPoints } from '@rideswithme/utilities';
import { AppException } from '../common/app-exception';
import { DB } from '../database/database.module';
import { koboFromDb } from '../database/geo';
import type { Database } from '../database/types';
import { credit, debit, type LedgerLine, LedgerService } from './ledger.service';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment.provider';
import { PaymentsService } from './payments.service';

export interface RideForPayment {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  payment_method: string;
  card_id: string | null;
}

export interface FareSplit {
  bookingFeeKobo: number;
  commissionKobo: number;
  driverEarningsKobo: number;
}

/**
 * Money for rides. Called inside the ride's own transaction, so a ride's state
 * and its money always change together.
 *
 * - Cash: the driver keeps the fare; their wallet is debited the booking fee and
 *   commission (it may go negative; see DRIVER_DEBT_LIMIT_KOBO).
 * - Wallet: the quoted price is held at booking; at the end the final price is
 *   taken from the hold (and the wallet, for any waiting charge), the rest returned.
 * - Card: the saved card is charged after the trip; until the charge succeeds
 *   the passenger owes the fare. The driver is paid either way.
 */
@Injectable()
export class RidePaymentsService {
  private readonly logger = new Logger(RidePaymentsService.name);

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentsService,
  ) {}

  /** Before booking: nothing may be owed, and a card must be the passenger's own. */
  async checkBooking(
    trx: Kysely<Database>,
    passengerId: string,
    method: PaymentMethod,
    cardId: string | null,
  ): Promise<void> {
    await this.payments.collectOutstanding(trx, passengerId);
    const owed = await this.payments.owedKobo(passengerId, trx);
    if (owed > 0) {
      throw new AppException(ErrorCode.OUTSTANDING_BALANCE, 'Pay what you owe first', {
        details: { owedKobo: owed },
      });
    }
    if (method === 'card') {
      if (!cardId) throw new AppException(ErrorCode.CARD_NOT_FOUND, 'Choose a card');
      await this.payments.cardAuthorization(trx, passengerId, cardId);
    }
  }

  /** Holds the quoted price in the passenger's wallet (fails if the balance is too low). */
  async hold(
    trx: Kysely<Database>,
    rideId: string,
    passengerId: string,
    amountKobo: number,
  ): Promise<void> {
    await this.ledger.post(trx, {
      kind: 'ride_hold',
      reference: `ride:${rideId}:hold`,
      rideId,
      memo: 'Held for your ride',
      lines: [
        debit({ user: passengerId, kind: 'passenger' }, amountKobo),
        credit({ system: 'ride_holds' }, amountKobo),
      ],
    });
  }

  /** Returns a wallet hold in full (no driver found, or a free cancellation). */
  async release(trx: Kysely<Database>, rideId: string, passengerId: string): Promise<void> {
    const held = await this.ledger.heldForRide(trx, rideId);
    if (held <= 0) return;
    await this.ledger.post(trx, {
      kind: 'ride_hold_release',
      reference: `ride:${rideId}:release`,
      rideId,
      memo: 'Hold returned',
      lines: [
        debit({ system: 'ride_holds' }, held),
        credit({ user: passengerId, kind: 'passenger' }, held),
      ],
    });
  }

  /** A completed trip: pays the driver and the platform, and takes the fare from the passenger. */
  async settleCompletion(
    trx: Kysely<Database>,
    ride: RideForPayment,
    driverId: string,
    finalKobo: number,
    split: FareSplit,
    commissionBps: number,
    now: Date,
  ): Promise<void> {
    const fees = split.bookingFeeKobo + split.commissionKobo;
    const driver = { user: driverId, kind: 'driver' as const };
    let journalId: string | null = null;

    if (ride.payment_method === 'cash') {
      await trx
        .insertInto('payments')
        .values({
          ride_id: ride.id,
          payer_id: ride.passenger_id,
          method: 'cash',
          purpose: 'ride_fare',
          amount_kobo: finalKobo,
          status: 'collected',
          collected_by: driverId,
          collected_at: now,
          paid_at: now,
        })
        .execute();
      const posted = await this.ledger.post(trx, {
        kind: 'cash_commission',
        reference: `ride:${ride.id}:cash_commission`,
        rideId: ride.id,
        memo: 'Booking fee and commission on a cash trip',
        lines: [debit(driver, fees), credit({ system: 'platform_revenue' }, fees)],
      });
      journalId = posted?.journalId ?? null;
    } else {
      const { lines, owed, paymentStatus } =
        ride.payment_method === 'wallet'
          ? await this.takeFromWallet(trx, ride, finalKobo)
          : {
              lines: [debit({ system: 'passenger_receivables' }, finalKobo)],
              owed: finalKobo,
              paymentStatus: 'pending' as const,
            };
      const paymentId = randomUUID();
      await trx
        .insertInto('payments')
        .values({
          id: paymentId,
          ride_id: ride.id,
          payer_id: ride.passenger_id,
          method: ride.payment_method as 'wallet' | 'card',
          purpose: 'ride_fare',
          amount_kobo: finalKobo,
          status: paymentStatus,
          outstanding_kobo: owed,
          card_id: ride.card_id,
          ...(ride.payment_method === 'card' && {
            provider: this.provider.name,
            provider_reference: paymentId,
          }),
          ...(paymentStatus === 'succeeded' && { paid_at: now }),
        })
        .execute();
      const posted = await this.ledger.post(trx, {
        kind: 'ride_settlement',
        reference: `ride:${ride.id}:settle`,
        rideId: ride.id,
        paymentId,
        lines: [
          ...lines,
          credit(driver, split.driverEarningsKobo),
          credit({ system: 'platform_revenue' }, fees),
        ],
      });
      journalId = posted?.journalId ?? null;
    }

    await trx
      .insertInto('commissions')
      .values({
        ride_id: ride.id,
        driver_id: driverId,
        fare_kobo: finalKobo,
        booking_fee_kobo: split.bookingFeeKobo,
        commission_bps: commissionBps,
        commission_kobo: split.commissionKobo,
        status: 'pending_settlement',
        journal_id: journalId,
      })
      .execute();
    await trx
      .updateTable('commissions')
      .set({ status: 'settled' })
      .where('ride_id', '=', ride.id)
      .execute();
  }

  /**
   * A cancellation. With no fee, any hold is returned. A fee goes to the
   * driver less the platform's commission; the passenger pays it from the hold,
   * their card, or owes it (cash rides: collected from the wallet when there is money).
   */
  async settleCancellation(
    trx: Kysely<Database>,
    ride: RideForPayment,
    feeKobo: number,
    commissionBps: number,
  ): Promise<void> {
    if (feeKobo <= 0) {
      if (ride.payment_method === 'wallet') await this.release(trx, ride.id, ride.passenger_id);
      return;
    }
    const cut = ride.driver_id ? applyBasisPoints(feeKobo, commissionBps) : feeKobo;
    const shares: LedgerLine[] = [credit({ system: 'platform_revenue' }, cut)];
    if (ride.driver_id)
      shares.push(credit({ user: ride.driver_id, kind: 'driver' }, feeKobo - cut));

    const { lines, owed, paymentStatus } =
      ride.payment_method === 'wallet'
        ? await this.takeFromWallet(trx, ride, feeKobo)
        : {
            lines: [debit({ system: 'passenger_receivables' }, feeKobo)],
            owed: feeKobo,
            paymentStatus:
              ride.payment_method === 'card' ? ('pending' as const) : ('outstanding' as const),
          };
    const paymentId = randomUUID();
    await trx
      .insertInto('payments')
      .values({
        id: paymentId,
        ride_id: ride.id,
        payer_id: ride.passenger_id,
        method: ride.payment_method as PaymentMethod,
        purpose: 'cancellation_fee',
        amount_kobo: feeKobo,
        status: paymentStatus,
        outstanding_kobo: owed,
        card_id: ride.card_id,
        ...(ride.payment_method === 'card' && {
          provider: this.provider.name,
          provider_reference: paymentId,
        }),
        ...(paymentStatus === 'succeeded' && { paid_at: new Date() }),
      })
      .execute();
    await this.ledger.post(trx, {
      kind: 'cancellation_fee',
      reference: `ride:${ride.id}:cancel`,
      rideId: ride.id,
      paymentId,
      memo: 'Cancellation fee',
      lines: [...lines, ...shares],
    });
    // A cash passenger with money in their wallet pays the fee from it at once.
    if (ride.payment_method === 'cash')
      await this.payments.collectOutstanding(trx, ride.passenger_id);
  }

  /**
   * Takes an amount for a wallet ride: from its hold first (returning what is
   * left), then from the wallet; anything still missing is owed.
   */
  private async takeFromWallet(trx: Kysely<Database>, ride: RideForPayment, amountKobo: number) {
    const held = await this.ledger.heldForRide(trx, ride.id);
    const { balanceKobo } = await this.ledger.lockUserWallet(trx, ride.passenger_id, 'passenger');
    const fromHold = Math.min(held, amountKobo);
    const back = held - fromHold;
    const fromWallet = Math.min(amountKobo - fromHold, balanceKobo + back);
    const owed = amountKobo - fromHold - fromWallet;
    const passenger = { user: ride.passenger_id, kind: 'passenger' as const };
    const lines: LedgerLine[] = [
      debit({ system: 'ride_holds' }, held),
      credit(passenger, back),
      debit(passenger, fromWallet),
      debit({ system: 'passenger_receivables' }, owed),
    ];
    return {
      lines,
      owed,
      paymentStatus: owed > 0 ? ('outstanding' as const) : ('succeeded' as const),
    };
  }

  /**
   * Charges the saved card for a ride's pending card payments. Runs after the
   * ride's transaction commits; if the provider cannot be reached the payment
   * stays pending and the reconciliation job tries again.
   */
  async chargePendingCards(rideId: string): Promise<void> {
    const pending = await this.db
      .selectFrom('payments')
      .select(['id', 'payer_id', 'card_id', 'amount_kobo', 'provider_reference'])
      .where('ride_id', '=', rideId)
      .where('method', '=', 'card')
      .where('status', '=', 'pending')
      .execute();
    for (const p of pending) await this.chargeCard(p);
  }

  async chargeCard(p: {
    id: string;
    payer_id: string;
    card_id: string | null;
    amount_kobo: string;
    provider_reference: string | null;
  }): Promise<void> {
    try {
      // A card removed after booking can still be charged for that ride.
      const authorizationCode = await this.payments.cardAuthorization(
        this.db,
        p.payer_id,
        p.card_id ?? '',
        true,
      );
      const result = await this.provider.chargeCard({
        reference: p.provider_reference ?? p.id,
        authorizationCode,
        email: await this.payments.email(p.payer_id),
        amountKobo: koboFromDb(p.amount_kobo),
        metadata: { paymentId: p.id },
      });
      await this.payments.applyCharge(result);
    } catch (err) {
      this.logger.warn(
        { err: (err as Error).message, paymentId: p.id },
        'Card charge not completed; will retry',
      );
    }
  }
}
