<?php
/**
 * Restaurant dashboard sections: Restaurant details, Menu, Table reservations,
 * and Online orders (only when ordering is switched on site-wide).
 *
 * Ownership of $business_id is already checked by Dashboard::handle(); every menu
 * category/item ID is checked again against the business in Menu::*.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Restaurant_Dashboard {

	public static $errors = array();
	public static $values = array();
	public static $group  = '';

	public static function init() {
		add_filter( 'ek_dashboard_sections', array( __CLASS__, 'sections' ), 10, 2 );
		add_filter( 'ek_dashboard_action', array( __CLASS__, 'action' ), 10, 5 );
	}

	public static function sections( $s, $type ) {
		if ( 'restaurant' !== $type ) {
			return $s;
		}
		$out = array();
		foreach ( $s as $k => $label ) {
			$out[ $k ] = $label;
			if ( 'profile' === $k ) {
				$out['restaurant'] = __( 'Restaurant details', 'explore-katsina' );
				$out['menu']       = __( 'Menu', 'explore-katsina' );
				$out['tables']     = __( 'Table settings', 'explore-katsina' );
			}
			if ( 'bookings' === $k && Restaurant::ordering_on_sitewide() ) {
				$out['orders'] = __( 'Online orders', 'explore-katsina' );
			}
		}
		return $out;
	}

	public static function action( $redirect, $action, $business_id, array $in, $uid ) {
		if ( 'restaurant' !== Business::type_of( $business_id ) ) {
			return $redirect;
		}
		switch ( $action ) {
			case 'dash_restaurant':
				$group = sanitize_key( $in['group'] ?? '' );
				if ( ! in_array( $group, array( 'details', 'tables', 'ordering' ), true ) ) {
					return $redirect;
				}
				if ( 'ordering' === $group && ! Restaurant::ordering_on_sitewide() ) {
					View::flash( 'error', __( 'Online ordering is not available yet.', 'explore-katsina' ), $uid );
					return Dashboard::url( 'overview', $business_id );
				}
				list( $d, $e ) = Restaurant::validate( $group, $in, Restaurant::settings( $business_id ) );
				if ( $e ) {
					self::$errors = $e;
					self::$values = $in;
					self::$group  = $group;
					return null;
				}
				Restaurant::save( $business_id, $d );
				View::flash( 'ok', __( 'Saved.', 'explore-katsina' ), $uid );
				return Dashboard::url( array( 'details' => 'restaurant', 'tables' => 'tables', 'ordering' => 'orders' )[ $group ], $business_id );

			case 'dash_menu':
				return self::menu_action( $business_id, $in, $uid );
		}
		return $redirect;
	}

	private static function menu_action( $business_id, array $in, $uid ) {
		$op   = sanitize_key( $in['op'] ?? '' );
		$id   = absint( $in['id'] ?? 0 );
		$back = Dashboard::url( 'menu', $business_id );
		$res  = true;
		$msg  = __( 'Menu updated.', 'explore-katsina' );

		switch ( $op ) {
			case 'add_cat':
				$res = Menu::add_category( $business_id, $in['cat_name'] ?? '' );
				$msg = __( 'Category added.', 'explore-katsina' );
				break;
			case 'rename_cat':
				$res = Menu::rename_category( $id, $business_id, $in['cat_name'] ?? '' );
				break;
			case 'delete_cat':
				$res = Menu::delete_category( $id, $business_id );
				$msg = __( 'Category deleted.', 'explore-katsina' );
				break;
			case 'cat_up':
			case 'cat_down':
				$res = Menu::move( 'cat', $id, $business_id, 'cat_up' === $op ? 'up' : 'down' );
				break;
			case 'item_up':
			case 'item_down':
				$res = Menu::move( 'item', $id, $business_id, 'item_up' === $op ? 'up' : 'down' );
				break;
			case 'toggle':
				$res = Menu::toggle( $id, $business_id );
				$msg = is_wp_error( $res ) ? '' : ( $res ? __( 'Marked available.', 'explore-katsina' ) : __( 'Marked sold out.', 'explore-katsina' ) );
				break;
			case 'delete_item':
				$res = Menu::delete_item( $id, $business_id );
				$msg = __( 'Dish deleted.', 'explore-katsina' );
				break;
			case 'save_item':
				if ( $id && ! Menu::item( $id, $business_id ) ) {
					wp_die( esc_html__( 'That dish belongs to another restaurant.', 'explore-katsina' ), '', array( 'response' => 403 ) );
				}
				list( $d, $e ) = Menu::validate_item( $in, $business_id );
				if ( $e ) {
					foreach ( $e as $m ) {
						View::flash( 'error', $m, $uid );
					}
					return $back . '#cat-' . absint( $in['category_id'] ?? 0 );
				}
				$res = Menu::save_item( $business_id, $id, $d );
				if ( ! is_wp_error( $res ) && ! empty( $_FILES['item_photo']['name'] ) ) {
					$_FILES['item_photos'] = array_map( static fn( $v ) => array( $v ), $_FILES['item_photo'] ); // phpcs:ignore
					$up                    = Photos::upload_many( 'item_photos', $business_id, 1 );
					if ( $up['ids'] ) {
						Menu::set_photo( $res, $business_id, $up['ids'][0] );
					}
					foreach ( $up['errors'] as $m ) {
						View::flash( 'warn', $m, $uid );
					}
				}
				$msg  = $id ? __( 'Dish saved.', 'explore-katsina' ) : __( 'Dish added.', 'explore-katsina' );
				$back .= '#cat-' . (int) $d['category_id'];
				break;
			default:
				return $back;
		}
		if ( is_wp_error( $res ) ) {
			View::flash( 'error', $res->get_error_message(), $uid );
		} elseif ( $msg ) {
			View::flash( 'ok', $msg, $uid );
		}
		return $back;
	}
}
