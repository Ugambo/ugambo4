<?php
/**
 * Hotel-only dashboard sections and actions: Hotel details, Rooms, Calendar,
 * and booking status changes (confirm, decline, check-in, check-out, no-show).
 *
 * The Dashboard has already checked that the user owns $business_id before any
 * action reaches here. Every room / booking ID is checked again to belong to it.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Hotel_Dashboard {

	public static function init() {
		add_filter( 'ek_dashboard_sections', array( __CLASS__, 'sections' ), 10, 2 );
		add_filter( 'ek_dashboard_action', array( __CLASS__, 'action' ), 10, 5 );
	}

	public static function sections( $s, $type ) {
		if ( 'hotel' !== $type ) {
			return $s;
		}
		$out = array();
		foreach ( $s as $k => $label ) {
			$out[ $k ] = $label;
			if ( 'profile' === $k ) {
				$out['hotel']    = __( 'Hotel details', 'explore-katsina' );
				$out['rooms']    = __( 'Rooms', 'explore-katsina' );
				$out['calendar'] = __( 'Calendar & prices', 'explore-katsina' );
			}
		}
		return $out;
	}

	/** @var array Form errors for re-display. */
	public static $errors = array();
	public static $values = array();

	public static function action( $redirect, $action, $business_id, array $in, $uid ) {
		$is_hotel = 'hotel' === Business::type_of( $business_id );

		switch ( $action ) {
			case 'dash_booking':
				return self::booking_action( $business_id, $in, $uid );

			case 'dash_hotel':
				if ( ! $is_hotel ) {
					return $redirect;
				}
				list( $d, $e ) = Hotel::validate( $in );
				if ( $e ) {
					self::$errors = $e;
					self::$values = $in;
					return null;
				}
				Hotel::save( $business_id, $d );
				View::flash( 'ok', __( 'Hotel details saved.', 'explore-katsina' ), $uid );
				return Dashboard::url( 'hotel', $business_id );

			case 'dash_room':
				if ( ! $is_hotel ) {
					return $redirect;
				}
				$room_id = absint( $in['room_id'] ?? 0 );
				if ( $room_id && ! Rooms::belongs_to( $room_id, $business_id ) ) {
					wp_die( esc_html__( 'That room belongs to another hotel.', 'explore-katsina' ), '', array( 'response' => 403 ) );
				}
				list( $d, $e ) = Rooms::validate( $in );
				if ( $e ) {
					self::$errors = $e;
					self::$values = $in;
					return null;
				}
				$id = Rooms::save( $business_id, $room_id, $d );
				if ( is_wp_error( $id ) ) {
					View::flash( 'error', $id->get_error_message(), $uid );
					return Dashboard::url( 'rooms', $business_id );
				}
				// Photos: remove ticked ones, then add new uploads.
				$photos = Rooms::data( $id )['photos'];
				foreach ( array_map( 'absint', (array) ( $in['remove_photo'] ?? array() ) ) as $pid ) {
					if ( in_array( $pid, $photos, true ) && (int) get_post_meta( $pid, '_ek_room_photo', true ) === $id ) {
						wp_delete_attachment( $pid, true );
						$photos = array_values( array_diff( $photos, array( $pid ) ) );
					}
				}
				$room_limit = 6;
				$up         = Photos::upload_many( 'room_photos', $business_id, max( 0, $room_limit - count( $photos ) ) );
				foreach ( $up['ids'] as $pid ) {
					update_post_meta( $pid, '_ek_room_photo', $id );
				}
				update_post_meta( $id, '_ek_gallery', array_merge( $photos, $up['ids'] ) );
				foreach ( $up['errors'] as $msg ) {
					View::flash( 'warn', $msg, $uid );
				}
				if ( $d['units'] && $room_id ) {
					self::warn_overbooked( $id, $uid );
				}
				View::flash( 'ok', $room_id ? __( 'Room category saved.', 'explore-katsina' ) : __( 'Room category added. Next, check its calendar and prices.', 'explore-katsina' ), $uid );
				return Dashboard::url( 'rooms', $business_id );

			case 'dash_room_delete':
				$room_id = absint( $in['room_id'] ?? 0 );
				if ( ! Rooms::belongs_to( $room_id, $business_id ) ) {
					wp_die( esc_html__( 'That room belongs to another hotel.', 'explore-katsina' ), '', array( 'response' => 403 ) );
				}
				if ( Rooms::future_bookings( $room_id ) ) {
					View::flash( 'error', __( 'This room category has upcoming bookings, so it cannot be deleted. Switch it off instead so no new bookings come in.', 'explore-katsina' ), $uid );
				} else {
					foreach ( Rooms::data( $room_id )['photos'] as $pid ) {
						wp_delete_attachment( $pid, true );
					}
					wp_trash_post( $room_id );
					View::flash( 'ok', __( 'Room category deleted.', 'explore-katsina' ), $uid );
				}
				return Dashboard::url( 'rooms', $business_id );

			case 'dash_calendar':
				$room_id = absint( $in['room_id'] ?? 0 );
				if ( ! Rooms::belongs_to( $room_id, $business_id ) && ! Halls::belongs_to( $room_id, $business_id ) ) {
					wp_die( esc_html__( 'That room or hall belongs to another business.', 'explore-katsina' ), '', array( 'response' => 403 ) );
				}
				$back = Dashboard::url( 'calendar', $business_id, array( 'room' => $room_id, 'month' => sanitize_text_field( $in['month'] ?? '' ) ) );
				$op   = sanitize_key( $in['op'] ?? '' );
				if ( 'rule_add' === $op ) {
					$r = Availability::add_rule( $room_id, $in['label'] ?? '', $in['from'] ?? '', $in['to'] ?? '', Money::to_kobo( $in['price'] ?? '' ) );
				} elseif ( 'rule_delete' === $op ) {
					$r = Availability::delete_rule( absint( $in['rule_id'] ?? 0 ), $room_id ) ? 1 : new \WP_Error( 'x', __( 'Price rule not found.', 'explore-katsina' ) );
				} else {
					$value = 'price' === $op ? Money::to_kobo( $in['value'] ?? '' ) : absint( $in['value'] ?? 0 );
					if ( 'price' === $op && $value < 100000 ) {
						$r = new \WP_Error( 'price', __( 'Enter a price of at least ₦1,000.', 'explore-katsina' ) );
					} elseif ( 'block' === $op && $value > self::item( $room_id )['units'] ) {
						$r = new \WP_Error( 'units', __( 'You cannot mark more rooms unavailable than you have.', 'explore-katsina' ) );
					} else {
						$r = Availability::set_range( $room_id, $in['from'] ?? '', $in['to'] ?? ( $in['from'] ?? '' ), $op, $value );
					}
				}
				View::flash( is_wp_error( $r ) ? 'error' : 'ok', is_wp_error( $r ) ? $r->get_error_message() : __( 'Calendar updated.', 'explore-katsina' ), $uid );
				if ( ! is_wp_error( $r ) ) {
					self::warn_overbooked( $room_id, $uid );
				}
				return $back;
		}
		return $redirect;
	}

	/** A hotel room category or an event hall (both use the same calendar). */
	public static function item( $id ) {
		return Halls::get( $id ) ? Halls::data( $id ) : Rooms::data( $id );
	}

	/** Tell the owner if they closed or reduced dates that already have bookings. */
	private static function warn_overbooked( $room_id, $uid ) {
		global $wpdb;
		$room  = self::item( $room_id );
		$count = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}ek_nights WHERE item_id = %d AND night >= %s AND booked > 0 AND (closed = 1 OR booked + blocked > %d)",
				$room_id,
				Availability::today(),
				$room['units']
			)
		);
		if ( $count ) {
			/* translators: %d: nights */
			View::flash( 'warn', sprintf( _n( 'Careful: %d night now has more bookings than open rooms. Existing bookings are kept. Please make sure you can honour them.', 'Careful: %d nights now have more bookings than open rooms. Existing bookings are kept. Please make sure you can honour them.', $count, 'explore-katsina' ), $count ), $uid );
		}
	}

	private static function booking_action( $business_id, array $in, $uid ) {
		$b    = Booking::get( absint( $in['booking_id'] ?? 0 ) );
		$back = Dashboard::url( sanitize_key( $in['back'] ?? '' ) === 'orders' ? 'orders' : 'bookings', $business_id, array_filter( array( 'tab' => sanitize_key( $in['tab'] ?? '' ) ) ) );
		if ( ! $b || (int) $b->business_id !== (int) $business_id ) {
			wp_die( esc_html__( 'That booking belongs to another business.', 'explore-katsina' ), '', array( 'response' => 403 ) );
		}
		$r = Booking::transition( $b, sanitize_key( $in['to'] ?? '' ), $uid, sanitize_text_field( $in['note'] ?? '' ) );
		if ( is_wp_error( $r ) ) {
			View::flash( 'error', $r->get_error_message(), $uid );
		} else {
			/* translators: 1: code, 2: status */
			View::flash( 'ok', sprintf( __( 'Booking %1$s: %2$s.', 'explore-katsina' ), $b->code, Dashboard::booking_status_label( sanitize_key( $in['to'] ) ) ), $uid );
		}
		return $back;
	}
}
