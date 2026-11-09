<?php
/**
 * Cancellations by guests and refunds.
 *
 * How much is refunded (of what was paid online) — from the policy saved on the booking:
 *  - Flexible:       full refund until 24 hours before; after that, everything except the first night/day.
 *  - Moderate:       full refund until 5 days before; after that, 50%.
 *  - Strict:         50% until 7 days before; after that, nothing.
 *  - Non-refundable: nothing.
 *  - Restaurant deposits: full refund until 24 hours before the reservation; after that, nothing.
 *  - Food orders: can be cancelled (full refund) only before the restaurant accepts them.
 *  - If the BUSINESS declines or cancels a paid booking, the guest always gets everything back.
 *
 * Refunds are sent back through the payment gateway automatically when it supports it;
 * otherwise they wait in wp-admin → Explore Katsina → Refunds for the admin to pay by transfer.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Refunds {

	/** When the booking starts (Unix time, Lagos). */
	public static function starts_at( $b ) {
		$tz   = Availability::tz();
		$time = '00:00';
		if ( 'hotel' === $b->kind ) {
			$time = $b->details['checkin_at'] ?? '14:00';
		} elseif ( 'restaurant' === $b->kind ) {
			$time = substr( (string) $b->start_time, 0, 5 );
		}
		return ( new \DateTimeImmutable( $b->start_date . ' ' . $time, $tz ) )->getTimestamp();
	}

	/** @return true|\WP_Error Can the guest cancel this booking online now? */
	public static function can_cancel( $b, $now = null ) {
		$now     = $now ?? time();
		$allowed = array(
			'hotel'      => array( 'pending_payment', 'new', 'confirmed' ),
			'restaurant' => array( 'pending_payment', 'new', 'confirmed' ),
			'event'      => array( 'pending_payment', 'requested', 'confirmed', 'deposit_paid' ),
			'order'      => array( 'pending_payment', 'new' ),
		);
		if ( ! in_array( $b->status, $allowed[ $b->kind ] ?? array(), true ) ) {
			return new \WP_Error( 'status', 'order' === $b->kind ? __( 'The restaurant has already accepted this order. Please call them to cancel.', 'explore-katsina' ) : __( 'This booking can no longer be cancelled online. Please contact the business.', 'explore-katsina' ) );
		}
		if ( 'order' !== $b->kind && $now >= self::starts_at( $b ) ) {
			return new \WP_Error( 'started', __( 'This booking has already started. Please contact the business.', 'explore-katsina' ) );
		}
		return true;
	}

	/**
	 * How much of the online payment the guest gets back if they cancel now.
	 *
	 * @return array{refund:int, keep:int, rule:string}
	 */
	public static function quote( $b, $now = null ) {
		$now   = $now ?? time();
		$paid  = (int) $b->paid_kobo;
		$hours = ( self::starts_at( $b ) - $now ) / HOUR_IN_SECONDS;
		$out   = static fn( $refund, $rule ) => array( 'refund' => max( 0, min( $paid, (int) $refund ) ), 'keep' => $paid - max( 0, min( $paid, (int) $refund ) ), 'rule' => $rule );

		if ( 0 === $paid ) {
			return $out( 0, __( 'Nothing was paid online, so there is nothing to refund.', 'explore-katsina' ) );
		}
		if ( 'order' === $b->kind ) {
			return $out( $paid, __( 'Orders cancelled before the restaurant accepts them are refunded in full.', 'explore-katsina' ) );
		}
		if ( 'restaurant' === $b->kind ) {
			return $hours >= 24
				? $out( $paid, __( 'Cancelled at least 24 hours before: full deposit refund.', 'explore-katsina' ) )
				: $out( 0, __( 'Cancelled less than 24 hours before: the deposit is not refunded.', 'explore-katsina' ) );
		}
		$key = $b->policy['key'] ?? 'moderate';
		switch ( $key ) {
			case 'flexible':
				if ( $hours >= 24 ) {
					return $out( $paid, __( 'Flexible policy, cancelled at least 24 hours before: full refund.', 'explore-katsina' ) );
				}
				$lines = array_values( (array) ( $b->details['nights'] ?? ( $b->details['days'] ?? array( 0 ) ) ) );
				$first = (int) ( $lines[0] ?? 0 ) * max( 1, (int) $b->quantity );
				return $out( $paid - $first, __( 'Flexible policy, less than 24 hours before: everything except the first night is refunded.', 'explore-katsina' ) );
			case 'moderate':
				return $hours >= 120
					? $out( $paid, __( 'Moderate policy, cancelled at least 5 days before: full refund.', 'explore-katsina' ) )
					: $out( (int) round( $paid / 2 ), __( 'Moderate policy, less than 5 days before: 50% refund.', 'explore-katsina' ) );
			case 'strict':
				return $hours >= 168
					? $out( (int) round( $paid / 2 ), __( 'Strict policy, cancelled at least 7 days before: 50% refund.', 'explore-katsina' ) )
					: $out( 0, __( 'Strict policy, less than 7 days before: no refund.', 'explore-katsina' ) );
			default:
				return $out( 0, __( 'Non-refundable booking: no refund.', 'explore-katsina' ) );
		}
	}

	/**
	 * Guest cancels. @return array|\WP_Error The refund quote applied.
	 */
	public static function guest_cancel( $b, $actor_id = 0, $now = null ) {
		$ok = self::can_cancel( $b, $now );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$q = self::quote( $b, $now );
		Booking::set_status( $b, 'cancelled', $actor_id, 'cancelled by guest', $q['refund'] );
		Emails::guest_cancelled( Booking::get( $b->id ), $q );
		return $q;
	}

	/**
	 * Record a refund, adjust the money ledger, and try to pay it back automatically.
	 * $retain_release: when the business's remaining share (if any) becomes available.
	 */
	public static function issue( $b, $amount_kobo, $reason ) {
		global $wpdb;
		$amount_kobo = max( 0, min( (int) $b->paid_kobo, (int) $amount_kobo ) );
		self::adjust_ledger( $b, $amount_kobo );
		if ( ! $amount_kobo ) {
			return 0;
		}
		$wpdb->insert(
			$wpdb->prefix . 'ek_refunds',
			array(
				'booking_id'  => $b->id,
				'business_id' => $b->business_id,
				'amount_kobo' => $amount_kobo,
				'reason'      => mb_substr( $reason, 0, 250 ),
				'status'      => 'pending',
				'created_at'  => current_time( 'mysql', true ),
			)
		);
		$id = (int) $wpdb->insert_id;
		Log::add( 'refund_created', 'booking', $b->id, $reason, array( 'refund_id' => $id, 'amount_kobo' => $amount_kobo ) );
		self::try_automatic( $id );
		return $id;
	}

	/**
	 * The ledger after a refund: the business keeps (paid − refund) minus commission on that.
	 */
	private static function adjust_ledger( $b, $refund ) {
		global $wpdb;
		$t = $wpdb->prefix . 'ek_ledger';
		$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET status = 'on_hold' WHERE booking_id = %d AND status = 'frozen'", $b->id ) );
		$paid        = (int) $b->paid_kobo;
		$retained    = $paid - $refund;
		$charged     = -1 * (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$t} WHERE booking_id = %d AND entry_type = 'commission'", $b->id ) );
		$should_be   = min( $retained, (int) round( $retained * (int) $b->commission_rate_bp / 10000 ) );
		$now         = current_time( 'mysql', true );
		$release     = gmdate( 'Y-m-d H:i:s', time() + Ledger::RELEASE_DAYS * DAY_IN_SECONDS );
		if ( $refund > 0 ) {
			/* translators: %s: booking code */
			$wpdb->insert( $t, array( 'business_id' => $b->business_id, 'booking_id' => $b->id, 'entry_type' => 'refund', 'amount_kobo' => -$refund, 'status' => 'on_hold', 'note' => sprintf( __( 'Refund to guest · %s', 'explore-katsina' ), $b->code ), 'created_at' => $now ) );
		}
		if ( $charged !== $should_be && $paid > 0 ) {
			/* translators: %s: booking code */
			$wpdb->insert( $t, array( 'business_id' => $b->business_id, 'booking_id' => $b->id, 'entry_type' => 'commission', 'amount_kobo' => $charged - $should_be, 'status' => 'on_hold', 'note' => sprintf( __( 'Commission adjusted after cancellation · %s', 'explore-katsina' ), $b->code ), 'created_at' => $now ) );
		}
		// Nothing more is coming for this booking: whatever the business keeps is released in 3 days.
		$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET release_at = %s WHERE booking_id = %d AND status = 'on_hold'", $release, $b->id ) );
	}

	/** Pay back through WooCommerce (Paystack/Flutterwave) or mark test refunds done. */
	public static function try_automatic( $refund_id ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_refunds WHERE id = %d", $refund_id ) );
		if ( ! $r || 'pending' !== $r->status ) {
			return false;
		}
		$b = Booking::get( $r->booking_id );
		if ( $b && $b->order_id && Payments::woo_active() && function_exists( 'wc_create_refund' ) ) {
			$res = wc_create_refund(
				array(
					'amount'         => $r->amount_kobo / 100,
					'reason'         => $r->reason,
					'order_id'       => (int) $b->order_id,
					'refund_payment' => true,
				)
			);
			if ( ! is_wp_error( $res ) ) {
				self::mark_done( $refund_id, 'gateway', 'wc-refund-' . $res->get_id(), 0 );
				return true;
			}
			Log::add( 'refund_gateway_failed', 'booking', $b->id, $res->get_error_message() );
		} elseif ( $b && ! $b->order_id && Payments::test_mode_allowed() ) {
			self::mark_done( $refund_id, 'test', 'TEST-REFUND', 0 );
			return true;
		}
		$wpdb->update( $wpdb->prefix . 'ek_refunds', array( 'method' => 'manual' ), array( 'id' => $refund_id ) );
		Emails::refund_needed( $b, (int) $r->amount_kobo, $r->reason );
		return false;
	}

	public static function mark_done( $refund_id, $method, $reference, $user_id ) {
		global $wpdb;
		$wpdb->update(
			$wpdb->prefix . 'ek_refunds',
			array(
				'status'       => 'refunded',
				'method'       => $method,
				'reference'    => mb_substr( (string) $reference, 0, 120 ),
				'processed_at' => current_time( 'mysql', true ),
				'processed_by' => (int) $user_id,
			),
			array( 'id' => (int) $refund_id )
		);
		$r = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_refunds WHERE id = %d", $refund_id ) );
		$b = Booking::get( $r->booking_id );
		Log::add( 'refund_paid', 'booking', $r->booking_id, $method . ' ' . $reference, array( 'amount_kobo' => (int) $r->amount_kobo ) );
		if ( $b ) {
			Emails::refund_paid( $b, (int) $r->amount_kobo );
		}
	}

	public static function for_booking( $booking_id ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_refunds WHERE booking_id = %d ORDER BY id", $booking_id ) );
	}

	public static function pending( $limit = 100 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_refunds WHERE status = 'pending' ORDER BY id ASC LIMIT %d", $limit ) );
	}

	public static function recent( $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_refunds WHERE status <> 'pending' ORDER BY id DESC LIMIT %d", $limit ) );
	}
}
