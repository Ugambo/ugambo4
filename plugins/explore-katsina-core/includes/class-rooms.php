<?php
/**
 * Room categories (e.g. Standard, Deluxe, Suite). Each belongs to one hotel
 * (post_parent) and is owned by the hotel's owner.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Rooms {

	const CPT = 'ek_room';

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
					'name'          => __( 'Room categories', 'explore-katsina' ),
					'singular_name' => __( 'Room category', 'explore-katsina' ),
				),
				'public'       => false,
				'show_ui'      => true,
				'show_in_menu' => 'edit.php?post_type=' . Post_Types::BUSINESS,
				'show_in_rest' => false,
				'supports'     => array( 'title', 'editor', 'page-attributes' ),
				'hierarchical' => false,
			)
		);
	}

	public static function get( $room_id ) {
		$p = get_post( (int) $room_id );
		return ( $p && self::CPT === $p->post_type ) ? $p : null;
	}

	/** The room belongs to this hotel (used for every dashboard action). */
	public static function belongs_to( $room_id, $hotel_id ) {
		$p = self::get( $room_id );
		return $p && (int) $p->post_parent === (int) $hotel_id;
	}

	public static function data( $room_id ) {
		$p = self::get( $room_id );
		if ( ! $p ) {
			return array();
		}
		$id = $p->ID;
		return array(
			'id'            => $id,
			'hotel_id'      => (int) $p->post_parent,
			'name'          => $p->post_title,
			'description'   => $p->post_content,
			'active'        => 'publish' === $p->post_status,
			'price'         => (int) get_post_meta( $id, '_ek_price', true ),
			'weekend_price' => (int) get_post_meta( $id, '_ek_weekend_price', true ),
			'units'         => (int) get_post_meta( $id, '_ek_units', true ),
			'max_guests'    => max( 1, (int) get_post_meta( $id, '_ek_max_guests', true ) ),
			'bed'           => (string) get_post_meta( $id, '_ek_bed', true ),
			'size'          => (int) get_post_meta( $id, '_ek_size', true ),
			'amenities'     => (array) get_post_meta( $id, '_ek_room_amenities', true ),
			'photos'        => array_values( array_filter( array_map( 'intval', (array) get_post_meta( $id, '_ek_gallery', true ) ) ) ),
			'order'         => (int) $p->menu_order,
		);
	}

	/** @return array[] Active room categories (or all, for the owner). */
	public static function for_hotel( $hotel_id, $include_inactive = false ) {
		$posts = get_posts(
			array(
				'post_type'      => self::CPT,
				'post_parent'    => (int) $hotel_id,
				'post_status'    => $include_inactive ? array( 'publish', 'draft' ) : 'publish',
				'posts_per_page' => 50,
				'orderby'        => array( 'menu_order' => 'ASC', 'ID' => 'ASC' ),
				'no_found_rows'  => true,
			)
		);
		return array_map( static fn( $p ) => self::data( $p->ID ), $posts );
	}

	/** @return array{0: array, 1: array} */
	public static function validate( array $in ) {
		$e = array();
		$d = array(
			'name'          => sanitize_text_field( $in['room_name'] ?? '' ),
			'description'   => sanitize_textarea_field( $in['room_description'] ?? '' ),
			'price'         => Money::to_kobo( $in['price'] ?? '' ),
			'weekend_price' => Money::to_kobo( $in['weekend_price'] ?? '' ),
			'units'         => absint( $in['units'] ?? 0 ),
			'max_guests'    => absint( $in['max_guests'] ?? 0 ),
			'bed'           => sanitize_key( $in['bed'] ?? '' ),
			'size'          => absint( $in['size'] ?? 0 ),
			'amenities'     => array_values( array_intersect( array_map( 'sanitize_key', (array) ( $in['room_amenities'] ?? array() ) ), array_keys( Hotel::room_amenities() ) ) ),
			'active'        => ! empty( $in['active'] ),
		);
		if ( mb_strlen( $d['name'] ) < 2 || mb_strlen( $d['name'] ) > 80 ) {
			$e['room_name'] = __( 'Name the room category, e.g. Standard, Deluxe, Executive, Suite.', 'explore-katsina' );
		}
		if ( $d['price'] < 100000 || $d['price'] > 1000000000 ) {
			$e['price'] = __( 'Enter the price per night in Naira (at least ₦1,000).', 'explore-katsina' );
		}
		if ( $d['weekend_price'] && $d['weekend_price'] < 100000 ) {
			$e['weekend_price'] = __( 'Enter a weekend price of at least ₦1,000, or leave it empty.', 'explore-katsina' );
		}
		if ( $d['units'] < 1 || $d['units'] > 500 ) {
			$e['units'] = __( 'How many rooms of this type do you have? (1–500)', 'explore-katsina' );
		}
		if ( $d['max_guests'] < 1 || $d['max_guests'] > 20 ) {
			$e['max_guests'] = __( 'Maximum guests per room (1–20).', 'explore-katsina' );
		}
		if ( ! isset( Hotel::bed_types()[ $d['bed'] ] ) ) {
			$e['bed'] = __( 'Choose the bed type.', 'explore-katsina' );
		}
		if ( $d['size'] > 1000 ) {
			$e['size'] = __( 'Room size looks too large (square metres).', 'explore-katsina' );
		}
		return array( $d, $e );
	}

	/** Create (room_id 0) or update a room category. */
	public static function save( $hotel_id, $room_id, array $d ) {
		$args = array(
			'post_type'    => self::CPT,
			'post_parent'  => (int) $hotel_id,
			'post_author'  => Business::owner_id( $hotel_id ),
			'post_title'   => $d['name'],
			'post_content' => $d['description'],
			'post_status'  => $d['active'] ? 'publish' : 'draft',
		);
		if ( $room_id ) {
			$args['ID'] = (int) $room_id;
			$id         = wp_update_post( $args, true );
		} else {
			$args['menu_order'] = count( self::for_hotel( $hotel_id, true ) );
			$id                 = wp_insert_post( $args, true );
		}
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		foreach ( array( 'price' => '_ek_price', 'weekend_price' => '_ek_weekend_price', 'units' => '_ek_units', 'max_guests' => '_ek_max_guests', 'bed' => '_ek_bed', 'size' => '_ek_size', 'amenities' => '_ek_room_amenities' ) as $k => $meta ) {
			update_post_meta( $id, $meta, $d[ $k ] );
		}
		return (int) $id;
	}

	/** Rooms still booked in the future (used to protect against deleting them). */
	public static function future_bookings( $room_id ) {
		global $wpdb;
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}ek_bookings WHERE item_id = %d AND kind = 'hotel' AND end_date >= %s AND status IN ('pending_payment','new','confirmed','checked_in')",
				$room_id,
				Availability::today()
			)
		);
	}
}
