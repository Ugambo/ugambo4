<?php
/**
 * Booking engine (hotels now; event centres, restaurants and tours reuse it later).
 *
 * Hotel booking statuses:
 *   pending_payment → (paid) → new → confirmed → checked_in → checked_out
 *   new → declined | cancelled          confirmed → cancelled | no_show
 *   pending_payment → expired (unpaid after 15 minutes) | cancelled
 *   payment_conflict: money arrived after the hold expired and the room was gone (admin refunds)
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Booking {

	const HOLD_MINUTES = 15;
	const CRON_HOOK    = 'ek_expire_holds';

	/** Statuses that occupy rooms in the calendar. */
	const OCCUPYING = array( 'pending_payment', 'new', 'confirmed', 'checked_in' );

	public static function init() {
		add_filter( 'cron_schedules', array( __CLASS__, 'cron_schedule' ) );
		add_action( 'init', array( __CLASS__, 'schedule' ) );
		add_action( self::CRON_HOOK, array( __CLASS__, 'expire_holds' ) );
	}

	public static function cron_schedule( $s ) {
		$s['ek_five_minutes'] = array(
			'interval' => 300,
			'display'  => 'Every 5 minutes',
		);
		return $s;
	}

	public static function schedule() {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time() + 60, 'ek_five_minutes', self::CRON_HOOK );
		}
	}

	public static function statuses() {
		return array(
			'pending_payment'  => __( 'Awaiting payment', 'explore-katsina' ),
			'new'              => __( 'New', 'explore-katsina' ),
			'confirmed'        => __( 'Confirmed', 'explore-katsina' ),
			'checked_in'       => __( 'Checked in', 'explore-katsina' ),
			'checked_out'      => __( 'Checked out', 'explore-katsina' ),
			'cancelled'        => __( 'Cancelled', 'explore-katsina' ),
			'declined'         => __( 'Declined', 'explore-katsina' ),
			'no_show'          => __( 'No-show', 'explore-katsina' ),
			'expired'          => __( 'Expired (not paid)', 'explore-katsina' ),
			'payment_conflict' => __( 'Payment issue', 'explore-katsina' ),
		);
	}

	/** What the hotel may do from each status. */
	public static function hotel_actions( $status ) {
		$map = array(
			'new'        => array( 'confirmed' => __( 'Confirm', 'explore-katsina' ), 'declined' => __( 'Decline', 'explore-katsina' ) ),
			'confirmed'  => array( 'checked_in' => __( 'Mark checked in', 'explore-katsina' ), 'no_show' => __( 'Mark no-show', 'explore-katsina' ), 'cancelled' => __( 'Cancel booking', 'explore-katsina' ) ),
			'checked_in' => array( 'checked_out' => __( 'Mark checked out', 'explore-katsina' ) ),
		);
		return $map[ $status ] ?? array();
	}

	/* ------------------------------------------------------------------ */
	/* Reading                                                              */
	/* ------------------------------------------------------------------ */

	public static function get( $id ) {
		global $wpdb;
		$b = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_bookings WHERE id = %d", $id ) );
		return $b ? self::hydrate( $b ) : null;
	}

	public static function by_code( $code, $key = null ) {
		global $wpdb;
		$b = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_bookings WHERE code = %s", strtoupper( (string) $code ) ) );
		if ( ! $b ) {
			return null;
		}
		if ( null !== $key && ! hash_equals( (string) $b->access_key, (string) $key ) ) {
			return null;
		}
		return self::hydrate( $b );
	}

	private static function hydrate( $b ) {
		$b->details = $b->details ? json_decode( $b->details, true ) : array();
		$b->policy  = $b->policy_snapshot ? json_decode( $b->policy_snapshot, true ) : array();
		return $b;
	}

	public static function link( $b ) {
		return add_query_arg( array( 'booking' => $b->code, 'key' => $b->access_key ), Install::page_url( 'book' ) );
	}

	public static function nights_of( $b ) {
		return Availability::nights( $b->start_date, $b->end_date );
	}

	/* ------------------------------------------------------------------ */
	/* Creating a hotel booking                                             */
	/* ------------------------------------------------------------------ */

	private static function new_code() {
		global $wpdb;
		$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No 0/O or 1/I.
		do {
			$code = 'EK-';
			for ( $i = 0; $i < 6; $i++ ) {
				$code .= $alphabet[ random_int( 0, strlen( $alphabet ) - 1 ) ];
			}
		} while ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE code = %s", $code ) ) );
		return $code;
	}

	/**
	 * @param array $a room_id, checkin, checkout, guests, rooms, payment (full|deposit|venue),
	 *                 name, email, phone, notes, customer_id
	 * @return object|\WP_Error Booking.
	 */
	public static function create_hotel( array $a ) {
		global $wpdb;
		self::expire_holds();

		$room = Rooms::data( $a['room_id'] ?? 0 );
		if ( ! $room || ! $room['active'] ) {
			return new \WP_Error( 'room', __( 'This room is no longer available.', 'explore-katsina' ) );
		}
		$hotel = Business::get( $room['hotel_id'] );
		if ( ! $hotel || 'publish' !== $hotel->post_status || 'hotel' !== Business::type_of( $hotel->ID ) ) {
			return new \WP_Error( 'hotel', __( 'This hotel is not taking bookings right now.', 'explore-katsina' ) );
		}
		$dates = Availability::check_dates( $a['checkin'] ?? '', $a['checkout'] ?? '' );
		if ( is_wp_error( $dates ) ) {
			return $dates;
		}
		$qty    = max( 1, min( 20, (int) ( $a['rooms'] ?? 1 ) ) );
		$guests = max( 1, (int) ( $a['guests'] ?? 1 ) );
		if ( $guests > $qty * $room['max_guests'] ) {
			/* translators: 1: guests per room, 2: rooms */
			return new \WP_Error( 'guests', sprintf( __( 'This room takes up to %1$d guests. Choose %2$d or more rooms, or another room type.', 'explore-katsina' ), $room['max_guests'], (int) ceil( $guests / $room['max_guests'] ) ) );
		}
		$name  = sanitize_text_field( $a['name'] ?? '' );
		$email = sanitize_email( $a['email'] ?? '' );
		$phone = Business::normalize_phone( $a['phone'] ?? '' );
		if ( mb_strlen( $name ) < 2 ) {
			return new \WP_Error( 'name', __( 'Enter the guest name.', 'explore-katsina' ) );
		}
		if ( ! is_email( $email ) ) {
			return new \WP_Error( 'email', __( 'Enter a valid email address. Your booking confirmation is sent there.', 'explore-katsina' ) );
		}
		if ( ! $phone ) {
			return new \WP_Error( 'phone', __( 'Enter a Nigerian phone number the hotel can reach you on.', 'explore-katsina' ) );
		}

		Availability::forget( $room['id'] );
		$quote   = Availability::quote( $room, $a['checkin'], $a['checkout'], $qty );
		$choices = Hotel::payment_choices( $hotel->ID, $quote['total'] );
		$pay     = sanitize_key( $a['payment'] ?? '' );
		if ( ! isset( $choices[ $pay ] ) ) {
			return new \WP_Error( 'payment', __( 'Choose how you would like to pay.', 'explore-katsina' ) );
		}
		if ( 'venue' !== $pay && ! Payments::online_available() ) {
			return new \WP_Error( 'payment', __( 'Online payment is not available right now. Please choose "Pay at the hotel".', 'explore-katsina' ) );
		}

		$settings = Hotel::settings( $hotel->ID );
		$policy   = Hotel::policies()[ $settings['policy'] ];
		$rate_bp  = Commission::rate_bp( $hotel->ID, 'hotel' );
		$nights   = Availability::nights( $a['checkin'], $a['checkout'] );
		$now      = current_time( 'mysql', true );
		$status   = 'venue' === $pay ? 'new' : 'pending_payment';

		Availability::ensure_rows( $room['id'], $nights );
		// If the database reports a lock conflict, try again (up to 3 times) before giving up.
		for ( $attempt = 1; $attempt <= 3; $attempt++ ) {
			$wpdb->query( 'START TRANSACTION' );
			$taken = Availability::take( $room, $nights, $qty );
			if ( ! is_wp_error( $taken ) ) {
				break;
			}
			$wpdb->query( 'ROLLBACK' );
			if ( 'lock' !== $taken->get_error_code() || 3 === $attempt ) {
				return $taken;
			}
			usleep( random_int( 50000, 200000 ) );
		}
		// Re-price inside the lock so the guest pays exactly what is current.
		Availability::forget( $room['id'] );
		$quote = Availability::quote( array_merge( $room, array( 'units' => PHP_INT_MAX ) ), $a['checkin'], $a['checkout'], $qty );
		$total = (int) $quote['total'];
		$now_amount = Hotel::payment_choices( $hotel->ID, $total )[ $pay ]['now'];

		$row = array(
			'code'               => self::new_code(),
			'kind'               => 'hotel',
			'business_id'        => $hotel->ID,
			'item_id'            => $room['id'],
			'customer_id'        => (int) ( $a['customer_id'] ?? 0 ),
			'customer_name'      => $name,
			'customer_email'     => $email,
			'customer_phone'     => $phone,
			'start_date'         => $a['checkin'],
			'end_date'           => $a['checkout'],
			'guests'             => $guests,
			'quantity'           => $qty,
			'total_kobo'         => $total,
			'deposit_kobo'       => 'deposit' === $pay ? $now_amount : 0,
			'paid_kobo'          => 0,
			'commission_rate_bp' => $rate_bp,
			'commission_kobo'    => (int) round( $total * $rate_bp / 10000 ),
			'payment_mode'       => $pay,
			'status'             => $status,
			'access_key'         => bin2hex( random_bytes( 16 ) ),
			'hold_expires'       => 'pending_payment' === $status ? gmdate( 'Y-m-d H:i:s', time() + self::HOLD_MINUTES * 60 ) : null,
			'details'            => wp_json_encode(
				array(
					'hotel'      => $hotel->post_title,
					'room'       => $room['name'],
					'nights'     => $quote['nights'],
					'per_room'   => $quote['per_room'],
					'pay_now'    => $now_amount,
					'pay_later'  => $total - $now_amount,
					'checkin_at' => $settings['checkin'],
					'checkout_at'=> $settings['checkout'],
				)
			),
			'policy_snapshot'    => wp_json_encode( array_merge( array( 'key' => $settings['policy'] ), $policy, array( 'note' => $settings['policy_note'] ) ) ),
			'notes'              => sanitize_textarea_field( $a['notes'] ?? '' ),
			'created_at'         => $now,
			'updated_at'         => $now,
		);
		if ( false === $wpdb->insert( $wpdb->prefix . 'ek_bookings', $row ) ) {
			$wpdb->query( 'ROLLBACK' );
			return new \WP_Error( 'db', __( 'The booking could not be saved. Please try again.', 'explore-katsina' ) );
		}
		$id = (int) $wpdb->insert_id;
		$wpdb->query( 'COMMIT' );

		self::history( $id, '', $status, 0 );
		$b = self::get( $id );
		if ( 'new' === $status ) {
			Emails::booking_created( $b );
		}
		return $b;
	}

	/* ------------------------------------------------------------------ */
	/* Payments                                                             */
	/* ------------------------------------------------------------------ */

	/**
	 * Money received for a booking (from Paystack/Flutterwave via WooCommerce, or the local test gateway).
	 * Safe to call twice for the same reference.
	 */
	public static function mark_paid( $booking_id, $amount_kobo, $reference ) {
		global $wpdb;
		$b = self::get( $booking_id );
		if ( ! $b ) {
			return new \WP_Error( 'missing', 'Booking not found' );
		}
		$refs = (array) ( $b->details['payments'] ?? array() );
		if ( isset( $refs[ $reference ] ) ) {
			return $b; // Already applied.
		}

		$new_status = $b->status;
		if ( 'pending_payment' === $b->status ) {
			$new_status = 'new';
		} elseif ( in_array( $b->status, array( 'expired', 'cancelled' ), true ) ) {
			// The hold ran out before the money arrived: try to take the rooms again.
			$room = Rooms::data( $b->item_id );
			if ( $room ) {
				Availability::ensure_rows( $room['id'], self::nights_of( $b ) );
			}
			$wpdb->query( 'START TRANSACTION' );
			$taken = $room ? Availability::take( $room, self::nights_of( $b ), (int) $b->quantity ) : new \WP_Error( 'room', 'Room missing' );
			if ( is_wp_error( $taken ) ) {
				$wpdb->query( 'ROLLBACK' );
				$new_status = 'payment_conflict';
			} else {
				$wpdb->query( 'COMMIT' );
				$new_status = 'new';
			}
		}

		$details             = $b->details;
		$details['payments'] = $refs + array( $reference => array( 'amount' => (int) $amount_kobo, 'at' => current_time( 'mysql', true ) ) );
		$wpdb->update(
			$wpdb->prefix . 'ek_bookings',
			array(
				'paid_kobo'    => (int) $b->paid_kobo + (int) $amount_kobo,
				'status'       => $new_status,
				'hold_expires' => null,
				'details'      => wp_json_encode( $details ),
				'updated_at'   => current_time( 'mysql', true ),
			),
			array( 'id' => $b->id )
		);
		self::history( $b->id, $b->status, $new_status, 0, 'payment ' . $reference );

		$b = self::get( $b->id );
		if ( 'payment_conflict' === $new_status ) {
			Emails::payment_conflict( $b );
			return $b;
		}
		Ledger::record_payment( $b, (int) $amount_kobo, $reference );
		Emails::booking_created( $b );
		return $b;
	}

	/** Payment failed or was abandoned: free the rooms straight away. */
	public static function payment_failed( $booking_id ) {
		$b = self::get( $booking_id );
		if ( $b && 'pending_payment' === $b->status ) {
			self::set_status( $b, 'cancelled', 0, 'payment failed' );
		}
	}

	/** Free rooms held by unpaid bookings older than 15 minutes. */
	public static function expire_holds() {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE status = 'pending_payment' AND hold_expires < %s LIMIT 200", current_time( 'mysql', true ) ) );
		foreach ( $ids as $id ) {
			$b = self::get( $id );
			if ( $b && 'pending_payment' === $b->status ) {
				self::set_status( $b, 'expired', 0, 'hold expired' );
			}
		}
		return count( $ids );
	}

	/* ------------------------------------------------------------------ */
	/* Status changes                                                       */
	/* ------------------------------------------------------------------ */

	/**
	 * Status change requested by the hotel (already ownership-checked by the caller).
	 *
	 * @return true|\WP_Error
	 */
	public static function hotel_transition( $b, $to, $actor_id, $note = '' ) {
		$allowed = self::hotel_actions( $b->status );
		if ( ! isset( $allowed[ $to ] ) ) {
			return new \WP_Error( 'transition', __( 'That change is not possible for this booking now.', 'explore-katsina' ) );
		}
		$today = Availability::today();
		if ( in_array( $to, array( 'checked_in', 'no_show' ), true ) && $today < $b->start_date ) {
			return new \WP_Error( 'early', __( 'You can only do this on or after the check-in date.', 'explore-katsina' ) );
		}
		self::set_status( $b, $to, $actor_id, $note );
		return true;
	}

	public static function set_status( $b, $to, $actor_id = 0, $note = '' ) {
		global $wpdb;
		$from = $b->status;
		if ( $from === $to ) {
			return;
		}
		$wpdb->update(
			$wpdb->prefix . 'ek_bookings',
			array(
				'status'       => $to,
				'hold_expires' => null,
				'updated_at'   => current_time( 'mysql', true ),
			),
			array( 'id' => $b->id )
		);
		self::history( $b->id, $from, $to, $actor_id, $note );

		$was_occupying = in_array( $from, self::OCCUPYING, true );
		$now_occupying = in_array( $to, self::OCCUPYING, true ) || 'checked_out' === $to;
		if ( 'hotel' === $b->kind && $was_occupying && ! $now_occupying ) {
			// Cancelled / declined / expired / no-show: give back all nights that haven't passed.
			Availability::give_back( $b->item_id, self::nights_of( $b ), (int) $b->quantity, 'no_show' === $to ? Availability::today() : '' );
		}
		if ( 'hotel' === $b->kind && 'checked_out' === $to ) {
			// Early check-out frees the remaining nights. Earnings start their 3-day wait.
			$tomorrow = ( new \DateTimeImmutable( 'now', Availability::tz() ) )->modify( '+1 day' )->format( 'Y-m-d' );
			Availability::give_back( $b->item_id, self::nights_of( $b ), (int) $b->quantity, $tomorrow );
			Ledger::start_release_clock( $b );
		}
		if ( in_array( $to, array( 'declined', 'cancelled', 'no_show' ), true ) && (int) $b->paid_kobo > 0 ) {
			Ledger::freeze_for_refund( $b, $to );
		}

		$b = self::get( $b->id );
		if ( in_array( $to, array( 'confirmed', 'declined', 'cancelled' ), true ) ) {
			Emails::booking_status( $b );
		}
		do_action( 'ek_booking_status_changed', $b, $from, $to );
	}

	private static function history( $booking_id, $from, $to, $actor_id, $note = '' ) {
		Log::add( 'booking_' . ( $to ? $to : 'created' ), 'booking', $booking_id, $note, array( 'from' => $from, 'to' => $to, 'actor' => (int) $actor_id ) );
	}
}
