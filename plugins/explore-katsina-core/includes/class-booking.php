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

	/** Statuses that occupy rooms / table slots. */
	const OCCUPYING = array( 'pending_payment', 'new', 'confirmed', 'checked_in', 'seated', 'requested', 'deposit_paid' );

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
			'seated'           => __( 'Seated', 'explore-katsina' ),
			'completed'        => __( 'Completed', 'explore-katsina' ),
			'accepted'         => __( 'Accepted', 'explore-katsina' ),
			'preparing'        => __( 'Preparing', 'explore-katsina' ),
			'ready'            => __( 'Ready for pickup', 'explore-katsina' ),
			'out_for_delivery' => __( 'Out for delivery', 'explore-katsina' ),
			'requested'        => __( 'Requested', 'explore-katsina' ),
			'deposit_paid'     => __( 'Deposit paid', 'explore-katsina' ),
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

	/** What the business may do with this booking / reservation / order now. */
	public static function actions( $b ) {
		if ( 'restaurant' === $b->kind ) {
			$map = array(
				'new'       => array( 'confirmed' => __( 'Confirm', 'explore-katsina' ), 'declined' => __( 'Decline', 'explore-katsina' ) ),
				'confirmed' => array( 'seated' => __( 'Mark seated', 'explore-katsina' ), 'no_show' => __( 'Mark no-show', 'explore-katsina' ), 'cancelled' => __( 'Cancel reservation', 'explore-katsina' ) ),
				'seated'    => array( 'completed' => __( 'Mark completed', 'explore-katsina' ) ),
			);
			return $map[ $b->status ] ?? array();
		}
		if ( 'event' === $b->kind ) {
			$map = array(
				'requested'    => array( 'confirmed' => __( 'Accept request', 'explore-katsina' ), 'declined' => __( 'Decline', 'explore-katsina' ) ),
				'confirmed'    => array( 'cancelled' => __( 'Cancel booking', 'explore-katsina' ) ),
				'deposit_paid' => array( 'completed' => __( 'Mark event completed', 'explore-katsina' ), 'cancelled' => __( 'Cancel booking', 'explore-katsina' ) ),
			);
			return $map[ $b->status ] ?? array();
		}
		if ( 'order' === $b->kind ) {
			$delivery = 'delivery' === ( $b->details['fulfilment'] ?? '' );
			$map      = array(
				'new'              => array( 'accepted' => __( 'Accept order', 'explore-katsina' ), 'declined' => __( 'Decline', 'explore-katsina' ) ),
				'accepted'         => array( 'preparing' => __( 'Start preparing', 'explore-katsina' ), 'cancelled' => __( 'Cancel order', 'explore-katsina' ) ),
				'preparing'        => $delivery ? array( 'out_for_delivery' => __( 'Out for delivery', 'explore-katsina' ) ) : array( 'ready' => __( 'Ready for pickup', 'explore-katsina' ) ),
				'ready'            => array( 'completed' => __( 'Picked up', 'explore-katsina' ) ),
				'out_for_delivery' => array( 'completed' => __( 'Delivered', 'explore-katsina' ) ),
			);
			return $map[ $b->status ] ?? array();
		}
		return self::hotel_actions( $b->status );
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
		if ( 'event' === $b->kind ) {
			return Venue::days( $b->start_date, $b->end_date );
		}
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

	/** Shared guest-detail checks. @return array|\WP_Error */
	private static function guest( array $a, $what ) {
		$name  = sanitize_text_field( $a['name'] ?? '' );
		$email = sanitize_email( $a['email'] ?? '' );
		$phone = Business::normalize_phone( $a['phone'] ?? '' );
		if ( mb_strlen( $name ) < 2 ) {
			return new \WP_Error( 'name', __( 'Enter your name.', 'explore-katsina' ) );
		}
		if ( ! is_email( $email ) ) {
			return new \WP_Error( 'email', __( 'Enter a valid email address. Your confirmation is sent there.', 'explore-katsina' ) );
		}
		if ( ! $phone ) {
			/* translators: %s: hotel/restaurant */
			return new \WP_Error( 'phone', sprintf( __( 'Enter a Nigerian phone number the %s can reach you on.', 'explore-katsina' ), $what ) );
		}
		return array( $name, $email, $phone );
	}

	private static function insert( array $row ) {
		global $wpdb;
		$now               = current_time( 'mysql', true );
		$row['code']       = self::new_code();
		$row['access_key'] = bin2hex( random_bytes( 16 ) );
		$row['created_at'] = $now;
		$row['updated_at'] = $now;
		if ( 'pending_payment' === $row['status'] ) {
			$row['hold_expires'] = gmdate( 'Y-m-d H:i:s', time() + self::HOLD_MINUTES * 60 );
		}
		if ( false === $wpdb->insert( $wpdb->prefix . 'ek_bookings', $row ) ) {
			return 0;
		}
		return (int) $wpdb->insert_id;
	}

	/**
	 * Restaurant table reservation.
	 *
	 * @param array $a business_id, date, time, party, name, email, phone, notes, customer_id
	 * @return object|\WP_Error
	 */
	public static function create_reservation( array $a ) {
		global $wpdb;
		self::expire_holds();
		$bid  = (int) ( $a['business_id'] ?? 0 );
		$post = Business::get( $bid );
		if ( ! $post || 'publish' !== $post->post_status || 'restaurant' !== Business::type_of( $bid ) ) {
			return new \WP_Error( 'closed', __( 'This restaurant is not taking reservations right now.', 'explore-katsina' ) );
		}
		$party = (int) ( $a['party'] ?? 0 );
		$date  = (string) ( $a['date'] ?? '' );
		$time  = (string) ( $a['time'] ?? '' );
		$slot  = Slots::check( $bid, $date, $time, $party );
		if ( is_wp_error( $slot ) ) {
			return $slot;
		}
		$g = self::guest( $a, __( 'restaurant', 'explore-katsina' ) );
		if ( is_wp_error( $g ) ) {
			return $g;
		}
		$deposit = Restaurant::deposit_for( $bid, $party );
		if ( $deposit && ! Payments::online_available() ) {
			return new \WP_Error( 'payment', __( 'This group size needs a deposit, but online payment is not available right now. Please contact the restaurant.', 'explore-katsina' ) );
		}
		$units   = Slots::units( $bid, $party );
		$rate_bp = Commission::rate_bp( $bid, 'restaurant' );

		Slots::ensure_row( $bid, $slot['at'] );
		for ( $attempt = 1; $attempt <= 3; $attempt++ ) {
			$wpdb->query( 'START TRANSACTION' );
			$taken = Slots::take( $bid, $slot['at'], $units );
			if ( ! is_wp_error( $taken ) ) {
				break;
			}
			$wpdb->query( 'ROLLBACK' );
			if ( 'lock' !== $taken->get_error_code() || 3 === $attempt ) {
				return $taken;
			}
			usleep( random_int( 50000, 200000 ) );
		}
		$id = self::insert(
			array(
				'kind'               => 'restaurant',
				'business_id'        => $bid,
				'customer_id'        => (int) ( $a['customer_id'] ?? 0 ),
				'customer_name'      => $g[0],
				'customer_email'     => $g[1],
				'customer_phone'     => $g[2],
				'start_date'         => $date,
				'end_date'           => $date,
				'start_time'         => $time . ':00',
				'guests'             => $party,
				'quantity'           => $units,
				'total_kobo'         => $deposit,
				'deposit_kobo'       => $deposit,
				'commission_rate_bp' => $rate_bp,
				'commission_kobo'    => (int) round( $deposit * $rate_bp / 10000 ),
				'payment_mode'       => $deposit ? 'deposit' : 'venue',
				'status'             => $deposit ? 'pending_payment' : 'new',
				'details'            => wp_json_encode(
					array(
						'business' => $post->post_title,
						/* translators: %d: people */
						'title'    => sprintf( _n( 'Table for %d', 'Table for %d', $party, 'explore-katsina' ), $party ),
						'pay_now'  => $deposit,
						'pay_later'=> 0,
					)
				),
				'notes'              => sanitize_textarea_field( $a['notes'] ?? '' ),
			)
		);
		if ( ! $id ) {
			$wpdb->query( 'ROLLBACK' );
			return new \WP_Error( 'db', __( 'The reservation could not be saved. Please try again.', 'explore-katsina' ) );
		}
		$wpdb->query( 'COMMIT' );
		$b = self::get( $id );
		self::history( $id, '', $b->status, 0 );
		if ( 'new' === $b->status ) {
			Emails::booking_created( $b );
		}
		return $b;
	}

	/**
	 * Online food order (only when ordering is switched on site-wide AND by the restaurant).
	 *
	 * @param array $a business_id, items [item_id => qty], fulfilment, address, pay (online|cash), name, email, phone, notes
	 * @return object|\WP_Error
	 */
	public static function create_order( array $a ) {
		$bid = (int) ( $a['business_id'] ?? 0 );
		if ( ! Restaurant::ordering_open( $bid ) || 'publish' !== get_post_status( $bid ) ) {
			return new \WP_Error( 'off', __( 'Online ordering is not available for this restaurant.', 'explore-katsina' ) );
		}
		if ( ! Business::is_open( $bid ) ) {
			return new \WP_Error( 'closed', __( 'The restaurant is closed right now. Please order during opening hours.', 'explore-katsina' ) );
		}
		$s     = Restaurant::settings( $bid );
		$lines = array();
		$sub   = 0;
		foreach ( (array) ( $a['items'] ?? array() ) as $item_id => $qty ) {
			$qty = min( 50, absint( $qty ) );
			if ( ! $qty ) {
				continue;
			}
			$item = Menu::item( absint( $item_id ), $bid );
			if ( ! $item || ! $item->available ) {
				return new \WP_Error( 'item', __( 'One of the dishes is sold out. Please review your order.', 'explore-katsina' ) );
			}
			$lines[] = array( 'id' => (int) $item->id, 'name' => $item->name, 'price' => (int) $item->price_kobo, 'qty' => $qty );
			$sub    += (int) $item->price_kobo * $qty;
		}
		if ( ! $lines ) {
			return new \WP_Error( 'empty', __( 'Add at least one dish.', 'explore-katsina' ) );
		}
		if ( $s['min_order'] && $sub < $s['min_order'] ) {
			/* translators: %s: amount */
			return new \WP_Error( 'min', sprintf( __( 'The minimum order is %s.', 'explore-katsina' ), Money::format( $s['min_order'] ) ) );
		}
		$fulfil = 'delivery' === ( $a['fulfilment'] ?? '' ) ? 'delivery' : 'pickup';
		if ( ( 'delivery' === $fulfil && ! $s['order_delivery'] ) || ( 'pickup' === $fulfil && ! $s['order_pickup'] ) ) {
			return new \WP_Error( 'fulfil', __( 'Choose pickup or delivery.', 'explore-katsina' ) );
		}
		$address = sanitize_textarea_field( $a['address'] ?? '' );
		if ( 'delivery' === $fulfil && mb_strlen( $address ) < 8 ) {
			return new \WP_Error( 'address', __( 'Enter the delivery address with a landmark.', 'explore-katsina' ) );
		}
		$pay = 'cash' === ( $a['pay'] ?? '' ) ? 'cash' : 'online';
		if ( ( 'cash' === $pay && ! $s['order_pay_cash'] ) || ( 'online' === $pay && ( ! $s['order_pay_online'] || ! Payments::online_available() ) ) ) {
			return new \WP_Error( 'pay', __( 'Choose how you would like to pay.', 'explore-katsina' ) );
		}
		$g = self::guest( $a, __( 'restaurant', 'explore-katsina' ) );
		if ( is_wp_error( $g ) ) {
			return $g;
		}
		$fee     = 'delivery' === $fulfil ? (int) $s['delivery_fee'] : 0;
		$total   = $sub + $fee;
		$rate_bp = Commission::rate_bp( $bid, 'restaurant_orders' );
		$id      = self::insert(
			array(
				'kind'               => 'order',
				'business_id'        => $bid,
				'customer_id'        => (int) ( $a['customer_id'] ?? 0 ),
				'customer_name'      => $g[0],
				'customer_email'     => $g[1],
				'customer_phone'     => $g[2],
				'start_date'         => Availability::today(),
				'end_date'           => Availability::today(),
				'start_time'         => Slots::now()->modify( '+' . (int) $s['prep_minutes'] . ' minutes' )->format( 'H:i:00' ),
				'guests'             => 1,
				'quantity'           => array_sum( wp_list_pluck( $lines, 'qty' ) ),
				'total_kobo'         => $total,
				'commission_rate_bp' => $rate_bp,
				'commission_kobo'    => (int) round( $sub * $rate_bp / 10000 ),
				'payment_mode'       => 'online' === $pay ? 'full' : 'cash',
				'status'             => 'online' === $pay ? 'pending_payment' : 'new',
				'details'            => wp_json_encode(
					array(
						'business'     => get_the_title( $bid ),
						/* translators: %s: pickup/delivery */
						'title'        => 'delivery' === $fulfil ? __( 'Delivery order', 'explore-katsina' ) : __( 'Pickup order', 'explore-katsina' ),
						'items'        => $lines,
						'subtotal'     => $sub,
						'delivery_fee' => $fee,
						'fulfilment'   => $fulfil,
						'address'      => $address,
						'pay_now'      => 'online' === $pay ? $total : 0,
						'pay_later'    => 'online' === $pay ? 0 : $total,
					)
				),
				'notes'              => sanitize_textarea_field( $a['notes'] ?? '' ),
			)
		);
		if ( ! $id ) {
			return new \WP_Error( 'db', __( 'The order could not be saved. Please try again.', 'explore-katsina' ) );
		}
		$b = self::get( $id );
		self::history( $id, '', $b->status, 0 );
		if ( 'new' === $b->status ) {
			Emails::booking_created( $b );
		}
		return $b;
	}

	/**
	 * Event centre booking (request-to-book or instant deposit).
	 *
	 * @param array $a hall_id, start, end, guests, layout (seated|standing), event_type, name, email, phone, notes, customer_id
	 * @return object|\WP_Error
	 */
	public static function create_event( array $a ) {
		global $wpdb;
		self::expire_holds();
		$hall = Halls::data( $a['hall_id'] ?? 0 );
		if ( ! $hall || ! $hall['active'] ) {
			return new \WP_Error( 'hall', __( 'This hall is not available for booking.', 'explore-katsina' ) );
		}
		$venue = Business::get( $hall['venue_id'] );
		if ( ! $venue || 'publish' !== $venue->post_status || 'event-centre' !== Business::type_of( $venue->ID ) ) {
			return new \WP_Error( 'venue', __( 'This event centre is not taking bookings right now.', 'explore-katsina' ) );
		}
		$start = (string) ( $a['start'] ?? '' );
		$end   = (string) ( $a['end'] ?? '' ) ? (string) $a['end'] : $start;
		if ( ! Availability::valid_date( $start ) || ! Availability::valid_date( $end ) || $end < $start ) {
			return new \WP_Error( 'dates', __( 'Choose the event date.', 'explore-katsina' ) );
		}
		if ( $start < Availability::today() ) {
			return new \WP_Error( 'past', __( 'The event date cannot be in the past.', 'explore-katsina' ) );
		}
		$days = Venue::days( $start, $end );
		if ( count( $days ) > Venue::MAX_DAYS ) {
			/* translators: %d: days */
			return new \WP_Error( 'long', sprintf( __( 'Online bookings are for up to %d days. Contact the venue for longer events.', 'explore-katsina' ), Venue::MAX_DAYS ) );
		}
		if ( 'event' === $hall['pricing'] && count( $days ) > 1 ) {
			return new \WP_Error( 'one_day', __( 'This hall is priced per event: please book one day at a time, or contact the venue.', 'explore-katsina' ) );
		}
		$layout = 'standing' === ( $a['layout'] ?? '' ) ? 'standing' : 'seated';
		$cap    = 'standing' === $layout ? $hall['capacity_standing'] : $hall['capacity_seated'];
		$guests = (int) ( $a['guests'] ?? 0 );
		if ( $guests < 1 ) {
			return new \WP_Error( 'guests', __( 'How many guests are you expecting?', 'explore-katsina' ) );
		}
		if ( $guests > $cap ) {
			/* translators: 1: capacity, 2: seated/standing */
			return new \WP_Error( 'capacity', sprintf( __( 'This hall holds up to %1$d guests %2$s.', 'explore-katsina' ), $cap, 'standing' === $layout ? __( 'standing', 'explore-katsina' ) : __( 'seated', 'explore-katsina' ) ) );
		}
		$type = isset( Venue::event_types()[ $a['event_type'] ?? '' ] ) ? $a['event_type'] : 'other';
		$g    = self::guest( $a, __( 'event centre', 'explore-katsina' ) );
		if ( is_wp_error( $g ) ) {
			return $g;
		}
		$s = Venue::settings( $venue->ID );
		if ( 'instant' === $s['booking_mode'] && ! Payments::online_available() ) {
			return new \WP_Error( 'payment', __( 'Online payment is not available right now. Please contact the venue.', 'explore-katsina' ) );
		}
		Availability::forget( $hall['id'] );
		$quote = Venue::quote( $hall, $start, $end );
		if ( ! $quote['ok'] ) {
			return new \WP_Error( 'sold_out', $quote['reason'] );
		}
		$total   = (int) $quote['total'];
		$deposit = (int) round( $total * $s['deposit_pct'] / 100 );
		$rate_bp = Commission::rate_bp( $venue->ID, 'event-centre' );
		$status  = 'instant' === $s['booking_mode'] ? 'pending_payment' : 'requested';

		Availability::ensure_rows( $hall['id'], $days );
		for ( $attempt = 1; $attempt <= 3; $attempt++ ) {
			$wpdb->query( 'START TRANSACTION' );
			$taken = Availability::take( $hall, $days, 1 );
			if ( ! is_wp_error( $taken ) ) {
				break;
			}
			$wpdb->query( 'ROLLBACK' );
			if ( 'lock' !== $taken->get_error_code() || 3 === $attempt ) {
				return 'sold_out' === $taken->get_error_code() ? new \WP_Error( 'sold_out', __( 'Sorry, this hall was just booked by someone else for that date. Please choose another date or hall.', 'explore-katsina' ) ) : $taken;
			}
			usleep( random_int( 50000, 200000 ) );
		}
		$id = self::insert(
			array(
				'kind'               => 'event',
				'business_id'        => $venue->ID,
				'item_id'            => $hall['id'],
				'customer_id'        => (int) ( $a['customer_id'] ?? 0 ),
				'customer_name'      => $g[0],
				'customer_email'     => $g[1],
				'customer_phone'     => $g[2],
				'start_date'         => $start,
				'end_date'           => $end,
				'guests'             => $guests,
				'quantity'           => 1,
				'total_kobo'         => $total,
				'deposit_kobo'       => $deposit,
				'commission_rate_bp' => $rate_bp,
				'commission_kobo'    => (int) round( $deposit * $rate_bp / 10000 ),
				'payment_mode'       => 'deposit',
				'status'             => $status,
				'details'            => wp_json_encode(
					array(
						'business'   => $venue->post_title,
						'hall'       => $hall['name'],
						/* translators: %s: hall */
						'title'      => $hall['name'],
						'days'       => $quote['days'],
						'pricing'    => $hall['pricing'],
						'layout'     => $layout,
						'event_type' => $type,
						'pay_now'    => $deposit,
						'pay_later'  => $total - $deposit,
						'mode'       => $s['booking_mode'],
					)
				),
				'policy_snapshot'    => wp_json_encode( array_merge( array( 'key' => $s['policy'] ), Hotel::policies()[ $s['policy'] ], array( 'note' => $s['policy_note'] ) ) ),
				'notes'              => sanitize_textarea_field( $a['notes'] ?? '' ),
			)
		);
		if ( ! $id ) {
			$wpdb->query( 'ROLLBACK' );
			return new \WP_Error( 'db', __( 'The booking could not be saved. Please try again.', 'explore-katsina' ) );
		}
		if ( 'requested' === $status ) {
			$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() + Venue::REPLY_HOURS * HOUR_IN_SECONDS ) ), array( 'id' => $id ) );
		}
		$wpdb->query( 'COMMIT' );
		$b = self::get( $id );
		self::history( $id, '', $status, 0 );
		if ( 'requested' === $status ) {
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
		if ( 'event' === $b->kind && in_array( $b->status, array( 'pending_payment', 'confirmed' ), true ) ) {
			$new_status = 'deposit_paid';
		} elseif ( 'pending_payment' === $b->status ) {
			$new_status = 'new';
		} elseif ( in_array( $b->status, array( 'expired', 'cancelled' ), true ) ) {
			// The hold ran out before the money arrived: try to take the rooms / table again.
			if ( 'restaurant' === $b->kind ) {
				$slot_at = $b->start_date . ' ' . substr( (string) $b->start_time, 0, 5 ) . ':00';
				Slots::ensure_row( $b->business_id, $slot_at );
				$wpdb->query( 'START TRANSACTION' );
				$taken = Slots::take( $b->business_id, $slot_at, (int) $b->quantity );
			} elseif ( 'order' === $b->kind ) {
				$wpdb->query( 'START TRANSACTION' );
				$taken = true;
			} else {
				$room = 'event' === $b->kind ? Halls::data( $b->item_id ) : Rooms::data( $b->item_id );
				if ( $room ) {
					Availability::ensure_rows( $room['id'], self::nights_of( $b ) );
				}
				$wpdb->query( 'START TRANSACTION' );
				$taken = $room ? Availability::take( $room, self::nights_of( $b ), (int) $b->quantity ) : new \WP_Error( 'room', 'Room missing' );
			}
			if ( is_wp_error( $taken ) ) {
				$wpdb->query( 'ROLLBACK' );
				$new_status = 'payment_conflict';
			} else {
				$wpdb->query( 'COMMIT' );
				$new_status = 'event' === $b->kind ? 'deposit_paid' : 'new';
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
		if ( 'event' === $b->kind ) {
			// Event centre money is released 3 days after the (last) event day, if there is no complaint.
			Ledger::release_after( $b, $b->end_date );
		}
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
		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT id FROM {$wpdb->prefix}ek_bookings WHERE hold_expires < %s AND ( status IN ('pending_payment','requested') OR ( kind = 'event' AND status = 'confirmed' AND paid_kobo = 0 ) ) LIMIT 200",
				current_time( 'mysql', true )
			)
		);
		foreach ( $ids as $id ) {
			$b = self::get( $id );
			if ( ! $b ) {
				continue;
			}
			if ( 'pending_payment' === $b->status ) {
				self::set_status( $b, 'expired', 0, 'hold expired' );
			} elseif ( 'requested' === $b->status ) {
				self::set_status( $b, 'expired', 0, 'venue did not reply in time' );
			} elseif ( 'confirmed' === $b->status && 'event' === $b->kind ) {
				self::set_status( $b, 'cancelled', 0, 'deposit not paid in time' );
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
		return self::transition( $b, $to, $actor_id, $note );
	}

	/**
	 * Status change requested by the business (already ownership-checked by the caller).
	 *
	 * @return true|\WP_Error
	 */
	public static function transition( $b, $to, $actor_id, $note = '' ) {
		$allowed = self::actions( $b );
		if ( ! isset( $allowed[ $to ] ) ) {
			return new \WP_Error( 'transition', __( 'That change is not possible for this booking now.', 'explore-katsina' ) );
		}
		$today = Availability::today();
		if ( 'event' === $b->kind && 'completed' === $to && $today < $b->end_date ) {
			return new \WP_Error( 'early', __( 'You can mark the event completed on or after its date.', 'explore-katsina' ) );
		}
		if ( in_array( $to, array( 'checked_in', 'no_show', 'seated' ), true ) && $today < $b->start_date ) {
			return new \WP_Error( 'early', __( 'You can only do this on or after the check-in date.', 'explore-katsina' ) );
		}
		if ( 'event' === $b->kind && 'confirmed' === $to ) {
			// The guest now has 72 hours to pay the deposit; until then the date stays held.
			global $wpdb;
			$pay_by = gmdate( 'Y-m-d H:i:s', time() + Venue::PAY_BY_HOURS * HOUR_IN_SECONDS );
			$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => $pay_by ), array( 'id' => $b->id ) );
			self::set_status( $b, $to, $actor_id, $note );
			$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => $pay_by ), array( 'id' => $b->id ) );
			return true;
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
		$now_occupying = in_array( $to, self::OCCUPYING, true ) || in_array( $to, array( 'checked_out', 'completed' ), true );
		if ( in_array( $b->kind, array( 'hotel', 'event' ), true ) && $was_occupying && ! $now_occupying ) {
			// Cancelled / declined / expired / no-show: give back all nights that haven't passed.
			Availability::give_back( $b->item_id, self::nights_of( $b ), (int) $b->quantity, 'no_show' === $to ? Availability::today() : '' );
		}
		if ( 'restaurant' === $b->kind && $was_occupying && ! $now_occupying && 'no_show' !== $to ) {
			Slots::give_back( $b->business_id, $b->start_date . ' ' . substr( (string) $b->start_time, 0, 5 ) . ':00', (int) $b->quantity );
		}
		if ( in_array( $b->kind, array( 'restaurant', 'order' ), true ) && 'completed' === $to ) {
			Ledger::start_release_clock( $b );
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
		if ( in_array( $to, array( 'confirmed', 'declined', 'cancelled', 'accepted', 'ready', 'out_for_delivery' ), true ) ) {
			Emails::booking_status( $b );
		}
		do_action( 'ek_booking_status_changed', $b, $from, $to );
	}

	private static function history( $booking_id, $from, $to, $actor_id, $note = '' ) {
		Log::add( 'booking_' . ( $to ? $to : 'created' ), 'booking', $booking_id, $note, array( 'from' => $from, 'to' => $to, 'actor' => (int) $actor_id ) );
	}
}
