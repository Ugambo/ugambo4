<?php
/**
 * Emails for direct sales: receipts, cancellations, refunds to pay by hand, payment conflicts.
 * Each kind can add its own lines with the filter ek_sale_email_lines.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Emails_Sales {

	private static function lines( $s ) {
		$lines = array(
			/* translators: %s: order code */
			sprintf( __( 'Order: %s', 'explore-katsina' ), $s->code ),
			/* translators: %s: what */
			sprintf( __( 'Item: %s', 'explore-katsina' ), trim( ( Sales::kinds()[ $s->kind ] ?? $s->kind ) . ( ! empty( $s->details['title'] ) ? ' · ' . $s->details['title'] : '' ) ) ),
			/* translators: %s: amount */
			sprintf( __( 'Amount: %s', 'explore-katsina' ), Money::format( $s->amount_kobo ) ),
		);
		return apply_filters( 'ek_sale_email_lines', $lines, $s );
	}

	public static function receipt( $s ) {
		if ( $s->customer_email ) {
			Emails::send(
				$s->customer_email,
				/* translators: %s: code */
				sprintf( __( 'Receipt: %s', 'explore-katsina' ), $s->code ),
				apply_filters( 'ek_sale_email_heading', __( 'Thank you, payment received', 'explore-katsina' ), $s ),
				self::lines( $s ),
				array( 'label' => __( 'View my order', 'explore-katsina' ), 'url' => Sales::link( $s ) ),
				array( 'event' => 'sale_' . $s->kind, 'phone' => $s->customer_phone )
			);
		}
		Emails::send(
			Emails::admin_email(),
			/* translators: 1: kind, 2: amount */
			sprintf( __( 'New sale: %1$s (%2$s)', 'explore-katsina' ), Sales::kinds()[ $s->kind ] ?? $s->kind, Money::format( $s->amount_kobo ) ),
			__( 'New sale', 'explore-katsina' ),
			array_merge( self::lines( $s ), array( $s->customer_name . ' · ' . $s->customer_email . ' · ' . $s->customer_phone ) ),
			array( 'label' => __( 'Open in wp-admin', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-sales' ) ),
			array( 'event' => 'admin_sale' )
		);
	}

	public static function cancelled( $s, $refund ) {
		if ( ! $s->customer_email ) {
			return;
		}
		Emails::send(
			$s->customer_email,
			/* translators: %s: code */
			sprintf( __( 'Cancelled: %s', 'explore-katsina' ), $s->code ),
			__( 'Your order is cancelled', 'explore-katsina' ),
			array_merge( self::lines( $s ), $refund ? array( sprintf( /* translators: %s: amount */ __( 'Refund: %s. It can take a few working days to reach your account.', 'explore-katsina' ), Money::format( $refund ) ) ) : array() ),
			array( 'label' => __( 'View order', 'explore-katsina' ), 'url' => Sales::link( $s ) ),
			array( 'event' => 'sale_cancelled', 'phone' => $s->customer_phone )
		);
	}

	public static function refund_needed( $s, $amount ) {
		Emails::send(
			Emails::admin_email(),
			/* translators: %s: code */
			sprintf( __( 'Refund to pay by hand: %s', 'explore-katsina' ), $s->code ),
			__( 'Please refund this customer', 'explore-katsina' ),
			array_merge( self::lines( $s ), array( sprintf( /* translators: %s: amount */ __( 'The payment gateway could not refund %s automatically. Please pay it by bank transfer.', 'explore-katsina' ), Money::format( $amount ) ), $s->customer_name . ' · ' . $s->customer_email . ' · ' . $s->customer_phone ) ),
			array( 'label' => __( 'Open sales', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-sales' ) ),
			array( 'event' => 'admin_sale_refund' )
		);
	}

	public static function conflict( $s ) {
		Emails::send(
			Emails::admin_email(),
			/* translators: %s: code */
			sprintf( __( 'Payment arrived after seats ran out: %s', 'explore-katsina' ), $s->code ),
			__( 'Payment issue', 'explore-katsina' ),
			array_merge( self::lines( $s ), array( __( 'The customer paid after their 15-minute hold ended and the seats/tickets were taken. Please refund them or arrange another date.', 'explore-katsina' ), $s->customer_name . ' · ' . $s->customer_email . ' · ' . $s->customer_phone ) ),
			array( 'label' => __( 'Open sales', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-sales' ) ),
			array( 'event' => 'admin_sale_conflict' )
		);
	}
}
