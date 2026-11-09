<?php
/**
 * Customer account: [ek_my_account]
 * Tabs: My Bookings (hotels, event centres), My Reservations (restaurants), My Orders (food orders and
 * shop/ticket/guide orders), Favourites, Profile. Plus log in / create account.
 *
 * Bookings made before having an account (or while logged out) are linked to the account only after
 * the person proves they own the email address (a signed link sent to that email).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Account {

	private static $errors = array();
	private static $values = array();

	public static function init() {
		add_shortcode( 'ek_my_account', array( __CLASS__, 'shortcode' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle' ), 8 );
	}

	public static function url( $tab = '', array $args = array() ) {
		return add_query_arg( array_filter( array_merge( array( 'tab' => $tab ), $args ) ), Install::page_url( 'account' ) );
	}

	public static function customer_role() {
		return get_role( 'customer' ) ? 'customer' : 'subscriber';
	}

	/* ---------------- Actions ---------------- */

	public static function handle() {
		// Email-verified linking of earlier bookings.
		if ( ! empty( $_GET['ek_link'] ) && is_user_logged_in() ) { // phpcs:ignore
			self::link_bookings( sanitize_text_field( wp_unslash( $_GET['ek_link'] ) ) ); // phpcs:ignore
		}
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			return;
		}
		$action = sanitize_key( $_POST['ek_action'] ?? '' ); // phpcs:ignore
		if ( ! in_array( $action, array( 'acct_register', 'acct_profile', 'acct_password', 'acct_link' ), true ) ) {
			return;
		}
		$in = wp_unslash( $_POST ); // phpcs:ignore
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_' . $action ) ) {
			self::$errors['_form'] = __( 'Your session expired. Please try again.', 'explore-katsina' );
			return;
		}
		$uid = get_current_user_id();
		switch ( $action ) {
			case 'acct_register':
				self::register( $in );
				break;
			case 'acct_profile':
				if ( ! $uid ) {
					return;
				}
				$name  = sanitize_text_field( $in['display_name'] ?? '' );
				$phone = Business::normalize_phone( $in['phone'] ?? '' );
				if ( mb_strlen( $name ) < 2 ) {
					self::$errors['display_name'] = __( 'Enter your name.', 'explore-katsina' );
					return;
				}
				if ( ! empty( $in['phone'] ) && ! $phone ) {
					self::$errors['phone'] = __( 'Enter a Nigerian phone number, or leave it empty.', 'explore-katsina' );
					return;
				}
				wp_update_user( array( 'ID' => $uid, 'display_name' => $name, 'first_name' => strtok( $name, ' ' ) ) );
				update_user_meta( $uid, '_ek_phone', $phone );
				View::flash( 'ok', __( 'Profile saved.', 'explore-katsina' ), $uid );
				wp_safe_redirect( self::url( 'profile' ) );
				exit;
			case 'acct_password':
				$user = wp_get_current_user();
				if ( ! $uid || ! wp_check_password( (string) ( $in['current_password'] ?? '' ), $user->user_pass, $uid ) ) {
					self::$errors['current_password'] = __( 'Your current password is not correct.', 'explore-katsina' );
					return;
				}
				if ( strlen( (string) ( $in['new_password'] ?? '' ) ) < 8 ) {
					self::$errors['new_password'] = __( 'Choose a new password of at least 8 characters.', 'explore-katsina' );
					return;
				}
				wp_set_password( (string) $in['new_password'], $uid );
				wp_set_auth_cookie( $uid, true );
				View::flash( 'ok', __( 'Password changed.', 'explore-katsina' ), $uid );
				wp_safe_redirect( self::url( 'profile' ) );
				exit;
			case 'acct_link':
				if ( $uid ) {
					self::send_link_email( $uid );
					View::flash( 'ok', __( 'We have emailed you a link. Open it on this device to add your earlier bookings to your account.', 'explore-katsina' ), $uid );
					wp_safe_redirect( self::url( 'bookings' ) );
					exit;
				}
				break;
		}
	}

	private static function register( array $in ) {
		self::$values = $in;
		if ( ! empty( $in['ek_company_hp'] ) ) {
			self::$errors['_form'] = __( 'Please try again.', 'explore-katsina' );
			return;
		}
		$name  = sanitize_text_field( $in['reg_name'] ?? '' );
		$email = sanitize_email( $in['reg_email'] ?? '' );
		$phone = Business::normalize_phone( $in['reg_phone'] ?? '' );
		$pass  = (string) ( $in['reg_password'] ?? '' );
		if ( mb_strlen( $name ) < 2 ) {
			self::$errors['reg_name'] = __( 'Enter your name.', 'explore-katsina' );
		}
		if ( ! is_email( $email ) ) {
			self::$errors['reg_email'] = __( 'Enter a valid email address.', 'explore-katsina' );
		} elseif ( email_exists( $email ) ) {
			self::$errors['reg_email'] = __( 'An account with this email already exists. Please log in.', 'explore-katsina' );
		}
		if ( ! empty( $in['reg_phone'] ) && ! $phone ) {
			self::$errors['reg_phone'] = __( 'Enter a Nigerian phone number, or leave it empty.', 'explore-katsina' );
		}
		if ( strlen( $pass ) < 8 ) {
			self::$errors['reg_password'] = __( 'Choose a password of at least 8 characters.', 'explore-katsina' );
		}
		if ( self::$errors ) {
			return;
		}
		$login = sanitize_user( strtok( $email, '@' ), true );
		$base  = $login ? $login : 'guest';
		for ( $i = 1; username_exists( $login ); $i++ ) {
			$login = $base . $i;
		}
		$uid = wp_insert_user(
			array(
				'user_login'   => $login,
				'user_email'   => $email,
				'user_pass'    => $pass,
				'display_name' => $name,
				'first_name'   => strtok( $name, ' ' ),
				'role'         => self::customer_role(),
			)
		);
		if ( is_wp_error( $uid ) ) {
			self::$errors['_form'] = $uid->get_error_message();
			return;
		}
		update_user_meta( $uid, '_ek_phone', $phone );
		wp_set_current_user( $uid );
		wp_set_auth_cookie( $uid, true );
		Emails::welcome( $uid );
		View::flash( 'ok', __( 'Welcome to Explore Katsina! Your account is ready.', 'explore-katsina' ), $uid );
		wp_safe_redirect( self::url( 'bookings' ) );
		exit;
	}

	/* ---------------- Linking earlier bookings ---------------- */

	private static function token( $uid, $expires ) {
		$user = get_userdata( $uid );
		return $uid . '.' . $expires . '.' . substr( hash_hmac( 'sha256', $uid . '|' . strtolower( $user->user_email ) . '|' . $expires, wp_salt( 'auth' ) ), 0, 32 );
	}

	public static function send_link_email( $uid ) {
		$user = get_userdata( $uid );
		$url  = add_query_arg( 'ek_link', self::token( $uid, time() + DAY_IN_SECONDS ), self::url( 'bookings' ) );
		Emails::send(
			$user->user_email,
			__( 'Add your earlier bookings to your account', 'explore-katsina' ),
			__( 'Confirm it’s your email', 'explore-katsina' ),
			array( __( 'Open this link while logged in to add every booking, reservation and order made with this email address to your Explore Katsina account. The link works for 24 hours.', 'explore-katsina' ) ),
			array( 'label' => __( 'Add my bookings', 'explore-katsina' ), 'url' => $url ),
			array( 'event' => 'account_link' )
		);
		return $url;
	}

	public static function link_bookings( $token, $uid = null ) {
		global $wpdb;
		$uid   = $uid ?? get_current_user_id();
		$parts = explode( '.', (string) $token );
		if ( 3 !== count( $parts ) || (int) $parts[0] !== (int) $uid || (int) $parts[1] < time() || ! hash_equals( self::token( $uid, (int) $parts[1] ), $token ) ) {
			View::flash( 'error', __( 'That link is not valid or has expired. Please ask for a new one.', 'explore-katsina' ), $uid );
			return 0;
		}
		$email = strtolower( get_userdata( $uid )->user_email );
		$n     = (int) $wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_bookings SET customer_id = %d WHERE customer_id = 0 AND LOWER(customer_email) = %s", $uid, $email ) );
		/* translators: %d: number */
		View::flash( 'ok', sprintf( _n( '%d booking added to your account.', '%d bookings added to your account.', $n, 'explore-katsina' ), $n ), $uid );
		return $n;
	}

	/* ---------------- Data ---------------- */

	public static function bookings( $uid, array $kinds ) {
		global $wpdb;
		$ph = implode( ',', array_fill( 0, count( $kinds ), '%s' ) );
		$ids = $wpdb->get_col(
			$wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE customer_id = %d AND kind IN ($ph) AND status NOT IN ('expired') ORDER BY (start_date >= CURDATE()) DESC, start_date ASC, id DESC LIMIT 200", array_merge( array( $uid ), $kinds ) ) // phpcs:ignore
		);
		return array_map( array( Booking::class, 'get' ), $ids );
	}

	public static function shop_orders( $uid ) {
		if ( ! function_exists( 'wc_get_orders' ) ) {
			return array();
		}
		$orders = wc_get_orders( array( 'customer_id' => $uid, 'limit' => 50, 'orderby' => 'date', 'order' => 'DESC' ) );
		return array_values( array_filter( $orders, static fn( $o ) => ! $o->get_meta( Payments_Woo::META ) && ! $o->get_meta( Payments_Woo::META_INVOICE ) && ! $o->get_meta( Payments_Woo::META_SALE ) ) );
	}

	/* ---------------- Render ---------------- */

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		nocache_headers();
		if ( ! is_user_logged_in() ) {
			return View::render( 'account/guest', array( 'errors' => self::$errors, 'v' => self::$values ) );
		}
		$tabs = array(
			'bookings'     => __( 'My Bookings', 'explore-katsina' ),
			'reservations' => __( 'My Reservations', 'explore-katsina' ),
			'orders'       => __( 'My Orders', 'explore-katsina' ),
			'favourites'   => __( 'Favourites', 'explore-katsina' ),
			'profile'      => __( 'Profile', 'explore-katsina' ),
		);
		$tab  = sanitize_key( $_GET['tab'] ?? 'bookings' ); // phpcs:ignore
		$tab  = isset( $tabs[ $tab ] ) ? $tab : 'bookings';
		return View::render( 'account/layout', array( 'tabs' => $tabs, 'tab' => $tab, 'errors' => self::$errors, 'uid' => get_current_user_id() ) );
	}
}
