<?php
/**
 * Availability calendar and nightly prices for room categories (and, in Phase 5, halls).
 *
 * Price for one night, in order of priority:
 *   1. a one-off price set on that date in the calendar
 *   2. a seasonal/peak rule covering that date (newest rule wins)
 *   3. the weekend price (Friday and Saturday nights), if set
 *   4. the normal price per night
 *
 * Rooms available on a night = rooms of that type − rooms marked unavailable − rooms booked
 * (0 if the date is closed). "Booked" includes 15-minute holds while a guest pays.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Availability {

	const MAX_NIGHTS      = 30;
	const MAX_MONTHS_AHEAD = 18;

	/** @var array<int, array<string, object>> Prefetched rows. */
	private static $rows = array();
	/** @var array<int, object[]> Prefetched rules. */
	private static $rules = array();

	public static function tz() {
		return new \DateTimeZone( 'Africa/Lagos' );
	}

	public static function today() {
		return ( new \DateTimeImmutable( 'now', self::tz() ) )->format( 'Y-m-d' );
	}

	public static function valid_date( $d ) {
		if ( ! is_string( $d ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $d ) ) {
			return false;
		}
		list( $y, $m, $day ) = array_map( 'intval', explode( '-', $d ) );
		return checkdate( $m, $day, $y );
	}

	/** List of nights (Y-m-d) from check-in up to the night before check-out. */
	public static function nights( $checkin, $checkout ) {
		$out = array();
		$d   = new \DateTimeImmutable( $checkin, self::tz() );
		$end = new \DateTimeImmutable( $checkout, self::tz() );
		while ( $d < $end && count( $out ) <= self::MAX_NIGHTS ) {
			$out[] = $d->format( 'Y-m-d' );
			$d     = $d->modify( '+1 day' );
		}
		return $out;
	}

	/** @return true|\WP_Error */
	public static function check_dates( $checkin, $checkout ) {
		if ( ! self::valid_date( $checkin ) || ! self::valid_date( $checkout ) ) {
			return new \WP_Error( 'dates', __( 'Choose your check-in and check-out dates.', 'explore-katsina' ) );
		}
		if ( $checkin < self::today() ) {
			return new \WP_Error( 'past', __( 'Check-in cannot be in the past.', 'explore-katsina' ) );
		}
		if ( $checkout <= $checkin ) {
			return new \WP_Error( 'order', __( 'Check-out must be after check-in.', 'explore-katsina' ) );
		}
		$limit = ( new \DateTimeImmutable( 'now', self::tz() ) )->modify( '+' . self::MAX_MONTHS_AHEAD . ' months' )->format( 'Y-m-d' );
		if ( $checkin > $limit ) {
			return new \WP_Error( 'far', __( 'Bookings can be made up to 18 months ahead.', 'explore-katsina' ) );
		}
		if ( count( self::nights( $checkin, $checkout ) ) > self::MAX_NIGHTS ) {
			/* translators: %d: nights */
			return new \WP_Error( 'long', sprintf( __( 'Online bookings are limited to %d nights. Contact the hotel for longer stays.', 'explore-katsina' ), self::MAX_NIGHTS ) );
		}
		return true;
	}

	/* ------------------------------------------------------------------ */
	/* Reading                                                              */
	/* ------------------------------------------------------------------ */

	/** Load calendar rows and rules for many rooms at once (search pages). */
	public static function prefetch( array $item_ids, $from, $to ) {
		global $wpdb;
		$item_ids = array_values( array_filter( array_map( 'intval', $item_ids ) ) );
		if ( ! $item_ids ) {
			return;
		}
		$in   = implode( ',', $item_ids );
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_nights WHERE item_id IN ($in) AND night >= %s AND night < %s", $from, $to ) ); // phpcs:ignore
		foreach ( $item_ids as $id ) {
			self::$rows[ $id ]  = array();
			self::$rules[ $id ] = array();
		}
		foreach ( $rows as $r ) {
			self::$rows[ (int) $r->item_id ][ $r->night ] = $r;
		}
		$rules = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_rate_rules WHERE item_id IN ($in) AND start_date < %s AND end_date >= %s ORDER BY id ASC", $to, $from ) ); // phpcs:ignore
		foreach ( $rules as $r ) {
			self::$rules[ (int) $r->item_id ][] = $r;
		}
	}

	public static function forget( $item_id = null ) {
		if ( null === $item_id ) {
			self::$rows  = array();
			self::$rules = array();
		} else {
			unset( self::$rows[ $item_id ], self::$rules[ $item_id ] );
		}
	}

	private static function ensure_loaded( $item_id, $from, $to ) {
		if ( ! isset( self::$rows[ $item_id ] ) ) {
			self::prefetch( array( $item_id ), $from, $to );
		}
	}

	public static function rules( $item_id ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_rate_rules WHERE item_id = %d AND end_date >= %s ORDER BY start_date ASC", $item_id, self::today() ) );
	}

	public static function is_weekend_night( $date ) {
		$n = (int) ( new \DateTimeImmutable( $date, self::tz() ) )->format( 'N' );
		return 5 === $n || 6 === $n; // Friday and Saturday nights.
	}

	/** Price (kobo) and available rooms for one night. Caller must have prefetched. */
	public static function night( array $room, $date ) {
		$row   = self::$rows[ $room['id'] ][ $date ] ?? null;
		$price = $room['price'];
		$why   = 'base';
		if ( $room['weekend_price'] && self::is_weekend_night( $date ) ) {
			$price = $room['weekend_price'];
			$why   = 'weekend';
		}
		foreach ( self::$rules[ $room['id'] ] ?? array() as $rule ) {
			if ( $date >= $rule->start_date && $date <= $rule->end_date ) {
				$price = (int) $rule->price_kobo;
				$why   = 'season:' . $rule->label;
			}
		}
		if ( $row && null !== $row->price_kobo ) {
			$price = (int) $row->price_kobo;
			$why   = 'special';
		}
		$available = $row
			? ( $row->closed ? 0 : max( 0, $room['units'] - (int) $row->blocked - (int) $row->booked ) )
			: $room['units'];
		return array(
			'price'     => (int) $price,
			'why'       => $why,
			'available' => (int) $available,
			'closed'    => $row ? (bool) $row->closed : false,
			'blocked'   => $row ? (int) $row->blocked : 0,
			'booked'    => $row ? (int) $row->booked : 0,
		);
	}

	/**
	 * Price and availability of $qty rooms for a stay.
	 *
	 * @return array{ok:bool, reason:string, nights:array, per_room:int, total:int, available:int, avg:int}
	 */
	public static function quote( array $room, $checkin, $checkout, $qty = 1 ) {
		$nights = self::nights( $checkin, $checkout );
		self::ensure_loaded( $room['id'], $checkin, $checkout );
		$per   = 0;
		$min   = PHP_INT_MAX;
		$lines = array();
		foreach ( $nights as $date ) {
			$n               = self::night( $room, $date );
			$lines[ $date ]  = $n['price'];
			$per            += $n['price'];
			$min             = min( $min, $n['available'] );
		}
		$min    = PHP_INT_MAX === $min ? 0 : $min;
		$ok     = $room['active'] && $nights && $min >= $qty;
		$reason = '';
		if ( ! $ok ) {
			$reason = 0 === $min ? __( 'Sold out for these dates', 'explore-katsina' )
				/* translators: %d: rooms left */
				: sprintf( _n( 'Only %d room left for these dates', 'Only %d rooms left for these dates', $min, 'explore-katsina' ), $min );
		}
		return array(
			'ok'        => $ok,
			'reason'    => $reason,
			'nights'    => $lines,
			'per_room'  => $per,
			'total'     => $per * max( 1, (int) $qty ),
			'available' => $min,
			'avg'       => $nights ? (int) round( $per / count( $nights ) ) : 0,
		);
	}

	/** Month grid for the dashboard calendar. */
	public static function month( array $room, $year, $month ) {
		$first = sprintf( '%04d-%02d-01', $year, $month );
		$start = new \DateTimeImmutable( $first, self::tz() );
		$next  = $start->modify( 'first day of next month' )->format( 'Y-m-d' );
		self::forget( $room['id'] );
		self::prefetch( array( $room['id'] ), $first, $next );
		$days = array();
		for ( $d = $start; $d->format( 'Y-m-d' ) < $next; $d = $d->modify( '+1 day' ) ) {
			$days[ $d->format( 'Y-m-d' ) ] = self::night( $room, $d->format( 'Y-m-d' ) );
		}
		return $days;
	}

	/* ------------------------------------------------------------------ */
	/* Writing (owner's calendar)                                           */
	/* ------------------------------------------------------------------ */

	/**
	 * Apply an action to every night in a date range (inclusive).
	 *
	 * @param string $op close | open | block | price | clear_price
	 * @return int|\WP_Error Nights changed.
	 */
	public static function set_range( $item_id, $from, $to, $op, $value = 0 ) {
		global $wpdb;
		if ( ! self::valid_date( $from ) || ! self::valid_date( $to ) || $to < $from ) {
			return new \WP_Error( 'dates', __( 'Choose a valid date range.', 'explore-katsina' ) );
		}
		if ( $to < self::today() ) {
			return new \WP_Error( 'past', __( 'Those dates are in the past.', 'explore-katsina' ) );
		}
		$from  = max( $from, self::today() );
		$dates = array();
		for ( $d = new \DateTimeImmutable( $from, self::tz() ); $d->format( 'Y-m-d' ) <= $to && count( $dates ) < 400; $d = $d->modify( '+1 day' ) ) {
			$dates[] = $d->format( 'Y-m-d' );
		}
		$t = $wpdb->prefix . 'ek_nights';
		foreach ( $dates as $date ) {
			switch ( $op ) {
				case 'close':
					$wpdb->query( $wpdb->prepare( "INSERT INTO {$t} (item_id, night, closed) VALUES (%d, %s, 1) ON DUPLICATE KEY UPDATE closed = 1", $item_id, $date ) );
					break;
				case 'open':
					$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET closed = 0, blocked = 0 WHERE item_id = %d AND night = %s", $item_id, $date ) );
					break;
				case 'block':
					$wpdb->query( $wpdb->prepare( "INSERT INTO {$t} (item_id, night, blocked) VALUES (%d, %s, %d) ON DUPLICATE KEY UPDATE blocked = VALUES(blocked)", $item_id, $date, max( 0, (int) $value ) ) );
					break;
				case 'price':
					$wpdb->query( $wpdb->prepare( "INSERT INTO {$t} (item_id, night, price_kobo) VALUES (%d, %s, %d) ON DUPLICATE KEY UPDATE price_kobo = VALUES(price_kobo)", $item_id, $date, (int) $value ) );
					break;
				case 'clear_price':
					$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET price_kobo = NULL WHERE item_id = %d AND night = %s", $item_id, $date ) );
					break;
				default:
					return new \WP_Error( 'op', __( 'Unknown calendar action.', 'explore-katsina' ) );
			}
		}
		self::forget( $item_id );
		return count( $dates );
	}

	public static function add_rule( $item_id, $label, $from, $to, $price_kobo ) {
		global $wpdb;
		if ( ! self::valid_date( $from ) || ! self::valid_date( $to ) || $to < $from ) {
			return new \WP_Error( 'dates', __( 'Choose a valid date range for the seasonal price.', 'explore-katsina' ) );
		}
		if ( $price_kobo < 100000 ) {
			return new \WP_Error( 'price', __( 'Enter the seasonal price per night (at least ₦1,000).', 'explore-katsina' ) );
		}
		$wpdb->insert(
			$wpdb->prefix . 'ek_rate_rules',
			array(
				'item_id'    => (int) $item_id,
				'label'      => mb_substr( sanitize_text_field( $label ), 0, 100 ),
				'start_date' => $from,
				'end_date'   => $to,
				'price_kobo' => (int) $price_kobo,
				'created_at' => current_time( 'mysql', true ),
			)
		);
		self::forget( $item_id );
		return (int) $wpdb->insert_id;
	}

	public static function delete_rule( $rule_id, $item_id ) {
		global $wpdb;
		self::forget( $item_id );
		return (bool) $wpdb->delete( $wpdb->prefix . 'ek_rate_rules', array( 'id' => (int) $rule_id, 'item_id' => (int) $item_id ) );
	}

	/* ------------------------------------------------------------------ */
	/* Reserving (called by Booking inside a database transaction)          */
	/* ------------------------------------------------------------------ */

	/**
	 * Lock the nights and take $qty rooms. MUST run inside a transaction.
	 *
	 * @return true|\WP_Error
	 */
	/**
	 * Make sure calendar rows exist for these nights. Call BEFORE starting the transaction:
	 * creating rows inside competing transactions can make the database stall and give up.
	 */
	public static function ensure_rows( $item_id, array $nights ) {
		global $wpdb;
		if ( ! $nights ) {
			return;
		}
		$values = implode( ',', array_map( static fn( $n ) => $wpdb->prepare( '(%d, %s)', $item_id, $n ), $nights ) );
		$wpdb->query( "INSERT IGNORE INTO {$wpdb->prefix}ek_nights (item_id, night) VALUES {$values}" ); // phpcs:ignore
	}

	public static function take( array $room, array $nights, $qty ) {
		global $wpdb;
		$t = $wpdb->prefix . 'ek_nights';
		sort( $nights ); // Always lock in date order, so two bookings never wait on each other in a circle.
		$ph   = implode( ',', array_fill( 0, count( $nights ), '%s' ) );
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$t} WHERE item_id = %d AND night IN ($ph) ORDER BY night FOR UPDATE", array_merge( array( $room['id'] ), $nights ) ) ); // phpcs:ignore
		if ( count( $rows ) !== count( $nights ) ) {
			return new \WP_Error( 'lock', __( 'Please try again.', 'explore-katsina' ) );
		}
		foreach ( $rows as $r ) {
			$free = $r->closed ? 0 : $room['units'] - (int) $r->blocked - (int) $r->booked;
			if ( $free < $qty ) {
				return new \WP_Error( 'sold_out', __( 'Sorry, these rooms were just booked by someone else for one or more of your nights. Please choose other dates or another room.', 'explore-katsina' ) );
			}
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET booked = booked + %d WHERE item_id = %d AND night IN ($ph)", array_merge( array( (int) $qty, $room['id'] ), $nights ) ) ); // phpcs:ignore
		self::forget( $room['id'] );
		return true;
	}

	/** Give rooms back (cancelled, declined, expired hold…). Only nights from $from onward. */
	public static function give_back( $item_id, array $nights, $qty, $from = '' ) {
		global $wpdb;
		$nights = array_values( array_filter( $nights, static fn( $n ) => ! $from || $n >= $from ) );
		if ( ! $nights ) {
			return;
		}
		$ph = implode( ',', array_fill( 0, count( $nights ), '%s' ) );
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_nights SET booked = GREATEST(CAST(booked AS SIGNED) - %d, 0) WHERE item_id = %d AND night IN ($ph)", array_merge( array( (int) $qty, (int) $item_id ), $nights ) ) ); // phpcs:ignore
		self::forget( $item_id );
	}
}
