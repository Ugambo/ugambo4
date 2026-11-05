<?php
/**
 * "List your business" sign-up: [ek_list_business]
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Signup {

	/** Form state when re-displaying after errors. */
	private static $state = array(
		'errors' => array(),
		'values' => array(),
	);

	public static function init() {
		add_shortcode( 'ek_list_business', array( __CLASS__, 'shortcode' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle' ), 5 );
	}

	private static function form_token() {
		$ts = time();
		return $ts . '.' . substr( hash_hmac( 'sha256', (string) $ts, wp_salt( 'nonce' ) ), 0, 16 );
	}

	private static function token_ok( $token ) {
		$parts = explode( '.', (string) $token );
		if ( 2 !== count( $parts ) ) {
			return false;
		}
		list( $ts, $sig ) = $parts;
		$good = hash_equals( substr( hash_hmac( 'sha256', $ts, wp_salt( 'nonce' ) ), 0, 16 ), $sig );
		$age  = time() - (int) $ts;
		// Bots submit instantly; real people take more than a few seconds. Expire after a day.
		return $good && $age >= 3 && $age <= DAY_IN_SECONDS;
	}

	public static function handle() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'signup' !== ( $_POST['ek_action'] ?? '' ) ) {
			return;
		}
		$in = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.NonceVerification
		self::$state['values'] = $in;

		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_signup' ) ) {
			self::$state['errors']['_form'] = __( 'Your session expired. Please submit the form again.', 'explore-katsina' );
			return;
		}
		if ( ! empty( $in['ek_company_hp'] ) || ! self::token_ok( $in['ek_t'] ?? '' ) ) {
			self::$state['errors']['_form'] = __( 'Please take a moment to fill in the form, then submit again.', 'explore-katsina' );
			return;
		}

		list( $profile, $errors )  = Business::validate_profile( $in, true );
		list( $private, $perrors ) = Business::validate_private( $in );
		$errors                     = array_merge( $errors, $perrors );

		if ( empty( $in['agreement'] ) ) {
			$errors['agreement'] = __( 'You must accept the Listing & Partner Agreement to list your business.', 'explore-katsina' );
		}

		$has_photo = ! empty( $_FILES['photos']['name'] ) && is_array( $_FILES['photos']['name'] ) && array_filter( $_FILES['photos']['name'] );
		if ( ! $has_photo ) {
			$errors['photos'] = __( 'Add at least one photo of your business.', 'explore-katsina' );
		}

		$user_id = get_current_user_id();
		if ( ! $user_id ) {
			$acc_email = sanitize_email( $in['account_email'] ?? '' );
			$acc_pass  = (string) ( $in['account_password'] ?? '' );
			if ( ! is_email( $acc_email ) ) {
				$errors['account_email'] = __( 'Enter the email address you will log in with.', 'explore-katsina' );
			} elseif ( email_exists( $acc_email ) ) {
				$errors['account_email'] = __( 'An account with this email already exists. Please log in first, then come back to this page.', 'explore-katsina' );
			}
			if ( strlen( $acc_pass ) < 8 ) {
				$errors['account_password'] = __( 'Choose a password of at least 8 characters.', 'explore-katsina' );
			}
		}

		if ( $errors ) {
			self::$state['errors'] = $errors;
			return;
		}

		// Files only after everything else is valid, so nothing is left behind.
		$id_doc = Private_Files::store_upload( 'id_document' );
		if ( is_wp_error( $id_doc ) ) {
			self::$state['errors']['id_document'] = $id_doc->get_error_message();
			return;
		}

		if ( ! $user_id ) {
			$user_id = wp_insert_user(
				array(
					'user_login'   => self::unique_login( $acc_email ),
					'user_email'   => $acc_email,
					'user_pass'    => $acc_pass,
					'display_name' => $private['owner_name'],
					'first_name'   => strtok( $private['owner_name'], ' ' ),
					'role'         => Install::ROLE_OWNER,
				)
			);
			if ( is_wp_error( $user_id ) ) {
				Private_Files::delete( $id_doc['file'] );
				self::$state['errors']['_form'] = $user_id->get_error_message();
				return;
			}
			$new_user = true;
		} else {
			$user = wp_get_current_user();
			if ( ! user_can( $user, 'edit_posts' ) && ! in_array( Install::ROLE_OWNER, (array) $user->roles, true ) ) {
				$user->add_role( Install::ROLE_OWNER );
			}
		}

		$business_id = Business::create( $profile, $user_id );
		if ( is_wp_error( $business_id ) ) {
			Private_Files::delete( $id_doc['file'] );
			self::$state['errors']['_form'] = $business_id->get_error_message();
			return;
		}

		Business::save_private(
			$business_id,
			$private,
			array(
				'id_doc_file'           => $id_doc['file'],
				'id_doc_mime'           => $id_doc['mime'],
				'agreement_version'     => (string) Settings::get( 'agreement_version' ),
				'agreement_accepted_at' => current_time( 'mysql', true ),
				'agreement_ip'          => sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ?? '' ) ),
			)
		);

		$photos = Photos::upload_many( 'photos', $business_id, Business::max_photos( $business_id ) );
		Business::set_photos( $business_id, $photos['ids'] );

		Log::add( 'business_submitted', 'business', $business_id, '', array( 'agreement_version' => Settings::get( 'agreement_version' ) ) );
		Emails::business_submitted( $business_id );

		if ( ! empty( $new_user ) ) {
			wp_set_current_user( $user_id );
			wp_set_auth_cookie( $user_id, true );
		}

		View::flash( 'ok', __( 'Thank you! Your business has been submitted and is waiting for approval. You can keep improving your profile here in the meantime.', 'explore-katsina' ), $user_id );
		foreach ( $photos['errors'] as $msg ) {
			View::flash( 'warn', $msg, $user_id );
		}
		wp_safe_redirect( add_query_arg( 'business', $business_id, Install::page_url( 'dashboard' ) ) );
		exit;
	}

	private static function unique_login( $email ) {
		$base  = sanitize_user( strtok( $email, '@' ), true );
		$base  = $base ? substr( $base, 0, 40 ) : 'business';
		$login = $base;
		$i     = 1;
		while ( username_exists( $login ) ) {
			$login = $base . ( ++$i );
		}
		return $login;
	}

	public static function shortcode() {
		Assets::enqueue_form( true );
		return View::render(
			'signup',
			array(
				'errors' => self::$state['errors'],
				'v'      => self::$state['values'],
				'token'  => self::form_token(),
			)
		);
	}
}
