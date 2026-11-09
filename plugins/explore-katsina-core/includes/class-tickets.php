<?php
/**
 * Event tickets: ticket types per event (Regular, VIP…), buying with a 15-minute hold (so an event
 * can never be oversold), one ticket per person with a QR code, and a check-in scanner page for
 * staff (/check-in/, only for admins and the "Ticket check-in staff" role).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Tickets {

	const MAX_PER_ORDER = 10;
	const ROLE          = 'ek_ticket_staff';
	const CAP           = 'ek_checkin';

	public static $error  = '';
	public static $values = array();

	public static function init() {
		add_action( 'template_redirect', array( __CLASS__, 'handle_buy' ), 8 );
		add_action( 'ek_sale_paid', array( __CLASS__, 'issue' ) );
		add_action( 'ek_sale_released', array( __CLASS__, 'release' ) );
		add_filter( 'ek_sale_retake', array( __CLASS__, 'retake' ), 10, 2 );
		add_filter( 'ek_sale_email_lines', array( __CLASS__, 'email_lines' ), 10, 2 );
		add_shortcode( 'ek_checkin', array( __CLASS__, 'checkin_page' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function add_role() {
		if ( ! get_role( self::ROLE ) ) {
			add_role( self::ROLE, __( 'Ticket check-in staff', 'explore-katsina' ), array( 'read' => true, self::CAP => true ) );
		}
		$admin = get_role( 'administrator' );
		if ( $admin && ! $admin->has_cap( self::CAP ) ) {
			$admin->add_cap( self::CAP );
		}
	}

	public static function types( $event_id ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_ticket_types WHERE event_id = %d ORDER BY sort, id", $event_id ) );
	}

	/** Save the ticket table from the event editor. Types with sales are never deleted. */
	public static function save_types( $event_id, array $rows ) {
		global $wpdb;
		$t    = $wpdb->prefix . 'ek_ticket_types';
		$keep = array();
		$sort = 0;
		foreach ( $rows as $r ) {
			$name = mb_substr( sanitize_text_field( $r['name'] ?? '' ), 0, 100 );
			$id   = absint( $r['id'] ?? 0 );
			$end  = sanitize_text_field( $r['sales_end'] ?? '' );
			$end  = $end ? get_gmt_from_date( str_replace( 'T', ' ', $end ) . ':00' ) : null;
			$row  = array(
				'event_id'   => (int) $event_id,
				'name'       => $name,
				'price_kobo' => Money::to_kobo( $r['price'] ?? '0' ),
				'quantity'   => absint( $r['quantity'] ?? 0 ),
				'sales_end'  => $end,
				'sort'       => $sort++,
			);
			if ( $id ) {
				$old = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d AND event_id = %d", $id, $event_id ) );
				if ( ! $old ) {
					continue;
				}
				if ( '' === $name && ! (int) $old->sold ) {
					$wpdb->delete( $t, array( 'id' => $id ) );
					continue;
				}
				$row['name']     = '' === $name ? $old->name : $name;
				$row['quantity'] = max( (int) $old->sold, $row['quantity'] );
				$wpdb->update( $t, $row, array( 'id' => $id ) );
				$keep[] = $id;
			} elseif ( '' !== $name && $row['quantity'] > 0 ) {
				$wpdb->insert( $t, $row );
				$keep[] = (int) $wpdb->insert_id;
			}
		}
		return $keep;
	}

	public static function available( $type ) {
		return max( 0, (int) $type->quantity - (int) $type->sold );
	}

	public static function on_sale( $type, $event_id ) {
		return self::available( $type ) > 0 && ( ! $type->sales_end || strtotime( $type->sales_end . ' UTC' ) > time() ) && ! Events::is_past( Events::data( $event_id ) ) && 'publish' === get_post_status( $event_id );
	}

	/**
	 * Buy tickets. $qty = [type_id => count]. Takes the tickets inside a locked transaction.
	 *
	 * @return object|\WP_Error The sale (waiting for payment unless free).
	 */
	public static function buy( $event_id, array $qty, $name, $email, $phone, $uid = 0 ) {
		global $wpdb;
		$qty   = array_filter( array_map( 'absint', $qty ) );
		$total = array_sum( $qty );
		if ( ! $total ) {
			return new \WP_Error( 'none', __( 'Choose at least one ticket.', 'explore-katsina' ) );
		}
		if ( $total > self::MAX_PER_ORDER ) {
			/* translators: %d: max */
			return new \WP_Error( 'max', sprintf( __( 'You can buy up to %d tickets per order.', 'explore-katsina' ), self::MAX_PER_ORDER ) );
		}
		$phone = Business::normalize_phone( $phone );
		if ( mb_strlen( trim( (string) $name ) ) < 2 || ! is_email( $email ) || ! $phone ) {
			return new \WP_Error( 'details', __( 'Enter your name, a valid email and a Nigerian phone number.', 'explore-katsina' ) );
		}
		$t = $wpdb->prefix . 'ek_ticket_types';
		$wpdb->query( 'START TRANSACTION' );
		$lines  = array();
		$amount = 0;
		foreach ( $qty as $type_id => $n ) {
			$type = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d AND event_id = %d FOR UPDATE", $type_id, $event_id ) );
			if ( ! $type || ! self::on_sale( $type, $event_id ) || self::available( $type ) < $n ) {
				$wpdb->query( 'ROLLBACK' );
				/* translators: %s: ticket type */
				return new \WP_Error( 'sold_out', $type ? sprintf( __( 'Sorry, only %1$d "%2$s" tickets are left.', 'explore-katsina' ), self::available( $type ), $type->name ) : __( 'That ticket is not on sale.', 'explore-katsina' ) );
			}
			$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET sold = sold + %d WHERE id = %d", $n, $type_id ) );
			$lines[] = array( 'type' => (int) $type_id, 'name' => $type->name, 'price' => (int) $type->price_kobo, 'qty' => (int) $n );
			$amount += (int) $type->price_kobo * $n;
		}
		$wpdb->query( 'COMMIT' );
		return Sales::create(
			array(
				'kind'        => 'ticket',
				'object_id'   => $event_id,
				'quantity'    => $total,
				'amount_kobo' => $amount,
				'name'        => sanitize_text_field( $name ),
				'email'       => sanitize_email( $email ),
				'phone'       => $phone,
				'customer_id' => $uid,
				'hold'        => true,
				'details'     => array( 'title' => get_the_title( $event_id ), 'lines' => $lines ),
			)
		);
	}

	public static function handle_buy() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'buy_tickets' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		$event        = absint( $in['event_id'] ?? 0 );
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_buy_tickets_' . $event ) || ! empty( $in['ek_company_hp'] ) ) {
			self::$error = __( 'Your session expired. Please try again.', 'explore-katsina' );
			return;
		}
		$s = self::buy( $event, (array) ( $in['qty'] ?? array() ), $in['guest_name'] ?? '', $in['guest_email'] ?? '', $in['guest_phone'] ?? '', get_current_user_id() );
		if ( is_wp_error( $s ) ) {
			self::$error = $s->get_error_message();
			return;
		}
		$url = Sales::pay_url( $s );
		if ( is_wp_error( $url ) ) {
			Sales::payment_failed( $s->id );
			self::$error = $url->get_error_message();
			return;
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	private static function new_code() {
		global $wpdb;
		do {
			$code = '';
			$abc  = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
			for ( $i = 0; $i < 16; $i++ ) {
				$code .= $abc[ random_int( 0, strlen( $abc ) - 1 ) ];
			}
		} while ( $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM {$wpdb->prefix}ek_tickets WHERE code = %s", $code ) ) );
		return $code;
	}

	/** Paid: one ticket per person, each with its own secret code (shown as a QR code). */
	public static function issue( $s ) {
		global $wpdb;
		if ( 'ticket' !== $s->kind || self::for_sale( $s->id ) ) {
			return;
		}
		foreach ( (array) ( $s->details['lines'] ?? array() ) as $l ) {
			for ( $i = 0; $i < (int) $l['qty']; $i++ ) {
				$wpdb->insert( $wpdb->prefix . 'ek_tickets', array( 'sale_id' => $s->id, 'event_id' => $s->object_id, 'type_id' => $l['type'], 'code' => self::new_code(), 'holder' => $s->customer_name ) );
			}
		}
	}

	/** Unpaid hold ended, or order cancelled: tickets go back on sale; issued tickets stop working. */
	public static function release( $s ) {
		global $wpdb;
		if ( 'ticket' !== $s->kind ) {
			return;
		}
		foreach ( (array) ( $s->details['lines'] ?? array() ) as $l ) {
			$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_ticket_types SET sold = GREATEST(0, sold - %d) WHERE id = %d", (int) $l['qty'], (int) $l['type'] ) );
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_tickets SET status = 'void' WHERE sale_id = %d", $s->id ) );
	}

	/** Payment arrived after the hold ended: take the tickets again if any are left. */
	public static function retake( $ok, $s ) {
		global $wpdb;
		if ( 'ticket' !== $s->kind ) {
			return $ok;
		}
		$t = $wpdb->prefix . 'ek_ticket_types';
		$wpdb->query( 'START TRANSACTION' );
		foreach ( (array) ( $s->details['lines'] ?? array() ) as $l ) {
			$type = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d FOR UPDATE", (int) $l['type'] ) );
			if ( ! $type || self::available( $type ) < (int) $l['qty'] ) {
				$wpdb->query( 'ROLLBACK' );
				return new \WP_Error( 'sold_out', 'Sold out' );
			}
			$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET sold = sold + %d WHERE id = %d", (int) $l['qty'], (int) $l['type'] ) );
		}
		$wpdb->query( 'COMMIT' );
		return true;
	}

	public static function email_lines( $lines, $s ) {
		if ( 'ticket' === $s->kind && $s->object_id ) {
			$d       = Events::data( $s->object_id );
			$lines[] = __( 'When:', 'explore-katsina' ) . ' ' . Events::when( $d );
			if ( $d['venue'] ) {
				$lines[] = __( 'Where:', 'explore-katsina' ) . ' ' . $d['venue'];
			}
			foreach ( (array) ( $s->details['lines'] ?? array() ) as $l ) {
				$lines[] = $l['qty'] . ' × ' . $l['name'];
			}
			$lines[] = __( 'Your tickets with QR codes are on the order page (button below). Show them on your phone or print them.', 'explore-katsina' );
		}
		return $lines;
	}

	public static function for_sale( $sale_id ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT k.*, t.name AS type_name FROM {$wpdb->prefix}ek_tickets k LEFT JOIN {$wpdb->prefix}ek_ticket_types t ON t.id = k.type_id WHERE k.sale_id = %d ORDER BY k.id", $sale_id ) );
	}

	/* ---------------- Check-in ---------------- */

	public static function routes() {
		register_rest_route(
			'ek/v1',
			'/checkin',
			array(
				'methods'             => 'POST',
				'permission_callback' => static fn() => current_user_can( self::CAP ),
				'callback'            => array( __CLASS__, 'rest_checkin' ),
			)
		);
	}

	/**
	 * @return array{result:string, message:string, holder?:string, type?:string, at?:string}
	 *   result: ok | already | void | wrong_event | invalid
	 */
	public static function check_in( $code, $event_id, $staff_id ) {
		global $wpdb;
		$code = strtoupper( preg_replace( '/[^A-Za-z0-9]/', '', (string) $code ) );
		$k    = $wpdb->get_row( $wpdb->prepare( "SELECT k.*, t.name AS type_name FROM {$wpdb->prefix}ek_tickets k LEFT JOIN {$wpdb->prefix}ek_ticket_types t ON t.id = k.type_id WHERE k.code = %s", $code ) );
		if ( ! $k ) {
			return array( 'result' => 'invalid', 'message' => __( 'Not a valid ticket.', 'explore-katsina' ) );
		}
		$base = array( 'holder' => $k->holder, 'type' => (string) $k->type_name );
		if ( (int) $k->event_id !== (int) $event_id ) {
			/* translators: %s: event */
			return $base + array( 'result' => 'wrong_event', 'message' => sprintf( __( 'This ticket is for another event: %s', 'explore-katsina' ), get_the_title( $k->event_id ) ) );
		}
		if ( 'void' === $k->status ) {
			return $base + array( 'result' => 'void', 'message' => __( 'This ticket was cancelled.', 'explore-katsina' ) );
		}
		$n = $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_tickets SET status = 'used', checked_in_at = %s, checked_in_by = %d WHERE id = %d AND status = 'valid'", current_time( 'mysql', true ), $staff_id, $k->id ) );
		if ( ! $n ) {
			/* translators: %s: time */
			return $base + array( 'result' => 'already', 'message' => sprintf( __( 'Already used at %s.', 'explore-katsina' ), View::date( $k->checked_in_at, true ) ), 'at' => $k->checked_in_at );
		}
		return $base + array( 'result' => 'ok', 'message' => __( 'Welcome! Ticket checked in.', 'explore-katsina' ) );
	}

	public static function counts( $event_id ) {
		global $wpdb;
		$r = $wpdb->get_row( $wpdb->prepare( "SELECT SUM(status <> 'void') issued, SUM(status = 'used') used FROM {$wpdb->prefix}ek_tickets WHERE event_id = %d", $event_id ) );
		return array( 'issued' => (int) $r->issued, 'used' => (int) $r->used );
	}

	public static function rest_checkin( \WP_REST_Request $r ) {
		$res = self::check_in( (string) $r['code'], absint( $r['event'] ), get_current_user_id() );
		return rest_ensure_response( $res + array( 'counts' => self::counts( absint( $r['event'] ) ) ) );
	}

	public static function checkin_page() {
		nocache_headers();
		wp_enqueue_style( 'ek' );
		if ( ! current_user_can( self::CAP ) ) {
			return '<div class="ek"><div class="ek-card ek-stack" style="max-width:420px;margin:0 auto"><h1 style="margin:0">' . esc_html__( 'Ticket check-in', 'explore-katsina' ) . '</h1><p style="margin:0">' . esc_html__( 'Staff only. Please log in with a check-in account.', 'explore-katsina' ) . '</p>' . wp_login_form( array( 'echo' => false, 'redirect' => get_permalink() ) ) . '</div></div>';
		}
		wp_enqueue_script( 'ek-jsqr', EK_URL . 'assets/vendor/jsqr/jsQR.js', array(), '1.4.0', true );
		wp_enqueue_script( 'ek-checkin', EK_URL . 'assets/js/checkin.js', array( 'ek-jsqr' ), Assets::ver( 'assets/js/checkin.js' ), true );
		wp_localize_script( 'ek-checkin', 'ekCheckin', array( 'url' => esc_url_raw( rest_url( 'ek/v1/checkin' ) ), 'nonce' => wp_create_nonce( 'wp_rest' ), 'noCamera' => __( 'Camera not available: type the code instead.', 'explore-katsina' ) ) );
		$events = array_filter( Events::upcoming( 100 ), static fn( $id ) => (bool) self::types( $id ) );
		return View::render( 'public/checkin', array( 'events' => $events ) );
	}
}
