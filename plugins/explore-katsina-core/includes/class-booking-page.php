<?php
/**
 * The "Book" page: [ek_booking]
 *   ?room=…&checkin=…&checkout=…&guests=…&rooms=…  → guest details + payment choice
 *   ?pay=CODE&key=…                                 → local test payment screen (dev only)
 *   ?booking=CODE&key=…                             → confirmation / booking status
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Booking_Page {

	private static $error  = '';
	private static $values = array();

	public static function init() {
		add_shortcode( 'ek_booking', array( __CLASS__, 'shortcode' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle' ), 7 );
		add_action( 'template_redirect', array( Payments::class, 'handle_test_payment' ), 7 );
	}

	public static function handle() {
		$action = 'POST' === ( $_SERVER['REQUEST_METHOD'] ?? '' ) ? sanitize_key( $_POST['ek_action'] ?? '' ) : ''; // phpcs:ignore
		if ( in_array( $action, array( 'guest_cancel', 'guest_review', 'guest_complaint' ), true ) ) {
			self::handle_guest_action( $action );
			return;
		}
		if ( in_array( $action, array( 'reserve_table', 'place_order', 'book_event' ), true ) ) {
			self::handle_restaurant( $action );
			return;
		}
		if ( 'book_hotel' !== $action ) {
			return;
		}
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_book_hotel' ) ) {
			self::$error = __( 'Your session expired. Please check the details and try again.', 'explore-katsina' );
			return;
		}
		if ( ! empty( $in['ek_company_hp'] ) ) {
			self::$error = __( 'Please try again.', 'explore-katsina' );
			return;
		}
		if ( empty( $in['agree'] ) ) {
			self::$error = __( 'Please accept the hotel’s cancellation policy and our booking terms.', 'explore-katsina' );
			return;
		}
		$b = Booking::create_hotel(
			array(
				'room_id'     => absint( $in['room'] ?? 0 ),
				'checkin'     => sanitize_text_field( $in['checkin'] ?? '' ),
				'checkout'    => sanitize_text_field( $in['checkout'] ?? '' ),
				'guests'      => absint( $in['guests'] ?? 1 ),
				'rooms'       => absint( $in['rooms'] ?? 1 ),
				'payment'     => sanitize_key( $in['payment'] ?? '' ),
				'name'        => $in['guest_name'] ?? '',
				'email'       => $in['guest_email'] ?? '',
				'phone'       => $in['guest_phone'] ?? '',
				'notes'       => $in['notes'] ?? '',
				'customer_id' => get_current_user_id(),
			)
		);
		if ( is_wp_error( $b ) ) {
			self::$error = $b->get_error_message();
			return;
		}
		$url = 'pending_payment' === $b->status ? Payments::start( $b ) : Booking::link( $b );
		if ( is_wp_error( $url ) ) {
			Booking::payment_failed( $b->id );
			self::$error = $url->get_error_message();
			return;
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect -- may be the payment page.
		exit;
	}

	/** @var string Messages for the confirmation page. */
	public static $notice = '';
	public static $review_values = array();

	/**
	 * The guest cancels or reviews from their booking page. Allowed with the booking's secret
	 * link (code + key from the email) or when logged in as the customer who made it.
	 */
	private static function handle_guest_action( $action ) {
		$in = wp_unslash( $_POST ); // phpcs:ignore
		$b  = Booking::by_code( sanitize_text_field( $in['code'] ?? '' ), sanitize_text_field( $in['key'] ?? '' ) );
		if ( ! $b || ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_' . $action . '_' . $b->code ) ) {
			wp_die( esc_html__( 'This link is not valid. Please use the link in your email.', 'explore-katsina' ), '', array( 'response' => 403 ) );
		}
		if ( 'guest_cancel' === $action ) {
			$r = Refunds::guest_cancel( $b, get_current_user_id() );
			self::$notice = is_wp_error( $r ) ? $r->get_error_message() : '';
			if ( ! is_wp_error( $r ) ) {
				wp_safe_redirect( add_query_arg( 'cancelled', 1, Booking::link( $b ) ) );
				exit;
			}
			return;
		}
		if ( 'guest_complaint' === $action ) {
			$r = Complaints::report( $b, $in['complaint'] ?? '' );
			if ( is_wp_error( $r ) ) {
				self::$notice                     = $r->get_error_message();
				self::$review_values['complaint'] = $in['complaint'] ?? '';
				return;
			}
			wp_safe_redirect( add_query_arg( 'reported', 1, Booking::link( $b ) ) . '#problem' );
			exit;
		}
		$r = Reviews::submit( $b, $in );
		if ( is_wp_error( $r ) ) {
			self::$notice        = $r->get_error_message();
			self::$review_values = $in;
			return;
		}
		wp_safe_redirect( add_query_arg( 'reviewed', 1, Booking::link( $b ) ) . '#review' );
		exit;
	}

	/** Table reservation or food order form submitted. */
	private static function handle_restaurant( $action ) {
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_' . $action ) || ! empty( $in['ek_company_hp'] ) ) {
			self::$error = __( 'Your session expired. Please check the details and try again.', 'explore-katsina' );
			return;
		}
		$guest = array(
			'name'        => $in['guest_name'] ?? '',
			'email'       => $in['guest_email'] ?? '',
			'phone'       => $in['guest_phone'] ?? '',
			'notes'       => $in['notes'] ?? '',
			'customer_id' => get_current_user_id(),
		);
		if ( 'book_event' === $action ) {
			$b = Booking::create_event(
				$guest + array(
					'hall_id'    => absint( $in['hall'] ?? 0 ),
					'start'      => sanitize_text_field( $in['date'] ?? '' ),
					'end'        => sanitize_text_field( $in['end'] ?? '' ),
					'guests'     => absint( $in['guests'] ?? 0 ),
					'layout'     => sanitize_key( $in['layout'] ?? '' ),
					'event_type' => sanitize_key( $in['event_type'] ?? '' ),
				)
			);
		} elseif ( 'reserve_table' === $action ) {
			$b = Booking::create_reservation(
				$guest + array(
					'business_id' => absint( $in['reserve'] ?? 0 ),
					'date'        => sanitize_text_field( $in['date'] ?? '' ),
					'time'        => sanitize_text_field( $in['time'] ?? '' ),
					'party'       => absint( $in['party'] ?? 0 ),
				)
			);
		} else {
			$b = Booking::create_order(
				$guest + array(
					'business_id' => absint( $in['order'] ?? 0 ),
					'items'       => array_map( 'absint', (array) ( $in['items'] ?? array() ) ),
					'fulfilment'  => sanitize_key( $in['fulfilment'] ?? '' ),
					'address'     => $in['address'] ?? '',
					'pay'         => sanitize_key( $in['pay'] ?? '' ),
				)
			);
		}
		if ( is_wp_error( $b ) ) {
			self::$error = $b->get_error_message();
			return;
		}
		$url = 'pending_payment' === $b->status ? Payments::start( $b ) : Booking::link( $b );
		if ( is_wp_error( $url ) ) {
			Booking::payment_failed( $b->id );
			self::$error = $url->get_error_message();
			return;
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		nocache_headers();
		$g = $_GET; // phpcs:ignore WordPress.Security.NonceVerification

		if ( ! empty( $g['sale'] ) || ! empty( $g['pay_sale'] ) ) {
			$test = ! empty( $g['pay_sale'] );
			$s    = Sales::by_code( sanitize_text_field( wp_unslash( $test ? $g['pay_sale'] : $g['sale'] ) ), sanitize_text_field( wp_unslash( $g['key'] ?? '' ) ) );
			if ( ! $s || ( $test && ! Payments::test_mode_allowed() ) ) {
				return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Order not found', 'explore-katsina' ) . '</strong>' . esc_html__( 'Please use the link in your email.', 'explore-katsina' ) . '</div></div>';
			}
			if ( 'pending_payment' === $s->status && $s->hold_expires && strtotime( $s->hold_expires . ' UTC' ) < time() ) {
				Sales::expire_holds();
				$s = Sales::get( $s->id );
			}
			return View::render( $test ? 'sale/test-pay' : 'sale/receipt', array( 's' => $s ) );
		}

		if ( ! empty( $g['booking'] ) ) {
			$b = Booking::by_code( sanitize_text_field( wp_unslash( $g['booking'] ) ), sanitize_text_field( wp_unslash( $g['key'] ?? '' ) ) );
			if ( ! $b ) {
				return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Booking not found', 'explore-katsina' ) . '</strong>' . esc_html__( 'Please use the link in your confirmation email.', 'explore-katsina' ) . '</div></div>';
			}
			if ( 'pending_payment' === $b->status && $b->hold_expires && strtotime( $b->hold_expires . ' UTC' ) < time() ) {
				Booking::expire_holds();
				$b = Booking::get( $b->id );
			}
			return View::render( 'booking/confirmation', array( 'b' => $b ) );
		}

		if ( ! empty( $g['pay'] ) ) {
			$b = Booking::by_code( sanitize_text_field( wp_unslash( $g['pay'] ) ), sanitize_text_field( wp_unslash( $g['key'] ?? '' ) ) );
			if ( ! $b || ! Payments::test_mode_allowed() ) {
				return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Payment link not valid', 'explore-katsina' ) . '</strong></div></div>';
			}
			return View::render( 'booking/test-pay', array( 'b' => $b ) );
		}

		if ( ! empty( $g['hall'] ) || ! empty( self::$values['hall'] ) ) {
			$src  = self::$values ? self::$values : $g;
			$hall = Halls::data( absint( $src['hall'] ?? 0 ) );
			if ( ! $hall || ! $hall['active'] || 'publish' !== get_post_status( $hall['venue_id'] ) ) {
				return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Hall not found', 'explore-katsina' ) . '</strong></div></div>';
			}
			return View::render( 'booking/event', array( 'hall' => $hall, 'venue' => Business::profile( $hall['venue_id'] ), 'src' => $src, 'error' => self::$error, 'v' => self::$values ) );
		}

		if ( ! empty( $g['reserve'] ) || ! empty( self::$values['reserve'] ) ) {
			$src = self::$values ? self::$values : $g;
			$bid = absint( $src['reserve'] ?? 0 );
			if ( 'restaurant' !== Business::type_of( $bid ) || 'publish' !== get_post_status( $bid ) ) {
				return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Restaurant not found', 'explore-katsina' ) . '</strong></div></div>';
			}
			return View::render( 'booking/reserve', array( 'r' => Business::profile( $bid ), 'src' => $src, 'error' => self::$error, 'v' => self::$values ) );
		}

		if ( ! empty( $g['order'] ) ) {
			$bid = absint( $g['order'] );
			if ( ! Restaurant::ordering_open( $bid ) || 'publish' !== get_post_status( $bid ) ) {
				return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Online ordering is not available', 'explore-katsina' ) . '</strong>' . esc_html__( 'Please call or WhatsApp the restaurant to order.', 'explore-katsina' ) . '</div></div>';
			}
			$src = wp_unslash( $_POST ); // phpcs:ignore
			return View::render( 'booking/order', array( 'r' => Business::profile( $bid ), 'src' => $src, 'error' => self::$error ) );
		}

		$src  = self::$values ? self::$values : $g;
		$p    = Hotel_Search::params( $src );
		$room = Rooms::data( absint( $src['room'] ?? 0 ) );
		if ( ! $room || ! $room['active'] || 'publish' !== get_post_status( $room['hotel_id'] ) ) {
			return '<div class="ek"><div class="ek-empty"><strong>' . esc_html__( 'Choose a room first', 'explore-katsina' ) . '</strong><a href="' . esc_url( Install::page_url( 'hotels' ) ) . '">' . esc_html__( 'Find a hotel', 'explore-katsina' ) . '</a></div></div>';
		}
		return View::render(
			'booking/form',
			array(
				'room'   => $room,
				'hotel'  => Business::profile( $room['hotel_id'] ),
				'p'      => $p,
				'error'  => self::$error,
				'v'      => self::$values,
			)
		);
	}
}
