<?php
/**
 * "Report a problem": while a business's money for a booking is still on hold, the guest can
 * report a problem. That freezes the money (no payout) until the site admin decides:
 * release it to the business, or refund the guest some or all of what they paid online.
 *
 * Window: during a hotel stay, and until the business's money is released (3 days after
 * check-out / the event / the reservation); for bookings paid at the venue, 3 days after the date.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Complaints {

	const WINDOW_DAYS = 3;

	/** Statuses where something happened that the guest might complain about. */
	const STATUSES = array(
		'hotel'      => array( 'checked_in', 'checked_out', 'no_show' ),
		'event'      => array( 'deposit_paid', 'completed' ),
		'restaurant' => array( 'completed', 'no_show' ),
		'order'      => array( 'completed' ),
	);

	public static function get( $id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_complaints WHERE id = %d", $id ) );
	}

	public static function for_booking( $booking_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_complaints WHERE booking_id = %d ORDER BY id DESC LIMIT 1", $booking_id ) );
	}

	public static function open_list( $limit = 100 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_complaints WHERE status = 'open' ORDER BY id ASC LIMIT %d", $limit ) );
	}

	public static function recent( $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_complaints WHERE status <> 'open' ORDER BY id DESC LIMIT %d", $limit ) );
	}

	/**
	 * Last moment a problem can be reported (Unix time).
	 * Paid online: until the business's money is released (3 days after check-out / the event /
	 * the completed reservation), so a complaint always comes before the money leaves.
	 * Nothing paid online: until 3 days after the last date of the booking.
	 */
	public static function deadline( $b ) {
		global $wpdb;
		$end     = $b->end_date ? $b->end_date : $b->start_date;
		$by_date = ( new \DateTimeImmutable( $end . ' 23:59:59', Availability::tz() ) )->modify( '+' . self::WINDOW_DAYS . ' days' )->getTimestamp();
		if ( (int) $b->paid_kobo <= 0 ) {
			return $by_date;
		}
		$held = $wpdb->get_row( $wpdb->prepare( "SELECT COUNT(*) n, MIN(release_at) first_release, SUM(release_at IS NULL) unscheduled FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d AND status IN ('on_hold','frozen')", $b->id ) );
		if ( ! (int) $held->n ) {
			return 0; // Money already released: too late to report through us.
		}
		if ( (int) $held->unscheduled || ! $held->first_release ) {
			return $by_date; // Stay still in progress (release clock not started yet).
		}
		return strtotime( $held->first_release . ' UTC' );
	}

	/** @return true|\WP_Error */
	public static function can_report( $b, $now = null ) {
		$now = $now ?? time();
		if ( ! in_array( $b->status, self::STATUSES[ $b->kind ] ?? array(), true ) ) {
			return new \WP_Error( 'status', __( 'You can report a problem once your stay, meal or event has started.', 'explore-katsina' ) );
		}
		if ( 'event' === $b->kind && $now < ( new \DateTimeImmutable( $b->start_date, Availability::tz() ) )->getTimestamp() ) {
			return new \WP_Error( 'early', __( 'You can report a problem once your event has started.', 'explore-katsina' ) );
		}
		if ( $now > self::deadline( $b ) ) {
			return new \WP_Error( 'late', __( 'Problems must be reported within 3 days. Please contact us directly.', 'explore-katsina' ) );
		}
		$last = self::for_booking( $b->id );
		if ( $last ) {
			return new \WP_Error( 'exists', __( 'You have already reported a problem with this booking.', 'explore-katsina' ) );
		}
		return true;
	}

	/** @return int|\WP_Error Complaint id. */
	public static function report( $b, $message, $now = null ) {
		global $wpdb;
		$ok = self::can_report( $b, $now );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$message = trim( mb_substr( sanitize_textarea_field( (string) $message ), 0, 3000 ) );
		if ( mb_strlen( $message ) < 20 ) {
			return new \WP_Error( 'message', __( 'Please describe what went wrong (at least 20 characters).', 'explore-katsina' ) );
		}
		$wpdb->insert(
			$wpdb->prefix . 'ek_complaints',
			array(
				'booking_id'  => (int) $b->id,
				'business_id' => (int) $b->business_id,
				'message'     => $message,
				'status'      => 'open',
				'created_at'  => current_time( 'mysql', true ),
			)
		);
		$id = (int) $wpdb->insert_id;
		// Freeze the business's money for this booking until the admin decides.
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_ledger SET status = 'frozen' WHERE booking_id = %d AND status = 'on_hold'", $b->id ) );
		Log::add( 'complaint_opened', 'booking', $b->id, $message, array( 'complaint_id' => $id ) );
		Emails_Money::complaint_opened( $b, $message );
		return $id;
	}

	/** Online money not yet refunded for this booking. */
	public static function refundable( $b ) {
		$done = 0;
		foreach ( Refunds::for_booking( $b->id ) as $r ) {
			$done += (int) $r->amount_kobo;
		}
		return max( 0, (int) $b->paid_kobo - $done );
	}

	/**
	 * Admin decision. $outcome: 'release' (business keeps the money) or 'refund' (guest gets
	 * $refund_kobo back; the business keeps the rest minus commission on it).
	 *
	 * @return true|\WP_Error
	 */
	public static function resolve( $id, $outcome, $refund_kobo, $note, $admin_id ) {
		global $wpdb;
		$c = self::get( $id );
		if ( ! $c || 'open' !== $c->status ) {
			return new \WP_Error( 'closed', __( 'This complaint is already resolved.', 'explore-katsina' ) );
		}
		$b = Booking::get( $c->booking_id );
		if ( ! $b ) {
			return new \WP_Error( 'missing', __( 'Booking not found.', 'explore-katsina' ) );
		}
		$note   = trim( sanitize_textarea_field( (string) $note ) );
		$refund = 0;
		if ( 'refund' === $outcome ) {
			$refund = (int) $refund_kobo;
			$max    = self::refundable( $b );
			if ( $refund < 1 || $refund > $max ) {
				/* translators: %s: amount */
				return new \WP_Error( 'amount', sprintf( __( 'Enter a refund between ₦1 and %s (what the guest paid online and has not had back).', 'explore-katsina' ), Money::format( $max ) ) );
			}
			/* translators: %s: note */
			Refunds::issue( $b, $refund, sprintf( __( 'Complaint: %s', 'explore-katsina' ), $note ? $note : __( 'refund agreed', 'explore-katsina' ) ) );
		} elseif ( 'release' !== $outcome ) {
			return new \WP_Error( 'outcome', __( 'Choose release or refund.', 'explore-katsina' ) );
		}
		$wpdb->update(
			$wpdb->prefix . 'ek_complaints',
			array(
				'status'          => 'resolved',
				'resolution'      => $outcome,
				'resolution_note' => $note,
				'refund_kobo'     => $refund,
				'resolved_at'     => current_time( 'mysql', true ),
				'resolved_by'     => (int) $admin_id,
			),
			array( 'id' => (int) $id )
		);
		// Unfreeze. A stay still in progress waits for check-out as usual; otherwise the
		// business's remaining share is released straight away (the 3-day wait was for this).
		$t = $wpdb->prefix . 'ek_ledger';
		if ( 'checked_in' === $b->status ) {
			$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET status = 'on_hold', release_at = NULL WHERE booking_id = %d AND status IN ('on_hold','frozen')", $b->id ) );
		} else {
			$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET status = 'on_hold', release_at = %s WHERE booking_id = %d AND status IN ('on_hold','frozen')", current_time( 'mysql', true ), $b->id ) );
			Ledger::release_due();
		}
		Log::add( 'complaint_resolved', 'booking', $b->id, $note, array( 'complaint_id' => (int) $id, 'outcome' => $outcome, 'refund_kobo' => $refund ) );
		Emails_Money::complaint_resolved( Booking::get( $b->id ), self::get( $id ) );
		return true;
	}
}
