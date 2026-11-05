<?php
/**
 * WooCommerce bridge: bookings are paid through WooCommerce orders (Paystack / Flutterwave).
 * Loaded only when WooCommerce is active.
 *
 * NOTE: written against the WooCommerce order API; to be run-tested once WooCommerce
 * and the Paystack plugin can be installed (see HANDOVER.md).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Payments_Woo {

	const META = '_ek_booking_id';

	public static function init() {
		add_action( 'woocommerce_payment_complete', array( __CLASS__, 'paid' ) );
		add_action( 'woocommerce_order_status_processing', array( __CLASS__, 'paid' ) );
		add_action( 'woocommerce_order_status_completed', array( __CLASS__, 'paid' ) );
		add_action( 'woocommerce_order_status_failed', array( __CLASS__, 'failed' ) );
		add_action( 'woocommerce_order_status_cancelled', array( __CLASS__, 'failed' ) );
		add_filter( 'woocommerce_payment_complete_order_status', array( __CLASS__, 'complete_status' ), 10, 3 );
		add_filter( 'woocommerce_get_checkout_order_received_url', array( __CLASS__, 'thank_you_url' ), 10, 2 );
	}

	public static function has_gateway() {
		if ( ! function_exists( 'WC' ) || ! WC()->payment_gateways() ) {
			return false;
		}
		return (bool) WC()->payment_gateways()->get_available_payment_gateways();
	}

	/** @return string|\WP_Error */
	public static function checkout_url( $b, $amount_kobo ) {
		$order = $b->order_id ? wc_get_order( $b->order_id ) : null;
		if ( ! $order || ! $order->needs_payment() ) {
			$order = wc_create_order( array( 'customer_id' => (int) $b->customer_id ) );
			if ( is_wp_error( $order ) ) {
				return $order;
			}
			$item = new \WC_Order_Item_Product();
			/* translators: 1: booking code, 2: hotel, 3: room */
			$item->set_name( sprintf( __( 'Booking %1$s: %2$s, %3$s', 'explore-katsina' ), $b->code, $b->details['hotel'] ?? '', $b->details['room'] ?? '' ) );
			$item->set_quantity( 1 );
			$item->set_subtotal( $amount_kobo / 100 );
			$item->set_total( $amount_kobo / 100 );
			$order->add_item( $item );
			$name = explode( ' ', $b->customer_name, 2 );
			$order->set_billing_first_name( $name[0] );
			$order->set_billing_last_name( $name[1] ?? '' );
			$order->set_billing_email( $b->customer_email );
			$order->set_billing_phone( $b->customer_phone );
			$order->set_billing_country( 'NG' );
			$order->set_currency( 'NGN' );
			$order->update_meta_data( self::META, (int) $b->id );
			$order->calculate_totals( false );
			$order->set_status( 'pending' );
			$order->save();
			global $wpdb;
			$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'order_id' => $order->get_id() ), array( 'id' => $b->id ) );
		}
		return $order->get_checkout_payment_url();
	}

	private static function booking_for( $order_id ) {
		$order = wc_get_order( $order_id );
		return $order ? (int) $order->get_meta( self::META ) : 0;
	}

	public static function paid( $order_id ) {
		$booking_id = self::booking_for( $order_id );
		if ( ! $booking_id ) {
			return;
		}
		$order = wc_get_order( $order_id );
		if ( ! $order->is_paid() ) {
			return;
		}
		// Reference is the order number, so repeated hooks apply the payment once.
		Booking::mark_paid( $booking_id, (int) round( (float) $order->get_total() * 100 ), 'wc-' . $order_id );
	}

	public static function failed( $order_id ) {
		$booking_id = self::booking_for( $order_id );
		if ( $booking_id ) {
			Booking::payment_failed( $booking_id );
		}
	}

	/** Booking payments need no shipping/processing: mark them completed. */
	public static function complete_status( $status, $order_id, $order ) {
		return ( $order && $order->get_meta( self::META ) ) ? 'completed' : $status;
	}

	/** After paying, show our booking confirmation instead of the shop's thank-you page. */
	public static function thank_you_url( $url, $order ) {
		$booking_id = $order ? (int) $order->get_meta( self::META ) : 0;
		if ( $booking_id ) {
			$b = Booking::get( $booking_id );
			if ( $b ) {
				return Booking::link( $b );
			}
		}
		return $url;
	}
}
