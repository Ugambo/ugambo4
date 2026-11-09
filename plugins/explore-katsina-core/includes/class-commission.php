<?php
/**
 * Commission rates: a setting per business type (wp-admin → Explore Katsina → Settings),
 * optionally overridden per business (on the business's admin page). Stored in basis points:
 * 1000 = 10%. Each booking keeps the rate it was made at, so changes only affect new bookings.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Commission {

	public static function rate_bp( $business_id, $kind ) {
		$override = get_post_meta( (int) $business_id, '_ek_commission_bp', true );
		if ( '' !== $override && null !== $override ) {
			return max( 0, min( 5000, (int) $override ) );
		}
		$rates = (array) Settings::get( 'commission_bp' );
		return max( 0, (int) ( $rates[ $kind ] ?? 0 ) );
	}

	/** What each rate applies to. */
	public static function labels() {
		return array(
			'hotel'             => __( 'Hotel bookings', 'explore-katsina' ),
			'event-centre'      => __( 'Event centre deposits', 'explore-katsina' ),
			'tour-operator'     => __( 'Tour operator bookings', 'explore-katsina' ),
			'restaurant'        => __( 'Restaurant table reservations (deposits)', 'explore-katsina' ),
			'restaurant_orders' => __( 'Restaurant online food orders', 'explore-katsina' ),
		);
	}

	/** Rates that apply to a business (its override, or the defaults for its type). */
	public static function for_business( $business_id ) {
		$type = Business::type_of( $business_id );
		$keys = 'restaurant' === $type ? array( 'restaurant', 'restaurant_orders' ) : array( $type );
		$out  = array();
		foreach ( $keys as $k ) {
			if ( isset( self::labels()[ $k ] ) ) {
				$out[ $k ] = self::rate_bp( $business_id, $k );
			}
		}
		return $out;
	}

	public static function has_override( $business_id ) {
		$v = get_post_meta( (int) $business_id, '_ek_commission_bp', true );
		return '' !== $v && null !== $v;
	}

	public static function percent( $bp ) {
		return rtrim( rtrim( number_format( $bp / 100, 2 ), '0' ), '.' ) . '%';
	}
}
