<?php
/**
 * Souvenir & crafts shop and digital guides, using WooCommerce (free):
 *  - Product categories: Leatherwork, Fabrics & textiles, Crafts, Guides & maps.
 *  - Delivery fees by state (WooCommerce shipping zones, PLACEHOLDER fees): Katsina State; nearby
 *    states (Kano, Jigawa, Kaduna, Zamfara); rest of Nigeria. Digital guides need no delivery.
 *  - Digital guides and maps: "downloadable" products (PDF). WooCommerce gives the buyer an
 *    instant, private download link after payment (also in My Account → Downloads).
 *  - Setting "External store link": if you later sell through another store, every product's
 *    "Add to cart" becomes "Buy on our store" pointing there.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Shop {

	const SETUP_OPTION = 'ek_shop_setup';

	public static function categories() {
		return array(
			'leatherwork' => __( 'Leatherwork', 'explore-katsina' ),
			'fabrics'     => __( 'Fabrics & textiles', 'explore-katsina' ),
			'crafts'      => __( 'Crafts', 'explore-katsina' ),
			'guides'      => __( 'Guides & maps (digital)', 'explore-katsina' ),
		);
	}

	/** state code => zone, fee in naira (PLACEHOLDERS). */
	public static function zones() {
		return array(
			array( 'name' => __( 'Katsina State', 'explore-katsina' ), 'states' => array( 'KT' ), 'fee' => 1500 ),
			array( 'name' => __( 'Nearby states (Kano, Jigawa, Kaduna, Zamfara)', 'explore-katsina' ), 'states' => array( 'KN', 'JI', 'KD', 'ZA' ), 'fee' => 3000 ),
			array( 'name' => __( 'Rest of Nigeria', 'explore-katsina' ), 'states' => array(), 'fee' => 5000 ),
		);
	}

	public static function init() {
		if ( ! Payments::woo_active() ) {
			return;
		}
		add_filter( 'woocommerce_is_purchasable', array( __CLASS__, 'purchasable' ), 10, 2 );
		add_action( 'woocommerce_single_product_summary', array( __CLASS__, 'external_button' ), 31 );
		add_filter( 'woocommerce_loop_add_to_cart_link', array( __CLASS__, 'loop_link' ), 10, 2 );
	}

	/** Create categories and delivery zones once (re-run safe). */
	public static function setup() {
		if ( ! Payments::woo_active() || get_option( self::SETUP_OPTION ) ) {
			return false;
		}
		foreach ( self::categories() as $slug => $name ) {
			if ( ! term_exists( $slug, 'product_cat' ) ) {
				wp_insert_term( $name, 'product_cat', array( 'slug' => $slug ) );
			}
		}
		if ( class_exists( 'WC_Shipping_Zone' ) ) {
			foreach ( self::zones() as $i => $z ) {
				$zone = new \WC_Shipping_Zone();
				$zone->set_zone_name( $z['name'] );
				$zone->set_zone_order( $i );
				if ( $z['states'] ) {
					foreach ( $z['states'] as $st ) {
						$zone->add_location( 'NG:' . $st, 'state' );
					}
				} else {
					$zone->add_location( 'NG', 'country' );
				}
				$zone->save();
				$method_id = $zone->add_shipping_method( 'flat_rate' );
				$opt       = 'woocommerce_flat_rate_' . $method_id . '_settings';
				update_option( $opt, array( 'title' => __( 'Delivery', 'explore-katsina' ), 'tax_status' => 'none', 'cost' => (string) $z['fee'] ) );
			}
		}
		update_option( 'woocommerce_ship_to_countries', 'specific' );
		update_option( 'woocommerce_specific_ship_to_countries', array( 'NG' ) );
		update_option( 'woocommerce_downloads_grant_access_after_payment', 'yes' );
		update_option( self::SETUP_OPTION, current_time( 'mysql', true ) );
		return true;
	}

	public static function external_url() {
		$u = (string) Settings::get( 'shop_external_url' );
		return View::valid_url( $u );
	}

	/** Our own bookings/sales products are never affected; shop products become "buy elsewhere". */
	public static function purchasable( $ok, $product ) {
		return self::external_url() && $product && ! $product->is_type( 'external' ) ? false : $ok;
	}

	public static function external_button() {
		if ( self::external_url() ) {
			echo '<p><a class="button alt" href="' . esc_url( self::external_url() ) . '" rel="noopener" target="_blank">' . esc_html__( 'Buy on our store', 'explore-katsina' ) . '</a></p>';
		}
	}

	public static function loop_link( $html, $product ) {
		return self::external_url() && ! $product->is_type( 'external' ) ? '<a class="button" href="' . esc_url( self::external_url() ) . '" rel="noopener" target="_blank">' . esc_html__( 'Buy on our store', 'explore-katsina' ) . '</a>' : $html;
	}

	/** Paid WooCommerce shop orders (not bookings, invoices or sales), split into guides vs goods, per month. */
	public static function income( $from, $to ) {
		if ( ! function_exists( 'wc_get_orders' ) ) {
			return array();
		}
		$orders = wc_get_orders( array( 'status' => array( 'processing', 'completed' ), 'date_paid' => strtotime( $from . ' 00:00:00' ) . '...' . strtotime( $to . ' 23:59:59' ), 'limit' => -1 ) );
		$out    = array();
		foreach ( $orders as $o ) {
			if ( $o->get_meta( Payments_Woo::META ) || $o->get_meta( Payments_Woo::META_INVOICE ) || $o->get_meta( Payments_Woo::META_SALE ) ) {
				continue;
			}
			$m = $o->get_date_paid() ? $o->get_date_paid()->date( 'Y-m' ) : $o->get_date_created()->date( 'Y-m' );
			foreach ( $o->get_items() as $item ) {
				$p   = $item->get_product();
				$key = $p && $p->is_downloadable() ? 'guides' : 'shop';
				$out[ $m ][ $key ] = ( $out[ $m ][ $key ] ?? 0 ) + (int) round( (float) $item->get_total() * 100 );
			}
			$out[ $m ]['shop'] = ( $out[ $m ]['shop'] ?? 0 ) + (int) round( (float) $o->get_shipping_total() * 100 ) - (int) round( (float) $o->get_total_refunded() * 100 );
		}
		return $out;
	}
}
