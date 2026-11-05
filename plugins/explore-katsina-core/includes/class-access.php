<?php
/**
 * Keeps business owners out of WordPress admin and sends them to their dashboard.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Access {

	public static function init() {
		add_action( 'admin_init', array( __CLASS__, 'block_admin' ), 1 );
		add_filter( 'show_admin_bar', array( __CLASS__, 'admin_bar' ) );
		add_filter( 'login_redirect', array( __CLASS__, 'login_redirect' ), 10, 3 );
	}

	/** Users who should only ever see the front-end (business owners, later customers). */
	public static function is_front_end_only( $user = null ) {
		$user = $user ? $user : wp_get_current_user();
		if ( ! $user || ! $user->exists() ) {
			return false;
		}
		return ! user_can( $user, 'edit_posts' );
	}

	public static function block_admin() {
		if ( wp_doing_ajax() || ( defined( 'WP_CLI' ) && WP_CLI ) ) {
			return;
		}
		if ( self::is_front_end_only() ) {
			wp_safe_redirect( Install::page_url( 'dashboard' ) );
			exit;
		}
	}

	public static function admin_bar( $show ) {
		return self::is_front_end_only() ? false : $show;
	}

	public static function login_redirect( $redirect_to, $requested, $user ) {
		if ( $user instanceof \WP_User && self::is_front_end_only( $user ) ) {
			if ( $requested && false === strpos( $requested, 'wp-admin' ) ) {
				return $requested;
			}
			return Install::page_url( 'dashboard' );
		}
		return $redirect_to;
	}
}
