<?php
/**
 * Hotel-specific details: stars, amenities, check-in/out, house rules,
 * cancellation policy and the payment options the hotel accepts.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Hotel {

	public static function amenities() {
		return array(
			'wifi'          => __( 'Free WiFi', 'explore-katsina' ),
			'parking'       => __( 'Parking', 'explore-katsina' ),
			'power'         => __( 'Generator / 24-hour power', 'explore-katsina' ),
			'ac'            => __( 'Air conditioning', 'explore-katsina' ),
			'pool'          => __( 'Swimming pool', 'explore-katsina' ),
			'restaurant'    => __( 'Restaurant', 'explore-katsina' ),
			'airport'       => __( 'Airport pickup', 'explore-katsina' ),
			'room_service'  => __( 'Room service', 'explore-katsina' ),
			'laundry'       => __( 'Laundry', 'explore-katsina' ),
			'conference'    => __( 'Conference / meeting room', 'explore-katsina' ),
			'gym'           => __( 'Gym', 'explore-katsina' ),
			'lounge'        => __( 'Lounge', 'explore-katsina' ),
			'prayer'        => __( 'Prayer room', 'explore-katsina' ),
			'security'      => __( '24-hour security / CCTV', 'explore-katsina' ),
			'accessible'    => __( 'Wheelchair accessible', 'explore-katsina' ),
			'family'        => __( 'Family rooms', 'explore-katsina' ),
		);
	}

	public static function room_amenities() {
		return array(
			'ac'        => __( 'Air conditioning', 'explore-katsina' ),
			'tv'        => __( 'TV', 'explore-katsina' ),
			'wifi'      => __( 'WiFi', 'explore-katsina' ),
			'fridge'    => __( 'Fridge', 'explore-katsina' ),
			'ensuite'   => __( 'Private bathroom', 'explore-katsina' ),
			'hot_water' => __( 'Hot water', 'explore-katsina' ),
			'wardrobe'  => __( 'Wardrobe', 'explore-katsina' ),
			'desk'      => __( 'Work desk', 'explore-katsina' ),
			'kettle'    => __( 'Kettle', 'explore-katsina' ),
			'breakfast' => __( 'Breakfast included', 'explore-katsina' ),
			'balcony'   => __( 'Balcony', 'explore-katsina' ),
			'sofa'      => __( 'Sitting area', 'explore-katsina' ),
		);
	}

	public static function bed_types() {
		return array(
			'single' => __( 'Single bed', 'explore-katsina' ),
			'double' => __( 'Double bed', 'explore-katsina' ),
			'queen'  => __( 'Queen bed', 'explore-katsina' ),
			'king'   => __( 'King bed', 'explore-katsina' ),
			'twin'   => __( 'Two single beds', 'explore-katsina' ),
			'family' => __( 'Double + single beds', 'explore-katsina' ),
		);
	}

	/**
	 * Cancellation policies. Machine-readable so refunds (Phase 6) follow them exactly.
	 * free_hours: free cancellation until this many hours before check-in (0 = never free).
	 * late_refund: % refunded when cancelling after that point.
	 */
	public static function policies() {
		return array(
			'flexible'       => array(
				'label'       => __( 'Flexible', 'explore-katsina' ),
				'text'        => __( 'Free cancellation until 24 hours before check-in. After that, the first night is charged.', 'explore-katsina' ),
				'free_hours'  => 24,
				'late_refund' => -1, // -1 = everything except the first night.
			),
			'moderate'       => array(
				'label'       => __( 'Moderate', 'explore-katsina' ),
				'text'        => __( 'Free cancellation until 5 days before check-in. After that, 50% is refunded.', 'explore-katsina' ),
				'free_hours'  => 120,
				'late_refund' => 50,
			),
			'strict'         => array(
				'label'       => __( 'Strict', 'explore-katsina' ),
				'text'        => __( '50% refund if cancelled at least 7 days before check-in. No refund after that.', 'explore-katsina' ),
				'free_hours'  => 0,
				'late_refund' => 0,
				'early_hours' => 168,
				'early_refund'=> 50,
			),
			'non_refundable' => array(
				'label'       => __( 'Non-refundable', 'explore-katsina' ),
				'text'        => __( 'No refund after booking. Usually paired with a lower price.', 'explore-katsina' ),
				'free_hours'  => 0,
				'late_refund' => 0,
			),
		);
	}

	public static function settings( $hotel_id ) {
		$g = static function ( $k, $d = '' ) use ( $hotel_id ) {
			$v = get_post_meta( $hotel_id, $k, true );
			return '' === $v ? $d : $v;
		};
		return array(
			'stars'          => (int) $g( '_ek_stars', 0 ),
			'stars_verified' => (bool) $g( '_ek_stars_verified', 0 ),
			'amenities'      => array_values( array_intersect( (array) $g( '_ek_amenities', array() ), array_keys( self::amenities() ) ) ),
			'checkin'        => (string) $g( '_ek_checkin', '14:00' ),
			'checkout'       => (string) $g( '_ek_checkout', '12:00' ),
			'house_rules'    => (string) $g( '_ek_house_rules', '' ),
			'policy'         => isset( self::policies()[ $g( '_ek_policy', 'moderate' ) ] ) ? $g( '_ek_policy', 'moderate' ) : 'moderate',
			'policy_note'    => (string) $g( '_ek_policy_note', '' ),
			'pay_full'       => (bool) $g( '_ek_pay_full', 1 ),
			'pay_deposit'    => (bool) $g( '_ek_pay_deposit', 0 ),
			'deposit_pct'    => max( 10, min( 90, (int) $g( '_ek_deposit_pct', 30 ) ) ),
			'pay_at_venue'   => (bool) $g( '_ek_pay_at_venue', 1 ),
		);
	}

	/** @return array{0: array, 1: array} */
	public static function validate( array $in ) {
		$e = array();
		$d = array(
			'stars'        => max( 0, min( 5, absint( $in['stars'] ?? 0 ) ) ),
			'amenities'    => array_values( array_intersect( array_map( 'sanitize_key', (array) ( $in['amenities'] ?? array() ) ), array_keys( self::amenities() ) ) ),
			'checkin'      => preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $in['checkin'] ?? '' ) ? $in['checkin'] : '14:00',
			'checkout'     => preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $in['checkout'] ?? '' ) ? $in['checkout'] : '12:00',
			'house_rules'  => sanitize_textarea_field( $in['house_rules'] ?? '' ),
			'policy'       => sanitize_key( $in['policy'] ?? '' ),
			'policy_note'  => sanitize_textarea_field( $in['policy_note'] ?? '' ),
			'pay_full'     => ! empty( $in['pay_full'] ),
			'pay_deposit'  => ! empty( $in['pay_deposit'] ),
			'deposit_pct'  => absint( $in['deposit_pct'] ?? 30 ),
			'pay_at_venue' => ! empty( $in['pay_at_venue'] ),
		);
		if ( ! isset( self::policies()[ $d['policy'] ] ) ) {
			$e['policy'] = __( 'Choose a cancellation policy.', 'explore-katsina' );
		}
		if ( ! $d['pay_full'] && ! $d['pay_deposit'] && ! $d['pay_at_venue'] ) {
			$e['payment'] = __( 'Choose at least one way for guests to pay.', 'explore-katsina' );
		}
		if ( $d['pay_deposit'] && ( $d['deposit_pct'] < 10 || $d['deposit_pct'] > 90 ) ) {
			$e['deposit_pct'] = __( 'The deposit must be between 10% and 90%.', 'explore-katsina' );
		}
		return array( $d, $e );
	}

	public static function save( $hotel_id, array $d ) {
		update_post_meta( $hotel_id, '_ek_stars', $d['stars'] );
		update_post_meta( $hotel_id, '_ek_amenities', $d['amenities'] );
		update_post_meta( $hotel_id, '_ek_checkin', $d['checkin'] );
		update_post_meta( $hotel_id, '_ek_checkout', $d['checkout'] );
		update_post_meta( $hotel_id, '_ek_house_rules', $d['house_rules'] );
		update_post_meta( $hotel_id, '_ek_policy', $d['policy'] );
		update_post_meta( $hotel_id, '_ek_policy_note', $d['policy_note'] );
		update_post_meta( $hotel_id, '_ek_pay_full', $d['pay_full'] ? 1 : 0 );
		update_post_meta( $hotel_id, '_ek_pay_deposit', $d['pay_deposit'] ? 1 : 0 );
		update_post_meta( $hotel_id, '_ek_deposit_pct', $d['deposit_pct'] );
		update_post_meta( $hotel_id, '_ek_pay_at_venue', $d['pay_at_venue'] ? 1 : 0 );
		// Changing self-declared stars removes the admin's "verified" mark.
		if ( (int) get_post_meta( $hotel_id, '_ek_stars_verified_value', true ) !== (int) $d['stars'] ) {
			delete_post_meta( $hotel_id, '_ek_stars_verified' );
		}
	}

	/** Payment choices offered to the guest, with amounts for a given total. */
	public static function payment_choices( $hotel_id, $total_kobo ) {
		$s   = self::settings( $hotel_id );
		$out = array();
		if ( $s['pay_full'] ) {
			$out['full'] = array(
				'label'  => __( 'Pay in full now (online)', 'explore-katsina' ),
				'now'    => (int) $total_kobo,
				'later'  => 0,
			);
		}
		if ( $s['pay_deposit'] ) {
			$dep            = (int) round( $total_kobo * $s['deposit_pct'] / 100 );
			$out['deposit'] = array(
				/* translators: %d: percent */
				'label' => sprintf( __( 'Pay a %d%% deposit now, the rest at the hotel', 'explore-katsina' ), $s['deposit_pct'] ),
				'now'   => $dep,
				'later' => (int) $total_kobo - $dep,
			);
		}
		if ( $s['pay_at_venue'] ) {
			$out['venue'] = array(
				'label' => __( 'Pay at the hotel', 'explore-katsina' ),
				'now'   => 0,
				'later' => (int) $total_kobo,
			);
		}
		return $out;
	}

	/** Lowest base price per night across active room categories (for cards and search). */
	public static function from_price( $hotel_id ) {
		$prices = array_filter( array_map( static fn( $r ) => $r['price'], Rooms::for_hotel( $hotel_id ) ) );
		return $prices ? min( $prices ) : 0;
	}
}
