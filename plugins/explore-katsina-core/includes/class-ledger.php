<?php
/**
 * The money ledger: every online payment is split into the business's earning and
 * Explore Katsina's commission. Earnings stay "on hold" until their release date
 * (3 days after check-out / the event / a completed reservation or order), then an hourly
 * job makes them "available" for payout, unless the guest has reported a problem.
 *
 * Entry types: earning (+), commission (−), refund (−), payout (−, when we transfer money),
 * invoice (−, a commission invoice paid from the balance), adjustment (±).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Ledger {

	const RELEASE_DAYS = 3;

	private static function add( $business_id, $booking_id, $type, $amount, $status, $note, $release_at = null ) {
		global $wpdb;
		$wpdb->insert(
			$wpdb->prefix . 'ek_ledger',
			array(
				'business_id' => (int) $business_id,
				'booking_id'  => (int) $booking_id,
				'entry_type'  => $type,
				'amount_kobo' => (int) $amount,
				'status'      => $status,
				'release_at'  => $release_at,
				'note'        => mb_substr( $note, 0, 250 ),
				'created_at'  => current_time( 'mysql', true ),
			)
		);
	}

	/** Online payment received: add the earning and deduct commission (never more than was paid). */
	public static function record_payment( $b, $amount_kobo, $reference ) {
		global $wpdb;
		$already = -1 * (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d AND entry_type = 'commission'", $b->id ) );
		$due     = max( 0, (int) $b->commission_kobo - $already );
		$take    = min( $due, (int) $amount_kobo );
		/* translators: 1: booking code, 2: payment reference */
		self::add( $b->business_id, $b->id, 'earning', (int) $amount_kobo, 'on_hold', sprintf( __( 'Booking %1$s · payment %2$s', 'explore-katsina' ), $b->code, $reference ) );
		if ( $take > 0 ) {
			/* translators: 1: booking code, 2: rate */
			self::add( $b->business_id, $b->id, 'commission', -$take, 'on_hold', sprintf( __( 'Booking %1$s · %2$s commission', 'explore-katsina' ), $b->code, Commission::percent( $b->commission_rate_bp ) ) );
		}
	}

	/** After check-out (or the event date), money becomes available 3 days later if there's no complaint. */
	public static function start_release_clock( $b ) {
		global $wpdb;
		$at = gmdate( 'Y-m-d H:i:s', time() + self::RELEASE_DAYS * DAY_IN_SECONDS );
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_ledger SET release_at = %s WHERE booking_id = %d AND status = 'on_hold'", $at, $b->id ) );
	}

	/** Release held money 3 days after a given (local) date, e.g. the last event day. */
	public static function release_after( $b, $date ) {
		global $wpdb;
		$at = ( new \DateTimeImmutable( $date . ' 23:59:59', Availability::tz() ) )->modify( '+' . self::RELEASE_DAYS . ' days' )->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_ledger SET release_at = %s WHERE booking_id = %d AND status = 'on_hold'", $at, $b->id ) );
	}

	/** A paid booking was declined/cancelled/no-show: freeze its money until the refund is decided (Phase 6). */
	public static function freeze_for_refund( $b, $why ) {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_ledger SET status = 'frozen', release_at = NULL WHERE booking_id = %d AND status = 'on_hold'", $b->id ) );
		Log::add( 'refund_review', 'booking', $b->id, $why );
		Emails::refund_review( $b, $why );
	}

	/**
	 * Make held money available once its release date has passed (skipping bookings with an
	 * open complaint). Emails each business how much became available.
	 *
	 * @return array<int,int> business_id => amount released (kobo).
	 */
	public static function release_due( $now = null ) {
		global $wpdb;
		$now = $now ?? current_time( 'mysql', true );
		$t   = $wpdb->prefix . 'ek_ledger';
		$c   = $wpdb->prefix . 'ek_complaints';
		if ( ! $wpdb->get_var( "SELECT GET_LOCK('ek_release', 10)" ) ) {
			return array();
		}
		try {
			$where = $wpdb->prepare( "status = 'on_hold' AND release_at IS NOT NULL AND release_at <= %s AND booking_id NOT IN (SELECT booking_id FROM {$c} WHERE status = 'open')", $now ); // phpcs:ignore
			$rows  = $wpdb->get_results( "SELECT business_id, SUM(amount_kobo) AS amt FROM {$t} WHERE {$where} GROUP BY business_id" ); // phpcs:ignore
			$wpdb->query( "UPDATE {$t} SET status = 'available' WHERE {$where}" ); // phpcs:ignore
		} finally {
			$wpdb->query( "SELECT RELEASE_LOCK('ek_release')" );
		}
		$out = array();
		foreach ( $rows as $r ) {
			$out[ (int) $r->business_id ] = (int) $r->amt;
			if ( (int) $r->amt > 0 ) {
				Emails_Money::funds_released( (int) $r->business_id, (int) $r->amt );
			}
		}
		return $out;
	}

	/** A money line that isn't tied to a booking (payouts, invoices paid from the balance). */
	public static function add_line( $business_id, $type, $amount, $status, $note ) {
		self::add( $business_id, 0, $type, $amount, $status, $note );
	}
}
