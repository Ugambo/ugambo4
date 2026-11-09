<?php
/**
 * Restaurant reservation time slots.
 *
 * Slots run from opening time (or the restaurant's own "reservations from/to" times),
 * one every "slot length" minutes, as long as the whole slot fits before closing.
 * Each slot can take N seats (or N tables). A reservation takes its party size in seats
 * (or 1 table) from its slot. Rows are locked during booking, exactly like hotel nights.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Slots {

	public static function now() {
		return new \DateTimeImmutable( 'now', Availability::tz() );
	}

	/** Seats or tables a party uses. */
	public static function units( $business_id, $party ) {
		return 'tables' === Restaurant::settings( $business_id )['capacity_mode'] ? 1 : max( 1, (int) $party );
	}

	/** @return array{0:string,1:string}|null Opening window for reservations on a date. */
	public static function window( $business_id, $date ) {
		$s = Restaurant::settings( $business_id );
		if ( ! $s['res_enabled'] || in_array( $date, $s['closed_dates'], true ) ) {
			return null;
		}
		$h   = Business::hours( $business_id );
		$day = Business::DAYS[ (int) ( new \DateTimeImmutable( $date, Availability::tz() ) )->format( 'N' ) - 1 ];
		if ( ! $h['always'] && $h[ $day ]['closed'] ) {
			return null;
		}
		if ( $s['res_from'] && $s['res_to'] ) {
			return array( $s['res_from'], $s['res_to'] );
		}
		if ( $h['always'] ) {
			return array( '08:00', '22:00' );
		}
		$open  = $h[ $day ]['open'];
		$close = $h[ $day ]['close'] <= $open ? '23:59' : $h[ $day ]['close']; // Closing after midnight.
		return array( $open, $close );
	}

	/**
	 * Bookable slots for a date with seats/tables left.
	 *
	 * @return array<int, array{time:string, at:string, available:int}>
	 */
	public static function for_day( $business_id, $date ) {
		global $wpdb;
		if ( ! Availability::valid_date( $date ) ) {
			return array();
		}
		$s     = Restaurant::settings( $business_id );
		$now   = self::now();
		$today = $now->format( 'Y-m-d' );
		$last  = $now->modify( '+' . (int) $s['days_ahead'] . ' days' )->format( 'Y-m-d' );
		if ( $date < $today || $date > $last ) {
			return array();
		}
		$win = self::window( $business_id, $date );
		if ( ! $win ) {
			return array();
		}
		$tz      = Availability::tz();
		$t       = new \DateTimeImmutable( "$date {$win[0]}", $tz );
		$end     = new \DateTimeImmutable( "$date {$win[1]}", $tz );
		$earliest = $now->modify( '+' . (int) $s['min_notice_hours'] . ' hours' );
		$booked  = $wpdb->get_results( $wpdb->prepare( "SELECT slot_at, booked FROM {$wpdb->prefix}ek_slots WHERE business_id = %d AND slot_at >= %s AND slot_at < %s", $business_id, "$date 00:00:00", "$date 23:59:59" ), OBJECT_K );
		$out     = array();
		while ( $t->modify( '+' . (int) $s['slot_minutes'] . ' minutes' ) <= $end && count( $out ) < 96 ) {
			if ( $t >= $earliest ) {
				$at    = $t->format( 'Y-m-d H:i:00' );
				$out[] = array(
					'time'      => $t->format( 'H:i' ),
					'at'        => $at,
					'available' => max( 0, (int) $s['capacity'] - (int) ( $booked[ $at ]->booked ?? 0 ) ),
				);
			}
			$t = $t->modify( '+' . (int) $s['slot_minutes'] . ' minutes' );
		}
		return $out;
	}

	/**
	 * Check a requested reservation. @return array|\WP_Error The slot.
	 */
	public static function check( $business_id, $date, $time, $party ) {
		$s = Restaurant::settings( $business_id );
		if ( ! $s['res_enabled'] ) {
			return new \WP_Error( 'off', __( 'This restaurant is not taking table reservations online.', 'explore-katsina' ) );
		}
		if ( $party < 1 ) {
			return new \WP_Error( 'party', __( 'How many people?', 'explore-katsina' ) );
		}
		if ( $party > $s['max_party'] ) {
			/* translators: %d: max party */
			return new \WP_Error( 'party', sprintf( __( 'Online reservations are for up to %d people. For bigger groups, please contact the restaurant.', 'explore-katsina' ), $s['max_party'] ) );
		}
		foreach ( self::for_day( $business_id, $date ) as $slot ) {
			if ( $slot['time'] === $time ) {
				if ( $slot['available'] < self::units( $business_id, $party ) ) {
					return new \WP_Error( 'full', __( 'Sorry, that time is now fully booked. Please choose another time.', 'explore-katsina' ) );
				}
				return $slot;
			}
		}
		return new \WP_Error( 'slot', __( 'That time is not available. Please choose one of the times shown.', 'explore-katsina' ) );
	}

	public static function ensure_row( $business_id, $slot_at ) {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( "INSERT IGNORE INTO {$wpdb->prefix}ek_slots (business_id, slot_at) VALUES (%d, %s)", $business_id, $slot_at ) );
	}

	/** Take seats/tables. MUST run inside a transaction. @return true|\WP_Error */
	public static function take( $business_id, $slot_at, $units ) {
		global $wpdb;
		$cap = (int) Restaurant::settings( $business_id )['capacity'];
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT booked FROM {$wpdb->prefix}ek_slots WHERE business_id = %d AND slot_at = %s FOR UPDATE", $business_id, $slot_at ) );
		if ( ! $row ) {
			return new \WP_Error( 'lock', __( 'Please try again.', 'explore-katsina' ) );
		}
		if ( $cap - (int) $row->booked < $units ) {
			return new \WP_Error( 'full', __( 'Sorry, that time was just fully booked by someone else. Please choose another time.', 'explore-katsina' ) );
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_slots SET booked = booked + %d WHERE business_id = %d AND slot_at = %s", $units, $business_id, $slot_at ) );
		return true;
	}

	public static function give_back( $business_id, $slot_at, $units ) {
		global $wpdb;
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_slots SET booked = GREATEST(CAST(booked AS SIGNED) - %d, 0) WHERE business_id = %d AND slot_at = %s", $units, $business_id, $slot_at ) );
	}
}
