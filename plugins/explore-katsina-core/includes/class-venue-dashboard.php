<?php
/**
 * Event centre dashboard sections: Venue details, Halls, Calendar & prices (shared with hotels).
 * Ownership of $business_id is already checked by Dashboard::handle(); hall IDs are checked again here.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Venue_Dashboard {

	public static $errors = array();
	public static $values = array();

	public static function init() {
		add_filter( 'ek_dashboard_sections', array( __CLASS__, 'sections' ), 10, 2 );
		add_filter( 'ek_dashboard_action', array( __CLASS__, 'action' ), 10, 5 );
	}

	public static function sections( $s, $type ) {
		if ( 'event-centre' !== $type ) {
			return $s;
		}
		$out = array();
		foreach ( $s as $k => $label ) {
			$out[ $k ] = $label;
			if ( 'profile' === $k ) {
				$out['venue']    = __( 'Venue details', 'explore-katsina' );
				$out['halls']    = __( 'Halls', 'explore-katsina' );
				$out['calendar'] = __( 'Calendar & prices', 'explore-katsina' );
			}
		}
		return $out;
	}

	public static function action( $redirect, $action, $business_id, array $in, $uid ) {
		if ( 'event-centre' !== Business::type_of( $business_id ) ) {
			return $redirect;
		}
		switch ( $action ) {
			case 'dash_venue':
				list( $d, $e ) = Venue::validate( $in );
				if ( $e ) {
					self::$errors = $e;
					self::$values = $in;
					return null;
				}
				Venue::save( $business_id, $d );
				View::flash( 'ok', __( 'Venue details saved.', 'explore-katsina' ), $uid );
				return Dashboard::url( 'venue', $business_id );

			case 'dash_hall':
				$hall_id = absint( $in['hall_id'] ?? 0 );
				if ( $hall_id && ! Halls::belongs_to( $hall_id, $business_id ) ) {
					wp_die( esc_html__( 'That hall belongs to another venue.', 'explore-katsina' ), '', array( 'response' => 403 ) );
				}
				list( $d, $e ) = Halls::validate( $in );
				if ( $e ) {
					self::$errors = $e;
					self::$values = $in;
					return null;
				}
				$id = Halls::save( $business_id, $hall_id, $d );
				if ( is_wp_error( $id ) ) {
					View::flash( 'error', $id->get_error_message(), $uid );
					return Dashboard::url( 'halls', $business_id );
				}
				$photos = Halls::data( $id )['photos'];
				foreach ( array_map( 'absint', (array) ( $in['remove_photo'] ?? array() ) ) as $pid ) {
					if ( in_array( $pid, $photos, true ) && (int) get_post_meta( $pid, '_ek_hall_photo', true ) === $id ) {
						wp_delete_attachment( $pid, true );
						$photos = array_values( array_diff( $photos, array( $pid ) ) );
					}
				}
				$up = Photos::upload_many( 'hall_photos', $business_id, max( 0, 6 - count( $photos ) ) );
				foreach ( $up['ids'] as $pid ) {
					update_post_meta( $pid, '_ek_hall_photo', $id );
				}
				update_post_meta( $id, '_ek_gallery', array_merge( $photos, $up['ids'] ) );
				foreach ( $up['errors'] as $m ) {
					View::flash( 'warn', $m, $uid );
				}
				View::flash( 'ok', $hall_id ? __( 'Hall saved.', 'explore-katsina' ) : __( 'Hall added. Next, check its calendar and prices.', 'explore-katsina' ), $uid );
				return Dashboard::url( 'halls', $business_id );

			case 'dash_hall_delete':
				$hall_id = absint( $in['hall_id'] ?? 0 );
				if ( ! Halls::belongs_to( $hall_id, $business_id ) ) {
					wp_die( esc_html__( 'That hall belongs to another venue.', 'explore-katsina' ), '', array( 'response' => 403 ) );
				}
				if ( Halls::future_bookings( $hall_id ) ) {
					View::flash( 'error', __( 'This hall has upcoming bookings, so it cannot be deleted. Switch it off instead.', 'explore-katsina' ), $uid );
				} else {
					foreach ( Halls::data( $hall_id )['photos'] as $pid ) {
						wp_delete_attachment( $pid, true );
					}
					wp_trash_post( $hall_id );
					View::flash( 'ok', __( 'Hall deleted.', 'explore-katsina' ), $uid );
				}
				return Dashboard::url( 'halls', $business_id );
		}
		return $redirect;
	}
}
