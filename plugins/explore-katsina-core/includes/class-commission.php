<?php
/**
 * Commission rates: a setting per business type, optionally overridden per business
 * (full settings screen in Phase 7). Stored in basis points: 1000 = 10%.
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

	public static function percent( $bp ) {
		return rtrim( rtrim( number_format( $bp / 100, 2 ), '0' ), '.' ) . '%';
	}
}
