<?php
/**
 * "Test payment (local only)" for the WooCommerce shop: the shop's twin of the booking test screen, so a
 * guide can be "bought" and downloaded while testing on a local/development site.
 *
 * It is never offered on a live site (environment type must be local or development) and disappears as
 * soon as a real payment method (Paystack / Flutterwave) is switched on. No money moves.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( '\WC_Payment_Gateway' ) ) {
	return;
}

class Test_Gateway extends \WC_Payment_Gateway {

	const ID = 'ek_test';

	public function __construct() {
		$this->id                 = self::ID;
		$this->method_title       = __( 'Test payment (local only)', 'explore-katsina' );
		$this->method_description = __( 'For testing on a local or development site only. Never shown on a live site, and hidden once Paystack or Flutterwave is switched on.', 'explore-katsina' );
		$this->title              = __( 'Test payment: no real money (local test site only)', 'explore-katsina' );
		$this->description        = __( 'This is a test site. Placing the order marks it paid straight away; nothing is charged.', 'explore-katsina' );
		$this->has_fields         = false;
		$this->enabled            = 'yes';
		$this->supports           = array( 'products' );
	}

	/** Local/development site, and no real payment method is on. */
	public static function allowed() {
		if ( ! in_array( wp_get_environment_type(), array( 'local', 'development' ), true ) || ! function_exists( 'WC' ) || ! WC()->payment_gateways() ) {
			return false;
		}
		foreach ( WC()->payment_gateways()->payment_gateways() as $g ) {
			if ( self::ID !== $g->id && 'yes' === $g->enabled && $g->is_available() ) {
				return false;
			}
		}
		return true;
	}

	public function is_available() {
		return self::allowed();
	}

	public function process_payment( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( ! $order || ! self::allowed() ) {
			wc_add_notice( __( 'Test payment is not available on this site.', 'explore-katsina' ), 'error' );
			return array( 'result' => 'failure' );
		}
		$order->payment_complete( 'TEST-' . strtoupper( wp_generate_password( 8, false ) ) );
		$order->add_order_note( __( 'Paid with the local test payment (no real money).', 'explore-katsina' ) );
		WC()->cart->empty_cart();
		return array( 'result' => 'success', 'redirect' => $this->get_return_url( $order ) );
	}
}
