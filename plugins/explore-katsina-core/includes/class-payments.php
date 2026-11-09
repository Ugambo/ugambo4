<?php
/**
 * Payments: one place that decides how a booking is paid online.
 *
 *  - "woocommerce": the live route. Each payment becomes a WooCommerce order, paid with
 *    Paystack or Flutterwave. When WooCommerce says it's paid, the booking is marked paid.
 *  - "test": LOCAL DEVELOPMENT ONLY. A clearly-labelled fake payment screen so the whole
 *    booking journey can be tested without WooCommerce. It refuses to run on a live site.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Payments {

	public static function init() {
		if ( self::woo_active() ) {
			Payments_Woo::init();
		}
	}

	public static function woo_active() {
		return class_exists( 'WooCommerce' ) && function_exists( 'wc_create_order' );
	}

	/**
	 * The test screen exists only on local/development sites, and only while no real
	 * WooCommerce payment method (Paystack/Flutterwave) is switched on.
	 */
	public static function test_mode_allowed() {
		return in_array( wp_get_environment_type(), array( 'local', 'development' ), true )
			&& ! ( self::woo_active() && Payments_Woo::has_gateway() );
	}

	public static function provider() {
		if ( self::woo_active() && Payments_Woo::has_gateway() ) {
			return 'woocommerce';
		}
		if ( self::test_mode_allowed() ) {
			return 'test';
		}
		return self::woo_active() ? 'woocommerce' : 'none';
	}

	public static function online_available() {
		$p = self::provider();
		if ( 'woocommerce' === $p ) {
			return Payments_Woo::has_gateway();
		}
		return 'test' === $p;
	}

	/**
	 * Where to send the guest to pay the online part of a booking.
	 *
	 * @return string|\WP_Error
	 */
	public static function start( $b ) {
		$amount = (int) ( $b->details['pay_now'] ?? 0 );
		if ( $amount <= 0 ) {
			return Booking::link( $b );
		}
		switch ( self::provider() ) {
			case 'woocommerce':
				return Payments_Woo::checkout_url( $b, $amount );
			case 'test':
				return add_query_arg( array( 'pay' => $b->code, 'key' => $b->access_key ), Install::page_url( 'book' ) );
		}
		return new \WP_Error( 'no_gateway', __( 'Online payment is not available right now.', 'explore-katsina' ) );
	}

	/** Handle the local test payment screen's buttons. */
	public static function handle_test_payment() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'test_pay' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		if ( ! self::test_mode_allowed() ) {
			wp_die( 'Test payments are disabled on this site.', '', array( 'response' => 403 ) );
		}
		$in = wp_unslash( $_POST ); // phpcs:ignore
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_test_pay' ) ) {
			wp_die( 'Expired. Go back and try again.', '', array( 'response' => 400 ) );
		}
		$b = Booking::by_code( $in['code'] ?? '', $in['key'] ?? '' );
		if ( ! $b ) {
			wp_die( 'Booking not found.', '', array( 'response' => 404 ) );
		}
		if ( 'success' === ( $in['result'] ?? '' ) ) {
			Booking::mark_paid( $b->id, (int) ( $b->details['pay_now'] ?? 0 ), 'TEST-' . strtoupper( wp_generate_password( 8, false ) ) );
		} else {
			Booking::payment_failed( $b->id );
		}
		wp_safe_redirect( Booking::link( Booking::get( $b->id ) ) );
		exit;
	}
}
