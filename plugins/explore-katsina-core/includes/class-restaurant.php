<?php
/**
 * Restaurant details, table-reservation settings and (switched-off) online ordering settings.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Restaurant {

	public static function cuisines() {
		return array(
			'hausa'       => __( 'Hausa / Northern', 'explore-katsina' ),
			'nigerian'    => __( 'Nigerian', 'explore-katsina' ),
			'continental' => __( 'Continental', 'explore-katsina' ),
			'fast_food'   => __( 'Fast food', 'explore-katsina' ),
			'grills'      => __( 'Grills / Suya', 'explore-katsina' ),
			'cafe'        => __( 'Café', 'explore-katsina' ),
			'bakery'      => __( 'Bakery & pastries', 'explore-katsina' ),
			'chinese'     => __( 'Chinese', 'explore-katsina' ),
			'indian'      => __( 'Indian', 'explore-katsina' ),
			'lebanese'    => __( 'Lebanese / Middle Eastern', 'explore-katsina' ),
			'drinks'      => __( 'Juice, smoothies & drinks', 'explore-katsina' ),
		);
	}

	/** Price range per person for a typical meal. */
	public static function price_levels() {
		return array(
			1 => array( '₦', __( 'Under ₦3,000 per person', 'explore-katsina' ) ),
			2 => array( '₦₦', __( '₦3,000–₦7,000 per person', 'explore-katsina' ) ),
			3 => array( '₦₦₦', __( '₦7,000–₦15,000 per person', 'explore-katsina' ) ),
			4 => array( '₦₦₦₦', __( 'Over ₦15,000 per person', 'explore-katsina' ) ),
		);
	}

	public static function defaults() {
		return array(
			'cuisines'          => array(),
			'price_level'       => 2,
			'halal'             => 1,
			'dine_in'           => 1,
			'takeaway'          => 1,
			'delivery'          => 0,
			// Reservations.
			'res_enabled'       => 1,
			'capacity_mode'     => 'seats', // seats | tables.
			'capacity'          => 20,
			'slot_minutes'      => 60,
			'max_party'         => 10,
			'min_notice_hours'  => 2,
			'days_ahead'        => 60,
			'res_from'          => '',
			'res_to'            => '',
			'closed_dates'      => array(),
			'deposit_enabled'   => 0,
			'deposit_min_party' => 8,
			'deposit_per_guest' => 200000, // ₦2,000.
			// Online ordering (only used when switched on site-wide).
			'order_enabled'     => 0,
			'order_pickup'      => 1,
			'order_delivery'    => 0,
			'delivery_fee'      => 100000,
			'min_order'         => 0,
			'prep_minutes'      => 30,
			'order_pay_online'  => 1,
			'order_pay_cash'    => 1,
		);
	}

	public static function settings( $id ) {
		$saved = get_post_meta( (int) $id, '_ek_restaurant', true );
		$s     = array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
		$s['cuisines']     = array_values( array_intersect( (array) $s['cuisines'], array_keys( self::cuisines() ) ) );
		$s['closed_dates'] = array_values( array_filter( (array) $s['closed_dates'], array( Availability::class, 'valid_date' ) ) );
		return $s;
	}

	private static function time_or_blank( $v ) {
		return preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', (string) $v ) ? $v : '';
	}

	/** Validate one group of settings: details | tables | ordering. @return array{0: array, 1: array} */
	public static function validate( $group, array $in, array $current ) {
		$e = array();
		$d = $current;
		if ( 'details' === $group ) {
			$d['cuisines']    = array_values( array_intersect( array_map( 'sanitize_key', (array) ( $in['cuisines'] ?? array() ) ), array_keys( self::cuisines() ) ) );
			$d['price_level'] = max( 1, min( 4, absint( $in['price_level'] ?? 2 ) ) );
			$d['halal']       = ! empty( $in['halal'] ) ? 1 : 0;
			$d['dine_in']     = ! empty( $in['dine_in'] ) ? 1 : 0;
			$d['takeaway']    = ! empty( $in['takeaway'] ) ? 1 : 0;
			$d['delivery']    = ! empty( $in['delivery'] ) ? 1 : 0;
			if ( ! $d['cuisines'] ) {
				$e['cuisines'] = __( 'Choose at least one type of food.', 'explore-katsina' );
			}
		} elseif ( 'tables' === $group ) {
			$d['res_enabled']       = ! empty( $in['res_enabled'] ) ? 1 : 0;
			$d['capacity_mode']     = 'tables' === ( $in['capacity_mode'] ?? '' ) ? 'tables' : 'seats';
			$d['capacity']          = absint( $in['capacity'] ?? 0 );
			$d['slot_minutes']      = in_array( absint( $in['slot_minutes'] ?? 60 ), array( 30, 45, 60, 90, 120, 150, 180 ), true ) ? absint( $in['slot_minutes'] ) : 60;
			$d['max_party']         = absint( $in['max_party'] ?? 0 );
			$d['min_notice_hours']  = min( 72, absint( $in['min_notice_hours'] ?? 2 ) );
			$d['days_ahead']        = max( 1, min( 365, absint( $in['days_ahead'] ?? 60 ) ) );
			$d['res_from']          = self::time_or_blank( $in['res_from'] ?? '' );
			$d['res_to']            = self::time_or_blank( $in['res_to'] ?? '' );
			$dates                  = preg_split( '/[\s,]+/', (string) ( $in['closed_dates'] ?? '' ), -1, PREG_SPLIT_NO_EMPTY );
			$d['closed_dates']      = array_values( array_unique( array_filter( $dates, array( Availability::class, 'valid_date' ) ) ) );
			sort( $d['closed_dates'] );
			$d['deposit_enabled']   = ! empty( $in['deposit_enabled'] ) ? 1 : 0;
			$d['deposit_min_party'] = absint( $in['deposit_min_party'] ?? 8 );
			$d['deposit_per_guest'] = Money::to_kobo( $in['deposit_per_guest'] ?? '' );
			if ( $d['capacity'] < 1 || $d['capacity'] > 1000 ) {
				$e['capacity'] = __( 'How many seats (or tables) can you take per time slot? (1–1000)', 'explore-katsina' );
			}
			if ( $d['max_party'] < 1 || $d['max_party'] > 200 ) {
				$e['max_party'] = __( 'Largest group you accept online (1–200).', 'explore-katsina' );
			}
			if ( 'seats' === $d['capacity_mode'] && $d['max_party'] > $d['capacity'] ) {
				$e['max_party'] = __( 'The largest group cannot be bigger than your seats per slot.', 'explore-katsina' );
			}
			if ( ( $d['res_from'] && ! $d['res_to'] ) || ( ! $d['res_from'] && $d['res_to'] ) || ( $d['res_from'] && $d['res_to'] <= $d['res_from'] ) ) {
				$e['res_from'] = __( 'Give both a start and an end time, or leave both empty to use your opening hours.', 'explore-katsina' );
			}
			if ( $d['deposit_enabled'] && ( $d['deposit_per_guest'] < 10000 || $d['deposit_min_party'] < 2 ) ) {
				$e['deposit'] = __( 'Set the group size (2 or more) and a deposit of at least ₦100 per guest.', 'explore-katsina' );
			}
		} elseif ( 'ordering' === $group ) {
			$d['order_enabled']    = ! empty( $in['order_enabled'] ) ? 1 : 0;
			$d['order_pickup']     = ! empty( $in['order_pickup'] ) ? 1 : 0;
			$d['order_delivery']   = ! empty( $in['order_delivery'] ) ? 1 : 0;
			$d['delivery_fee']     = Money::to_kobo( $in['delivery_fee'] ?? '' );
			$d['min_order']        = Money::to_kobo( $in['min_order'] ?? '' );
			$d['prep_minutes']     = max( 5, min( 240, absint( $in['prep_minutes'] ?? 30 ) ) );
			$d['order_pay_online'] = ! empty( $in['order_pay_online'] ) ? 1 : 0;
			$d['order_pay_cash']   = ! empty( $in['order_pay_cash'] ) ? 1 : 0;
			if ( $d['order_enabled'] && ! $d['order_pickup'] && ! $d['order_delivery'] ) {
				$e['order'] = __( 'Choose pickup, delivery or both.', 'explore-katsina' );
			}
			if ( $d['order_enabled'] && ! $d['order_pay_online'] && ! $d['order_pay_cash'] ) {
				$e['order'] = __( 'Choose at least one way to pay.', 'explore-katsina' );
			}
		}
		return array( $d, $e );
	}

	public static function save( $id, array $s ) {
		update_post_meta( (int) $id, '_ek_restaurant', $s );
	}

	/** Online food ordering is OFF site-wide until the owner switches it on in Settings. */
	public static function ordering_on_sitewide() {
		return (bool) Settings::get( 'food_ordering_enabled' );
	}

	public static function ordering_open( $id ) {
		return self::ordering_on_sitewide() && ! empty( self::settings( $id )['order_enabled'] ) && Menu::has_available_items( $id );
	}

	/** Deposit (kobo) required for a party, or 0. */
	public static function deposit_for( $id, $party ) {
		$s = self::settings( $id );
		return ( $s['deposit_enabled'] && $party >= $s['deposit_min_party'] ) ? (int) $s['deposit_per_guest'] * (int) $party : 0;
	}
}
