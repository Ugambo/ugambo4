<?php
/**
 * Shows the local-only test payment (class Test_Gateway) in WooCommerce's block checkout.
 * Local/development sites only; see Test_Gateway.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

if ( ! class_exists( '\Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType' ) ) {
	return;
}

final class Test_Gateway_Blocks extends \Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType {

	protected $name = 'ek_test';

	public function initialize() {}

	public function is_active() {
		return Test_Gateway::allowed();
	}

	public function get_payment_method_script_handles() {
		wp_register_script( 'ek-test-gateway-blocks', EK_URL . 'assets/js/test-gateway-blocks.js', array( 'wc-blocks-registry', 'wc-settings', 'wp-element' ), Assets::ver( 'assets/js/test-gateway-blocks.js' ), true );
		return array( 'ek-test-gateway-blocks' );
	}

	public function get_payment_method_data() {
		return array(
			'title'       => __( 'Test payment: no real money (local test site only)', 'explore-katsina' ),
			'description' => __( 'This is a test site. Placing the order marks it paid straight away; nothing is charged.', 'explore-katsina' ),
			'supports'    => array( 'products' ),
		);
	}
}
