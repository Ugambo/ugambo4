<?php
/**
 * Paid services for businesses:
 *  - Verified badge application (one-time fee). After payment it waits in wp-admin → Sales →
 *    "Verified applications"; you check the business and approve (badge given) or reject.
 *  - Listing setup service: an order page (/listing-setup/) where a business pays you to create its
 *    listing (photos, description, menu). Orders appear in wp-admin → Sales → "Setup orders".
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Services {

	public static function init() {
		add_action( 'ek_sale_paid', array( __CLASS__, 'fulfil' ) );
		add_shortcode( 'ek_setup_service', array( __CLASS__, 'setup_page' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle_setup' ), 8 );
	}

	public static function setup_packages() {
		$s = Settings::all();
		return array(
			'basic'  => array( __( 'Listing setup', 'explore-katsina' ), (int) $s['price_setup_basic'], __( 'We write your description, add your details, opening hours, rooms/menu/halls and the photos you send us.', 'explore-katsina' ) ),
			'photos' => array( __( 'Listing setup + photo visit', 'explore-katsina' ), (int) $s['price_setup_photos'], __( 'Everything in Listing setup, plus we visit and take good photos of your place (Katsina State).', 'explore-katsina' ) ),
		);
	}

	/* ---------------- Verified badge ---------------- */

	/** Latest Verified application for a business, or null. */
	public static function verification( $business_id ) {
		global $wpdb;
		$id = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_sales WHERE kind = 'verified' AND object_id = %d AND status IN ('paid','refunded') ORDER BY id DESC LIMIT 1", $business_id ) );
		return $id ? Sales::get( $id ) : null;
	}

	/** @return object|\WP_Error */
	public static function apply_verified( $business_id, $uid ) {
		if ( get_post_meta( $business_id, '_ek_verified', true ) ) {
			return new \WP_Error( 'done', __( 'Your business is already Verified.', 'explore-katsina' ) );
		}
		$v = self::verification( $business_id );
		if ( $v && 'paid' === $v->status && in_array( $v->stage, array( '', 'submitted' ), true ) ) {
			return new \WP_Error( 'pending', __( 'Your application is already being reviewed.', 'explore-katsina' ) );
		}
		$user = get_userdata( $uid );
		return Sales::create(
			array(
				'kind'        => 'verified',
				'object_id'   => $business_id,
				'amount_kobo' => (int) Settings::get( 'price_verified' ),
				'name'        => $user ? $user->display_name : '',
				'email'       => $user ? $user->user_email : '',
				'customer_id' => $uid,
				'details'     => array( 'title' => get_the_title( $business_id ), 'return' => Dashboard::url( 'plan', $business_id ) ),
			)
		);
	}

	/** Admin decision on a paid Verified application. @return true|\WP_Error */
	public static function decide_verified( $sale_id, $approve, $note, $admin_id, $refund = false ) {
		$s = Sales::get( $sale_id );
		if ( ! $s || 'verified' !== $s->kind || 'paid' !== $s->status || ! in_array( $s->stage, array( '', 'submitted' ), true ) ) {
			return new \WP_Error( 'state', __( 'This application is not waiting for a decision.', 'explore-katsina' ) );
		}
		$biz = (int) $s->object_id;
		if ( $approve ) {
			update_post_meta( $biz, '_ek_verified', 1 );
			Log::add( 'business_verified', 'business', $biz, $note ? $note : __( 'Paid Verified application approved', 'explore-katsina' ) );
			Sales::set_stage( $s->id, 'approved', $note );
		} else {
			if ( '' === trim( (string) $note ) ) {
				return new \WP_Error( 'reason', __( 'Give a reason so the business knows what to fix.', 'explore-katsina' ) );
			}
			Sales::set_stage( $s->id, 'rejected', $note );
			if ( $refund ) {
				Sales::cancel( Sales::get( $s->id ), null, $note, $admin_id );
			}
		}
		$to = Emails::business_recipients( $biz );
		if ( $to ) {
			Emails::send(
				$to,
				$approve ? __( 'You are now Verified on Explore Katsina', 'explore-katsina' ) : __( 'About your Verified application', 'explore-katsina' ),
				$approve ? __( 'Verified badge approved', 'explore-katsina' ) : __( 'We could not verify your business yet', 'explore-katsina' ),
				array_filter( array( $approve ? __( 'Your listing now shows the Verified badge. Thank you for helping us keep Explore Katsina trustworthy.', 'explore-katsina' ) : __( 'Reason:', 'explore-katsina' ) . ' ' . $note, $approve ? $note : ( $refund ? __( 'Your fee has been refunded.', 'explore-katsina' ) : __( 'Reply to this email if you have questions.', 'explore-katsina' ) ) ) ),
				array( 'label' => __( 'Open my dashboard', 'explore-katsina' ), 'url' => Dashboard::url( 'plan', $biz ) ),
				array( 'event' => $approve ? 'verified_approved' : 'verified_rejected', 'audience' => 'business', 'phone' => Emails::business_phone( $biz ) )
			);
		}
		return true;
	}

	public static function fulfil( $s ) {
		if ( 'verified' === $s->kind ) {
			Sales::set_stage( $s->id, 'submitted' );
			Log::add( 'verified_applied', 'business', $s->object_id, $s->code );
		} elseif ( 'setup' === $s->kind ) {
			Sales::set_stage( $s->id, 'new' );
		}
	}

	/* ---------------- Listing setup service ---------------- */

	private static $errors = array();
	private static $values = array();

	public static function handle_setup() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'setup_order' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_setup_order' ) || ! empty( $in['ek_company_hp'] ) ) {
			self::$errors['_form'] = __( 'Your session expired. Please try again.', 'explore-katsina' );
			return;
		}
		$pk    = self::setup_packages();
		$e     = array();
		$pack  = sanitize_key( $in['package'] ?? '' );
		$phone = Business::normalize_phone( $in['phone'] ?? '' );
		$email = sanitize_email( $in['email'] ?? '' );
		if ( ! isset( $pk[ $pack ] ) ) {
			$e['package'] = __( 'Choose a package.', 'explore-katsina' );
		}
		if ( mb_strlen( trim( (string) ( $in['business_name'] ?? '' ) ) ) < 2 ) {
			$e['business_name'] = __( 'Enter the business name.', 'explore-katsina' );
		}
		if ( ! isset( Business::types()[ sanitize_key( $in['type'] ?? '' ) ] ) ) {
			$e['type'] = __( 'Choose the type of business.', 'explore-katsina' );
		}
		if ( ! absint( $in['lga'] ?? 0 ) ) {
			$e['lga'] = __( 'Choose the LGA.', 'explore-katsina' );
		}
		if ( mb_strlen( trim( (string) ( $in['contact_name'] ?? '' ) ) ) < 2 ) {
			$e['contact_name'] = __( 'Enter your name.', 'explore-katsina' );
		}
		if ( ! $phone ) {
			$e['phone'] = __( 'Enter a Nigerian phone number, e.g. 0803 123 4567.', 'explore-katsina' );
		}
		if ( ! is_email( $email ) ) {
			$e['email'] = __( 'Enter a valid email address.', 'explore-katsina' );
		}
		if ( $e ) {
			self::$errors = $e;
			return;
		}
		$lga = get_term( absint( $in['lga'] ), Post_Types::TAX_LGA );
		$s   = Sales::create(
			array(
				'kind'        => 'setup',
				'amount_kobo' => $pk[ $pack ][1],
				'name'        => sanitize_text_field( $in['contact_name'] ),
				'email'       => $email,
				'phone'       => $phone,
				'details'     => array(
					'title'    => $pk[ $pack ][0] . ': ' . sanitize_text_field( $in['business_name'] ),
					'package'  => $pack,
					'business' => sanitize_text_field( $in['business_name'] ),
					'type'     => sanitize_key( $in['type'] ),
					'lga'      => $lga && ! is_wp_error( $lga ) ? $lga->name : '',
					'address'  => sanitize_text_field( $in['address'] ?? '' ),
					'notes'    => sanitize_textarea_field( $in['notes'] ?? '' ),
				),
			)
		);
		$url = Sales::pay_url( $s );
		if ( is_wp_error( $url ) ) {
			self::$errors['_form'] = $url->get_error_message();
			return;
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	public static function setup_page() {
		wp_enqueue_style( 'ek' );
		return View::render( 'public/setup-service', array( 'errors' => self::$errors, 'v' => self::$values, 'packages' => self::setup_packages() ) );
	}
}
