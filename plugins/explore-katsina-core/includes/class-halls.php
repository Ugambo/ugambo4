<?php
/**
 * Halls / spaces at an event centre. Each hall is one bookable unit per day and uses the
 * same availability calendar and price rules as hotel rooms (weekend price, peak prices,
 * closed dates).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Halls {

	const CPT = 'ek_hall';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 5 );
	}

	public static function register() {
		if ( post_type_exists( self::CPT ) ) {
			return;
		}
		register_post_type(
			self::CPT,
			array(
				'labels'       => array(
					'name'          => __( 'Halls', 'explore-katsina' ),
					'singular_name' => __( 'Hall', 'explore-katsina' ),
				),
				'public'       => false,
				'show_ui'      => true,
				'show_in_menu' => 'edit.php?post_type=' . Post_Types::BUSINESS,
				'show_in_rest' => false,
				'supports'     => array( 'title', 'editor', 'page-attributes' ),
			)
		);
	}

	public static function get( $id ) {
		$p = get_post( (int) $id );
		return ( $p && self::CPT === $p->post_type ) ? $p : null;
	}

	public static function belongs_to( $hall_id, $venue_id ) {
		$p = self::get( $hall_id );
		return $p && (int) $p->post_parent === (int) $venue_id;
	}

	/** Same keys as a room (id, price, weekend_price, units, active) so Availability can use it. */
	public static function data( $hall_id ) {
		$p = self::get( $hall_id );
		if ( ! $p ) {
			return array();
		}
		$id = $p->ID;
		return array(
			'id'                => $id,
			'venue_id'          => (int) $p->post_parent,
			'hotel_id'          => (int) $p->post_parent,
			'name'              => $p->post_title,
			'description'       => $p->post_content,
			'active'            => 'publish' === $p->post_status,
			'price'             => (int) get_post_meta( $id, '_ek_price', true ),
			'weekend_price'     => (int) get_post_meta( $id, '_ek_weekend_price', true ),
			'pricing'           => 'event' === get_post_meta( $id, '_ek_pricing', true ) ? 'event' : 'day',
			'capacity_seated'   => (int) get_post_meta( $id, '_ek_cap_seated', true ),
			'capacity_standing' => (int) get_post_meta( $id, '_ek_cap_standing', true ),
			'setting'           => (string) get_post_meta( $id, '_ek_setting', true ),
			'units'             => 1,
			'photos'            => array_values( array_filter( array_map( 'intval', (array) get_post_meta( $id, '_ek_gallery', true ) ) ) ),
		);
	}

	public static function for_venue( $venue_id, $include_inactive = false ) {
		$posts = get_posts(
			array(
				'post_type'      => self::CPT,
				'post_parent'    => (int) $venue_id,
				'post_status'    => $include_inactive ? array( 'publish', 'draft' ) : 'publish',
				'posts_per_page' => 50,
				'orderby'        => array( 'menu_order' => 'ASC', 'ID' => 'ASC' ),
				'no_found_rows'  => true,
			)
		);
		return array_map( static fn( $p ) => self::data( $p->ID ), $posts );
	}

	public static function settings_labels() {
		return array(
			'indoor'  => __( 'Indoor', 'explore-katsina' ),
			'outdoor' => __( 'Outdoor', 'explore-katsina' ),
			'both'    => __( 'Indoor and outdoor', 'explore-katsina' ),
		);
	}

	/** @return array{0: array, 1: array} */
	public static function validate( array $in ) {
		$e = array();
		$d = array(
			'name'              => sanitize_text_field( $in['hall_name'] ?? '' ),
			'description'       => sanitize_textarea_field( $in['hall_description'] ?? '' ),
			'price'             => Money::to_kobo( $in['price'] ?? '' ),
			'weekend_price'     => Money::to_kobo( $in['weekend_price'] ?? '' ),
			'pricing'           => 'event' === ( $in['pricing'] ?? '' ) ? 'event' : 'day',
			'capacity_seated'   => absint( $in['capacity_seated'] ?? 0 ),
			'capacity_standing' => absint( $in['capacity_standing'] ?? 0 ),
			'setting'           => sanitize_key( $in['setting'] ?? '' ),
			'active'            => ! empty( $in['active'] ),
		);
		if ( mb_strlen( $d['name'] ) < 2 || mb_strlen( $d['name'] ) > 80 ) {
			$e['hall_name'] = __( 'Name the hall or space, e.g. Main Hall, Garden.', 'explore-katsina' );
		}
		if ( $d['price'] < 500000 || $d['price'] > 10000000000 ) {
			$e['price'] = __( 'Enter the price in Naira (at least ₦5,000).', 'explore-katsina' );
		}
		if ( $d['weekend_price'] && $d['weekend_price'] < 500000 ) {
			$e['weekend_price'] = __( 'Enter a weekend price of at least ₦5,000, or leave it empty.', 'explore-katsina' );
		}
		if ( $d['capacity_seated'] < 1 && $d['capacity_standing'] < 1 ) {
			$e['capacity_seated'] = __( 'Enter how many guests the hall holds (seated and/or standing).', 'explore-katsina' );
		}
		if ( $d['capacity_seated'] > 50000 || $d['capacity_standing'] > 50000 ) {
			$e['capacity_seated'] = __( 'That capacity looks too large.', 'explore-katsina' );
		}
		if ( ! isset( self::settings_labels()[ $d['setting'] ] ) ) {
			$e['setting'] = __( 'Choose indoor, outdoor or both.', 'explore-katsina' );
		}
		return array( $d, $e );
	}

	public static function save( $venue_id, $hall_id, array $d ) {
		$args = array(
			'post_type'    => self::CPT,
			'post_parent'  => (int) $venue_id,
			'post_author'  => Business::owner_id( $venue_id ),
			'post_title'   => $d['name'],
			'post_content' => $d['description'],
			'post_status'  => $d['active'] ? 'publish' : 'draft',
		);
		if ( $hall_id ) {
			$args['ID'] = (int) $hall_id;
			$id         = wp_update_post( $args, true );
		} else {
			$args['menu_order'] = count( self::for_venue( $venue_id, true ) );
			$id                 = wp_insert_post( $args, true );
		}
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		foreach ( array( 'price' => '_ek_price', 'weekend_price' => '_ek_weekend_price', 'pricing' => '_ek_pricing', 'capacity_seated' => '_ek_cap_seated', 'capacity_standing' => '_ek_cap_standing', 'setting' => '_ek_setting' ) as $k => $meta ) {
			update_post_meta( $id, $meta, $d[ $k ] );
		}
		return (int) $id;
	}

	public static function future_bookings( $hall_id ) {
		global $wpdb;
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}ek_bookings WHERE item_id = %d AND kind = 'event' AND end_date >= %s AND status IN ('pending_payment','requested','confirmed','deposit_paid')",
				$hall_id,
				Availability::today()
			)
		);
	}

	/** Lowest price across active halls. */
	public static function from_price( $venue_id ) {
		$p = array_filter( wp_list_pluck( self::for_venue( $venue_id ), 'price' ) );
		return $p ? min( $p ) : 0;
	}
}
