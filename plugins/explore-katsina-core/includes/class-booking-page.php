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
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'book_hotel' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
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

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		nocache_headers();
		$g = $_GET; // phpcs:ignore WordPress.Security.NonceVerification

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
