<?php
/**
 * Restaurant menus: categories (e.g. Rice dishes, Soups & Swallow, Grills, Drinks) and items.
 * Every write checks that the category/item belongs to the restaurant passed in.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Menu {

	private static function t( $name ) {
		global $wpdb;
		return $wpdb->prefix . 'ek_menu_' . $name;
	}

	public static function categories( $business_id ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . self::t( 'categories' ) . ' WHERE business_id = %d ORDER BY position, id', $business_id ) ); // phpcs:ignore
	}

	public static function items( $business_id, $only_available = false ) {
		global $wpdb;
		$extra = $only_available ? ' AND available = 1' : '';
		return $wpdb->get_results( $wpdb->prepare( 'SELECT * FROM ' . self::t( 'items' ) . " WHERE business_id = %d{$extra} ORDER BY position, id", $business_id ) ); // phpcs:ignore
	}

	/** Categories with their items, for display. */
	public static function full( $business_id ) {
		$cats  = self::categories( $business_id );
		$items = self::items( $business_id );
		$out   = array();
		foreach ( $cats as $c ) {
			$c->items         = array();
			$out[ (int) $c->id ] = $c;
		}
		foreach ( $items as $i ) {
			if ( isset( $out[ (int) $i->category_id ] ) ) {
				$out[ (int) $i->category_id ]->items[] = $i;
			}
		}
		return array_values( $out );
	}

	public static function has_available_items( $business_id ) {
		global $wpdb;
		return (bool) $wpdb->get_var( $wpdb->prepare( 'SELECT id FROM ' . self::t( 'items' ) . ' WHERE business_id = %d AND available = 1 LIMIT 1', $business_id ) ); // phpcs:ignore
	}

	public static function category( $id, $business_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::t( 'categories' ) . ' WHERE id = %d AND business_id = %d', $id, $business_id ) ); // phpcs:ignore
	}

	public static function item( $id, $business_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::t( 'items' ) . ' WHERE id = %d AND business_id = %d', $id, $business_id ) ); // phpcs:ignore
	}

	/** Lowest and highest item prices (for cards). */
	public static function price_span( $business_id ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( 'SELECT MIN(price_kobo) lo, MAX(price_kobo) hi, COUNT(*) n FROM ' . self::t( 'items' ) . ' WHERE business_id = %d AND available = 1', $business_id ) ); // phpcs:ignore
		return array( (int) $r->lo, (int) $r->hi, (int) $r->n );
	}

	/* ---------------- Writing ---------------- */

	public static function add_category( $business_id, $name ) {
		global $wpdb;
		$name = mb_substr( sanitize_text_field( $name ), 0, 100 );
		if ( mb_strlen( $name ) < 2 ) {
			return new \WP_Error( 'name', __( 'Name the menu category, e.g. Rice dishes.', 'explore-katsina' ) );
		}
		$pos = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COALESCE(MAX(position),0)+1 FROM ' . self::t( 'categories' ) . ' WHERE business_id = %d', $business_id ) ); // phpcs:ignore
		$wpdb->insert( self::t( 'categories' ), array( 'business_id' => (int) $business_id, 'name' => $name, 'position' => $pos ) );
		return (int) $wpdb->insert_id;
	}

	public static function rename_category( $id, $business_id, $name ) {
		global $wpdb;
		$name = mb_substr( sanitize_text_field( $name ), 0, 100 );
		if ( mb_strlen( $name ) < 2 || ! self::category( $id, $business_id ) ) {
			return new \WP_Error( 'name', __( 'Enter a category name.', 'explore-katsina' ) );
		}
		$wpdb->update( self::t( 'categories' ), array( 'name' => $name ), array( 'id' => (int) $id, 'business_id' => (int) $business_id ) );
		return true;
	}

	public static function delete_category( $id, $business_id ) {
		global $wpdb;
		if ( ! self::category( $id, $business_id ) ) {
			return new \WP_Error( 'missing', __( 'Category not found.', 'explore-katsina' ) );
		}
		$has = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COUNT(*) FROM ' . self::t( 'items' ) . ' WHERE category_id = %d', $id ) ); // phpcs:ignore
		if ( $has ) {
			return new \WP_Error( 'not_empty', __( 'Move or delete the dishes in this category first.', 'explore-katsina' ) );
		}
		$wpdb->delete( self::t( 'categories' ), array( 'id' => (int) $id, 'business_id' => (int) $business_id ) );
		return true;
	}

	/** @return array{0: array, 1: array} */
	public static function validate_item( array $in, $business_id ) {
		$e = array();
		$d = array(
			'name'        => mb_substr( sanitize_text_field( $in['item_name'] ?? '' ), 0, 120 ),
			'description' => mb_substr( sanitize_textarea_field( $in['item_description'] ?? '' ), 0, 500 ),
			'price_kobo'  => Money::to_kobo( $in['item_price'] ?? '' ),
			'category_id' => absint( $in['category_id'] ?? 0 ),
			'available'   => ! empty( $in['available'] ) ? 1 : 0,
		);
		if ( mb_strlen( $d['name'] ) < 2 ) {
			$e['item_name'] = __( 'Enter the dish name.', 'explore-katsina' );
		}
		if ( $d['price_kobo'] < 1000 || $d['price_kobo'] > 100000000 ) {
			$e['item_price'] = __( 'Enter the price in Naira.', 'explore-katsina' );
		}
		if ( ! self::category( $d['category_id'], $business_id ) ) {
			$e['category_id'] = __( 'Choose a menu category.', 'explore-katsina' );
		}
		return array( $d, $e );
	}

	public static function save_item( $business_id, $item_id, array $d ) {
		global $wpdb;
		if ( $item_id ) {
			if ( ! self::item( $item_id, $business_id ) ) {
				return new \WP_Error( 'missing', __( 'Dish not found.', 'explore-katsina' ) );
			}
			$wpdb->update( self::t( 'items' ), $d, array( 'id' => (int) $item_id, 'business_id' => (int) $business_id ) );
			return (int) $item_id;
		}
		$d['business_id'] = (int) $business_id;
		$d['position']    = (int) $wpdb->get_var( $wpdb->prepare( 'SELECT COALESCE(MAX(position),0)+1 FROM ' . self::t( 'items' ) . ' WHERE category_id = %d', $d['category_id'] ) ); // phpcs:ignore
		$d['created_at']  = current_time( 'mysql', true );
		$wpdb->insert( self::t( 'items' ), $d );
		return (int) $wpdb->insert_id;
	}

	public static function set_photo( $item_id, $business_id, $photo_id ) {
		global $wpdb;
		$item = self::item( $item_id, $business_id );
		if ( $item && $item->photo_id && (int) $item->photo_id !== (int) $photo_id ) {
			wp_delete_attachment( (int) $item->photo_id, true );
		}
		$wpdb->update( self::t( 'items' ), array( 'photo_id' => (int) $photo_id ), array( 'id' => (int) $item_id, 'business_id' => (int) $business_id ) );
	}

	public static function toggle( $item_id, $business_id ) {
		global $wpdb;
		$item = self::item( $item_id, $business_id );
		if ( ! $item ) {
			return new \WP_Error( 'missing', __( 'Dish not found.', 'explore-katsina' ) );
		}
		$wpdb->update( self::t( 'items' ), array( 'available' => $item->available ? 0 : 1 ), array( 'id' => (int) $item_id ) );
		return ! $item->available;
	}

	public static function delete_item( $item_id, $business_id ) {
		global $wpdb;
		$item = self::item( $item_id, $business_id );
		if ( ! $item ) {
			return new \WP_Error( 'missing', __( 'Dish not found.', 'explore-katsina' ) );
		}
		if ( $item->photo_id ) {
			wp_delete_attachment( (int) $item->photo_id, true );
		}
		$wpdb->delete( self::t( 'items' ), array( 'id' => (int) $item_id ) );
		return true;
	}

	/** Move a category or item up/down within its list. */
	public static function move( $kind, $id, $business_id, $dir ) {
		global $wpdb;
		$table = 'item' === $kind ? self::t( 'items' ) : self::t( 'categories' );
		$row   = 'item' === $kind ? self::item( $id, $business_id ) : self::category( $id, $business_id );
		if ( ! $row ) {
			return new \WP_Error( 'missing', __( 'Not found.', 'explore-katsina' ) );
		}
		$scope = 'item' === $kind ? $wpdb->prepare( 'category_id = %d', $row->category_id ) : $wpdb->prepare( 'business_id = %d', $business_id );
		$ids   = $wpdb->get_col( "SELECT id FROM {$table} WHERE {$scope} ORDER BY position, id" ); // phpcs:ignore
		$i     = array_search( (string) $id, $ids, true );
		$j     = 'up' === $dir ? $i - 1 : $i + 1;
		if ( false === $i || $j < 0 || $j >= count( $ids ) ) {
			return true;
		}
		list( $ids[ $i ], $ids[ $j ] ) = array( $ids[ $j ], $ids[ $i ] );
		foreach ( $ids as $pos => $rid ) {
			$wpdb->update( $table, array( 'position' => $pos ), array( 'id' => (int) $rid ) );
		}
		return true;
	}
}
