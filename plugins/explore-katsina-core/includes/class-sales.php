<?php
/**
 * Sales: everything Explore Katsina sells directly (100% revenue): featured plans, Verified badge
 * applications, listing setup service, event promotion, own tours and event tickets.
 * Paid like bookings: WooCommerce + Paystack/Flutterwave on the live site, a test screen locally.
 *
 * Each kind plugs in through actions:
 *   ek_sale_paid ($sale)      → deliver what was bought (activate the plan, issue tickets…)
 *   ek_sale_released ($sale)  → give back held seats/tickets when an unpaid sale expires or is cancelled
 *   ek_sale_retake ($ok, $sale) filter → try to hold seats again if payment arrives after the hold expired
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Sales {

	const HOLD_MINUTES = 15;

	public static function init() {
		add_action( Booking::CRON_HOOK, array( __CLASS__, 'expire_holds' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle_test_payment' ), 7 );
		add_action( 'template_redirect', array( __CLASS__, 'handle_guest_cancel' ), 7 );
	}

	public static function kinds() {
		return array(
			'plan'      => __( 'Featured / Premium plan', 'explore-katsina' ),
			'verified'  => __( 'Verified badge application', 'explore-katsina' ),
			'setup'     => __( 'Listing setup service', 'explore-katsina' ),
			'promotion' => __( 'Event promotion', 'explore-katsina' ),
			'tour'      => __( 'Tour booking', 'explore-katsina' ),
			'ticket'    => __( 'Event tickets', 'explore-katsina' ),
		);
	}

	private static function hydrate( $s ) {
		if ( $s ) {
			$s->details = $s->details ? json_decode( $s->details, true ) : array();
		}
		return $s;
	}

	public static function get( $id ) {
		global $wpdb;
		return self::hydrate( $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_sales WHERE id = %d", $id ) ) );
	}

	public static function by_code( $code, $key = null ) {
		global $wpdb;
		$s = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_sales WHERE code = %s", strtoupper( (string) $code ) ) );
		if ( ! $s || ( null !== $key && ! hash_equals( (string) $s->access_key, (string) $key ) ) ) {
			return null;
		}
		return self::hydrate( $s );
	}

	public static function link( $s ) {
		return add_query_arg( array( 'sale' => $s->code, 'key' => $s->access_key ), Install::page_url( 'book' ) );
	}

	/**
	 * @param array $a kind, object_id, item_id, quantity, amount_kobo, name, email, phone, customer_id,
	 *                 details (array), hold (bool: seats/tickets are being held for 15 minutes).
	 * @return object The sale.
	 */
	public static function create( array $a ) {
		global $wpdb;
		do {
			$code = 'EKS-' . strtoupper( wp_generate_password( 6, false, false ) );
			$code = strtr( $code, array( '0' => '8', 'O' => 'P', 'I' => 'J', 'L' => 'M', '1' => '7' ) );
		} while ( $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM {$wpdb->prefix}ek_sales WHERE code = %s", $code ) ) );
		$amount = max( 0, (int) $a['amount_kobo'] );
		$wpdb->insert(
			$wpdb->prefix . 'ek_sales',
			array(
				'code'           => $code,
				'access_key'     => wp_generate_password( 32, false, false ),
				'kind'           => sanitize_key( $a['kind'] ),
				'object_id'      => (int) ( $a['object_id'] ?? 0 ),
				'item_id'        => (int) ( $a['item_id'] ?? 0 ),
				'quantity'       => max( 1, (int) ( $a['quantity'] ?? 1 ) ),
				'amount_kobo'    => $amount,
				'status'         => 'pending_payment',
				'customer_id'    => (int) ( $a['customer_id'] ?? get_current_user_id() ),
				'customer_name'  => mb_substr( sanitize_text_field( $a['name'] ?? '' ), 0, 190 ),
				'customer_email' => sanitize_email( $a['email'] ?? '' ),
				'customer_phone' => (string) ( $a['phone'] ?? '' ),
				'details'        => wp_json_encode( (array) ( $a['details'] ?? array() ) ),
				'hold_expires'   => ! empty( $a['hold'] ) ? gmdate( 'Y-m-d H:i:s', time() + self::HOLD_MINUTES * MINUTE_IN_SECONDS ) : null,
				'created_at'     => current_time( 'mysql', true ),
			)
		);
		$s = self::get( (int) $wpdb->insert_id );
		Log::add( 'sale_created', 'sale', $s->id, $s->kind, array( 'amount_kobo' => $amount ) );
		if ( 0 === $amount ) {
			$s = self::mark_paid( $s->id, 0, 'FREE-' . $s->code );
		}
		return $s;
	}

	/** Where to pay. @return string|\WP_Error */
	public static function pay_url( $s ) {
		if ( 'paid' === $s->status ) {
			return self::done_url( $s );
		}
		switch ( Payments::provider() ) {
			case 'woocommerce':
				return Payments_Woo::sale_checkout_url( $s );
			case 'test':
				return add_query_arg( array( 'pay_sale' => $s->code, 'key' => $s->access_key ), Install::page_url( 'book' ) );
		}
		return new \WP_Error( 'no_gateway', __( 'Online payment is not available right now. Please try again later or contact us.', 'explore-katsina' ) );
	}

	/** After paying: back to where the buyer started (e.g. the business dashboard), or the receipt. */
	public static function done_url( $s ) {
		return ! empty( $s->details['return'] ) ? add_query_arg( 'paid', $s->code, $s->details['return'] ) : self::link( $s );
	}

	/**
	 * Payment received. Idempotent: the same reference is applied once.
	 *
	 * @return object The sale.
	 */
	public static function mark_paid( $id, $amount_kobo, $reference ) {
		global $wpdb;
		$s = self::get( $id );
		if ( ! $s || 'paid' === $s->status || ( $s->reference && $s->reference === $reference ) ) {
			return $s;
		}
		if ( 'expired' === $s->status || 'cancelled' === $s->status ) {
			// The 15-minute hold ran out before the money arrived: try to take the seats again.
			$ok = apply_filters( 'ek_sale_retake', true, $s );
			if ( true !== $ok ) {
				$wpdb->update( $wpdb->prefix . 'ek_sales', array( 'status' => 'payment_conflict', 'reference' => mb_substr( $reference, 0, 100 ) ), array( 'id' => $s->id ) );
				Log::add( 'sale_conflict', 'sale', $s->id, $reference );
				Emails_Sales::conflict( self::get( $s->id ) );
				return self::get( $s->id );
			}
		}
		$wpdb->update(
			$wpdb->prefix . 'ek_sales',
			array(
				'status'       => 'paid',
				'amount_kobo'  => max( (int) $s->amount_kobo, (int) $amount_kobo ),
				'reference'    => mb_substr( (string) $reference, 0, 100 ),
				'paid_at'      => current_time( 'mysql', true ),
				'hold_expires' => null,
			),
			array( 'id' => $s->id )
		);
		$s = self::get( $s->id );
		Log::add( 'sale_paid', 'sale', $s->id, $s->kind . ' ' . $reference, array( 'amount_kobo' => (int) $s->amount_kobo ) );
		do_action( 'ek_sale_paid', $s );
		$s = self::get( $s->id );
		Emails_Sales::receipt( $s );
		return $s;
	}

	public static function payment_failed( $id ) {
		$s = self::get( $id );
		if ( $s && 'pending_payment' === $s->status ) {
			self::set_status( $s, 'cancelled' );
		}
	}

	private static function set_status( $s, $status, array $extra = array() ) {
		global $wpdb;
		$was = $s->status;
		$wpdb->update( $wpdb->prefix . 'ek_sales', array_merge( array( 'status' => $status, 'hold_expires' => null ), $extra ), array( 'id' => $s->id ) );
		$s = self::get( $s->id );
		if ( in_array( $was, array( 'pending_payment', 'paid' ), true ) && in_array( $status, array( 'cancelled', 'expired', 'refunded' ), true ) ) {
			do_action( 'ek_sale_released', $s );
		}
		Log::add( 'sale_' . $status, 'sale', $s->id, $was . ' → ' . $status );
		return $s;
	}

	public static function expire_holds() {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_sales WHERE status = 'pending_payment' AND hold_expires IS NOT NULL AND hold_expires < %s", current_time( 'mysql', true ) ) );
		foreach ( $ids as $id ) {
			self::set_status( self::get( $id ), 'expired' );
		}
		return count( $ids );
	}

	/**
	 * Cancel a sale; refund $refund_kobo (null = everything paid). Seats/tickets are given back.
	 *
	 * @return true|\WP_Error
	 */
	public static function cancel( $s, $refund_kobo = null, $note = '', $actor = 0 ) {
		if ( ! in_array( $s->status, array( 'paid', 'pending_payment' ), true ) ) {
			return new \WP_Error( 'status', __( 'This order cannot be cancelled now.', 'explore-katsina' ) );
		}
		$paid   = 'paid' === $s->status ? (int) $s->amount_kobo : 0;
		$refund = null === $refund_kobo ? $paid : max( 0, min( $paid, (int) $refund_kobo ) );
		$d      = $s->details;
		if ( $refund ) {
			$d['refund'] = array( 'amount' => $refund, 'status' => 'pending', 'note' => $note, 'at' => current_time( 'mysql', true ) );
			$sent        = false;
			if ( $s->order_id && Payments::woo_active() && function_exists( 'wc_create_refund' ) ) {
				$r = wc_create_refund( array( 'amount' => $refund / 100, 'reason' => $note ? $note : 'Cancelled', 'order_id' => (int) $s->order_id, 'refund_payment' => true ) );
				$sent = ! is_wp_error( $r );
			} elseif ( ! $s->order_id && Payments::test_mode_allowed() ) {
				$sent = true;
			}
			$d['refund']['status'] = $sent ? 'refunded' : 'manual';
			if ( ! $sent ) {
				Emails_Sales::refund_needed( $s, $refund );
			}
		}
		$s = self::set_status( $s, $refund ? 'refunded' : 'cancelled', array( 'details' => wp_json_encode( $d ) ) );
		Log::add( 'sale_cancelled', 'sale', $s->id, $note, array( 'refund_kobo' => $refund, 'by' => (int) $actor ) );
		Emails_Sales::cancelled( $s, $refund );
		return true;
	}

	/** Money actually kept from a sale (paid minus refunds). */
	public static function net( $s ) {
		return 'paid' === $s->status || 'refunded' === $s->status ? (int) $s->amount_kobo - (int) ( $s->details['refund']['amount'] ?? 0 ) : 0;
	}

	public static function for_customer( $uid, array $kinds = array() ) {
		global $wpdb;
		$k = $kinds ? ' AND kind IN (' . implode( ',', array_map( static fn( $x ) => "'" . esc_sql( $x ) . "'", $kinds ) ) . ')' : '';
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_sales WHERE customer_id = %d AND status IN ('paid','refunded','cancelled','payment_conflict'){$k} ORDER BY id DESC LIMIT 100", $uid ) ); // phpcs:ignore
		return array_map( array( __CLASS__, 'hydrate' ), $rows );
	}

	public static function list( $kind = '', $status = '', $limit = 100 ) {
		global $wpdb;
		$w = array( '1=1' );
		if ( $kind ) {
			$w[] = $wpdb->prepare( 'kind = %s', $kind );
		}
		if ( $status ) {
			$w[] = $wpdb->prepare( 'status = %s', $status );
		}
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_sales WHERE " . implode( ' AND ', $w ) . ' ORDER BY id DESC LIMIT %d', $limit ) ); // phpcs:ignore
		return array_map( array( __CLASS__, 'hydrate' ), $rows );
	}

	/** Admin/owner progress on service orders (setup, verified, promotion): new → in progress → done / rejected. */
	public static function set_stage( $id, $stage, $note = '' ) {
		global $wpdb;
		$s = self::get( $id );
		if ( ! $s ) {
			return false;
		}
		$d                 = $s->details;
		$d['stage_note']   = $note;
		$d['stage_at']     = current_time( 'mysql', true );
		$wpdb->update( $wpdb->prefix . 'ek_sales', array( 'stage' => sanitize_key( $stage ), 'details' => wp_json_encode( $d ) ), array( 'id' => $s->id ) );
		Log::add( 'sale_stage', 'sale', $s->id, $stage . ( $note ? ': ' . $note : '' ) );
		return self::get( $s->id );
	}

	/* ---------------- Local test payment screen ---------------- */

	public static function handle_test_payment() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'test_pay_sale' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		if ( ! Payments::test_mode_allowed() ) {
			wp_die( 'Test payments are disabled on this site.', '', array( 'response' => 403 ) );
		}
		$in = wp_unslash( $_POST ); // phpcs:ignore
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_test_pay_sale' ) ) {
			wp_die( 'Expired. Go back and try again.', '', array( 'response' => 400 ) );
		}
		$s = self::by_code( $in['code'] ?? '', $in['key'] ?? '' );
		if ( ! $s ) {
			wp_die( 'Order not found.', '', array( 'response' => 404 ) );
		}
		if ( 'success' === ( $in['result'] ?? '' ) ) {
			$s = self::mark_paid( $s->id, (int) $s->amount_kobo, 'TEST-' . strtoupper( wp_generate_password( 8, false ) ) );
			wp_safe_redirect( 'paid' === $s->status ? self::done_url( $s ) : self::link( $s ) );
		} else {
			self::payment_failed( $s->id );
			wp_safe_redirect( self::link( self::get( $s->id ) ) );
		}
		exit;
	}

	/** Guests cancel tour seats from their receipt (tickets are not refundable unless the event is cancelled). */
	public static function handle_guest_cancel() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'sale_cancel' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$in = wp_unslash( $_POST ); // phpcs:ignore
		$s  = self::by_code( $in['code'] ?? '', $in['key'] ?? '' );
		if ( ! $s || ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_sale_cancel_' . $s->code ) ) {
			wp_die( esc_html__( 'This link is not valid. Please use the link in your email.', 'explore-katsina' ), '', array( 'response' => 403 ) );
		}
		$ok = apply_filters( 'ek_sale_guest_can_cancel', new \WP_Error( 'no', __( 'This order cannot be cancelled online.', 'explore-katsina' ) ), $s );
		if ( true === $ok ) {
			self::cancel( $s, null, __( 'Cancelled by the guest', 'explore-katsina' ), get_current_user_id() );
		}
		wp_safe_redirect( add_query_arg( 'cancelled', true === $ok ? 1 : 0, self::link( $s ) ) );
		exit;
	}
}
