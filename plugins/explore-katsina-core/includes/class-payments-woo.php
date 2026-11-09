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

	const META         = '_ek_booking_id';
	const META_INVOICE = '_ek_invoice_id';
	const META_SALE    = '_ek_sale_id';

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
			/* translators: 1: booking code, 2: business, 3: what (room / table / order) */
			$item->set_name( sprintf( __( 'Booking %1$s: %2$s, %3$s', 'explore-katsina' ), $b->code, $b->details['hotel'] ?? ( $b->details['business'] ?? '' ), $b->details['room'] ?? ( $b->details['title'] ?? '' ) ) );
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

	/** Commission invoice paid online (Phase 7). @return string|\WP_Error */
	public static function invoice_checkout_url( $inv ) {
		$order = $inv->order_id ? wc_get_order( $inv->order_id ) : null;
		if ( ! $order || ! $order->needs_payment() ) {
			$owner = get_userdata( Business::owner_id( $inv->business_id ) );
			$order = wc_create_order( array( 'customer_id' => $owner ? $owner->ID : 0 ) );
			if ( is_wp_error( $order ) ) {
				return $order;
			}
			$item = new \WC_Order_Item_Product();
			/* translators: 1: invoice number, 2: business */
			$item->set_name( sprintf( __( 'Commission invoice %1$s: %2$s', 'explore-katsina' ), $inv->number, get_the_title( $inv->business_id ) ) );
			$item->set_quantity( 1 );
			$item->set_subtotal( $inv->amount_kobo / 100 );
			$item->set_total( $inv->amount_kobo / 100 );
			$order->add_item( $item );
			$order->set_billing_first_name( get_the_title( $inv->business_id ) );
			$order->set_billing_email( $owner ? $owner->user_email : get_option( 'admin_email' ) );
			$order->set_billing_country( 'NG' );
			$order->set_currency( 'NGN' );
			$order->update_meta_data( self::META_INVOICE, (int) $inv->id );
			$order->calculate_totals( false );
			$order->set_status( 'pending' );
			$order->save();
			global $wpdb;
			$wpdb->update( $wpdb->prefix . 'ek_invoices', array( 'order_id' => $order->get_id() ), array( 'id' => $inv->id ) );
		}
		return $order->get_checkout_payment_url();
	}

	/** Sales (plans, tickets, tours…) paid online. @return string|\WP_Error */
	public static function sale_checkout_url( $s ) {
		$order = $s->order_id ? wc_get_order( $s->order_id ) : null;
		if ( ! $order || ! $order->needs_payment() ) {
			$order = wc_create_order( array( 'customer_id' => (int) $s->customer_id ) );
			if ( is_wp_error( $order ) ) {
				return $order;
			}
			$item = new \WC_Order_Item_Product();
			$item->set_name( ( Sales::kinds()[ $s->kind ] ?? $s->kind ) . ' · ' . ( $s->details['title'] ?? '' ) . ' · ' . $s->code );
			$item->set_quantity( 1 );
			$item->set_subtotal( $s->amount_kobo / 100 );
			$item->set_total( $s->amount_kobo / 100 );
			$order->add_item( $item );
			$name = explode( ' ', $s->customer_name, 2 );
			$order->set_billing_first_name( $name[0] );
			$order->set_billing_last_name( $name[1] ?? '' );
			$order->set_billing_email( $s->customer_email );
			$order->set_billing_phone( $s->customer_phone );
			$order->set_billing_country( 'NG' );
			$order->set_currency( 'NGN' );
			$order->update_meta_data( self::META_SALE, (int) $s->id );
			$order->calculate_totals( false );
			$order->set_status( 'pending' );
			$order->save();
			global $wpdb;
			$wpdb->update( $wpdb->prefix . 'ek_sales', array( 'order_id' => $order->get_id() ), array( 'id' => $s->id ) );
		}
		return $order->get_checkout_payment_url();
	}

	private static function booking_for( $order_id ) {
		$order = wc_get_order( $order_id );
		return $order ? (int) $order->get_meta( self::META ) : 0;
	}

	public static function paid( $order_id ) {
		$order      = wc_get_order( $order_id );
		$sale_id = $order ? (int) $order->get_meta( self::META_SALE ) : 0;
		if ( $sale_id ) {
			if ( $order->is_paid() ) {
				Sales::mark_paid( $sale_id, (int) round( (float) $order->get_total() * 100 ), 'wc-' . $order_id );
			}
			return;
		}
		$invoice_id = $order ? (int) $order->get_meta( self::META_INVOICE ) : 0;
		if ( $invoice_id && $order->is_paid() ) {
			$inv = Invoices::get( $invoice_id );
			// Only mark paid if the amount matches the invoice.
			if ( $inv && (int) round( (float) $order->get_total() * 100 ) >= (int) $inv->amount_kobo ) {
				Invoices::mark_paid( $invoice_id, 'gateway', 'wc-' . $order_id );
			}
			return;
		}
		$booking_id = self::booking_for( $order_id );
		if ( ! $booking_id ) {
			return;
		}
		if ( ! $order->is_paid() ) {
			return;
		}
		// Reference is the order number, so repeated hooks apply the payment once.
		Booking::mark_paid( $booking_id, (int) round( (float) $order->get_total() * 100 ), 'wc-' . $order_id );
	}

	public static function failed( $order_id ) {
		$order = wc_get_order( $order_id );
		if ( $order && $order->get_meta( self::META_SALE ) ) {
			Sales::payment_failed( (int) $order->get_meta( self::META_SALE ) );
			return;
		}
		$booking_id = self::booking_for( $order_id );
		if ( $booking_id ) {
			Booking::payment_failed( $booking_id );
		}
	}

	/** Booking payments need no shipping/processing: mark them completed. */
	public static function complete_status( $status, $order_id, $order ) {
		return ( $order && ( $order->get_meta( self::META ) || $order->get_meta( self::META_INVOICE ) || $order->get_meta( self::META_SALE ) ) ) ? 'completed' : $status;
	}

	/** After paying, show our booking confirmation instead of the shop's thank-you page. */
	public static function thank_you_url( $url, $order ) {
		$sale_id = $order ? (int) $order->get_meta( self::META_SALE ) : 0;
		if ( $sale_id ) {
			$s = Sales::get( $sale_id );
			return $s ? Sales::done_url( $s ) : $url;
		}
		$invoice_id = $order ? (int) $order->get_meta( self::META_INVOICE ) : 0;
		if ( $invoice_id ) {
			$inv = Invoices::get( $invoice_id );
			return $inv ? add_query_arg( 'paid', 1, Dashboard::url( 'invoices', (int) $inv->business_id ) ) : $url;
		}
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
