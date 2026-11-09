<?php
/**
 * "Advertise with us" page: packages (from the price settings), media kit download (a PDF you upload
 * in Settings) and an enquiry form. Enquiries are saved (wp-admin → Enquiries) and emailed to you.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Advertise {

	private static $errors = array();
	private static $values = array();
	private static $sent   = false;

	public static function interests() {
		return array(
			'plan'      => __( 'Featured / Premium listing', 'explore-katsina' ),
			'banner'    => __( 'Banner ads', 'explore-katsina' ),
			'sponsored' => __( 'Sponsored article', 'explore-katsina' ),
			'event'     => __( 'Event promotion', 'explore-katsina' ),
			'partner'   => __( 'Partnership / referral', 'explore-katsina' ),
			'other'     => __( 'Something else', 'explore-katsina' ),
		);
	}

	public static function init() {
		add_shortcode( 'ek_advertise', array( __CLASS__, 'page' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle' ), 8 );
	}

	public static function handle() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'ad_enquiry' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		global $wpdb;
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_ad_enquiry' ) ) {
			self::$errors['_form'] = __( 'Your session expired. Please try again.', 'explore-katsina' );
			return;
		}
		if ( ! empty( $in['ek_company_hp'] ) ) {
			self::$sent = true; // Bots: pretend it worked.
			return;
		}
		$e     = array();
		$email = sanitize_email( $in['email'] ?? '' );
		if ( mb_strlen( trim( (string) ( $in['name'] ?? '' ) ) ) < 2 ) {
			$e['name'] = __( 'Enter your name.', 'explore-katsina' );
		}
		if ( ! is_email( $email ) ) {
			$e['email'] = __( 'Enter a valid email address.', 'explore-katsina' );
		}
		if ( mb_strlen( trim( (string) ( $in['message'] ?? '' ) ) ) < 10 ) {
			$e['message'] = __( 'Tell us a little about what you want (10 characters or more).', 'explore-katsina' );
		}
		$ip  = (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ); // phpcs:ignore
		$key = 'ek_enq_' . md5( $ip );
		if ( (int) get_transient( $key ) >= 5 ) {
			$e['_form'] = __( 'Too many enquiries from your connection. Please email us instead.', 'explore-katsina' );
		}
		if ( $e ) {
			self::$errors = $e;
			return;
		}
		set_transient( $key, (int) get_transient( $key ) + 1, HOUR_IN_SECONDS );
		$interest = isset( self::interests()[ $in['interest'] ?? '' ] ) ? $in['interest'] : 'other';
		$wpdb->insert(
			$wpdb->prefix . 'ek_enquiries',
			array(
				'name'       => mb_substr( sanitize_text_field( $in['name'] ), 0, 190 ),
				'company'    => mb_substr( sanitize_text_field( $in['company'] ?? '' ), 0, 190 ),
				'email'      => $email,
				'phone'      => (string) Business::normalize_phone( $in['phone'] ?? '' ),
				'interest'   => $interest,
				'message'    => sanitize_textarea_field( $in['message'] ),
				'created_at' => current_time( 'mysql', true ),
			)
		);
		Emails::send(
			Emails::admin_email(),
			/* translators: %s: name */
			sprintf( __( 'Advertising enquiry from %s', 'explore-katsina' ), sanitize_text_field( $in['name'] ) ),
			__( 'New advertising enquiry', 'explore-katsina' ),
			array( self::interests()[ $interest ], sanitize_text_field( $in['name'] ) . ' · ' . sanitize_text_field( $in['company'] ?? '' ) . ' · ' . $email . ' · ' . sanitize_text_field( $in['phone'] ?? '' ), sanitize_textarea_field( $in['message'] ) ),
			array( 'label' => __( 'Open enquiries', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-enquiries' ) ),
			array( 'event' => 'admin_ad_enquiry' )
		);
		wp_safe_redirect( add_query_arg( 'sent', 1, get_permalink() ) . '#enquiry' );
		exit;
	}

	public static function page() {
		wp_enqueue_style( 'ek' );
		return View::render( 'public/advertise', array( 'errors' => self::$errors, 'v' => self::$values, 'sent' => self::$sent || ! empty( $_GET['sent'] ) ) ); // phpcs:ignore
	}

	public static function list( $limit = 100 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_enquiries ORDER BY id DESC LIMIT %d", $limit ) );
	}
}
