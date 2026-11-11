<?php
/**
 * Keeps the automatic site menu (the theme's page list) to pages visitors should open from a menu.
 * Utility pages (booking form, cart, checkout, WooCommerce's own account page, legal agreement,
 * WordPress's "Sample Page", the business dashboard) are still reachable, just not listed.
 * WooCommerce's account page forwards to our My Account (its order pages keep working).
 * A designed header menu replaces this in the design phase.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Nav {

	public static function init() {
		add_filter( 'get_pages', array( __CLASS__, 'filter' ), 10, 2 );
		add_action( 'template_redirect', array( __CLASS__, 'woo_account' ), 9 );
	}

	public static function hidden_ids() {
		$ids = array();
		foreach ( array( 'book', 'agreement', 'dashboard', 'top_hotels', 'top_restaurants', 'top_event_centres', 'checkin', 'listing_setup', 'promote_event', 'advertise' ) as $k ) {
			$ids = array_merge( $ids, Install::page_ids_all( $k ) );
		}
		foreach ( array( 'woocommerce_myaccount_page_id', 'woocommerce_cart_page_id', 'woocommerce_checkout_page_id' ) as $opt ) {
			$ids[] = (int) get_option( $opt );
		}
		$sample = get_page_by_path( 'sample-page' );
		if ( $sample ) {
			$ids[] = $sample->ID;
		}
		return array_values( array_filter( apply_filters( 'ek_nav_hidden_pages', $ids ) ) );
	}

	/** Only the theme menu's page list (front end, all pages sorted by menu order). */
	public static function filter( $pages, $args ) {
		if ( is_admin() || wp_is_serving_rest_request() || 'menu_order,post_title' !== ( $args['sort_column'] ?? '' ) || ! empty( $args['include'] ) || ! empty( $args['child_of'] ) ) {
			return $pages;
		}
		$hide = self::hidden_ids();
		return array_values( array_filter( $pages, static fn( $p ) => ! in_array( (int) $p->ID, $hide, true ) ) );
	}

	/** /my-account/ (WooCommerce) → our My Account. Its sub-pages (orders, lost password…) still work. */
	public static function woo_account() {
		if ( ! function_exists( 'is_account_page' ) || ! is_account_page() || is_wc_endpoint_url() || ! is_user_logged_in() ) {
			return;
		}
		wp_safe_redirect( Account::url( 'orders' ) );
		exit;
	}
}
