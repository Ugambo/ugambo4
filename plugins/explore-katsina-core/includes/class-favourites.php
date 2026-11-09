<?php
/**
 * Favourites: customers save businesses (and, from Phase 10, attractions) with a heart button.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Favourites {

	public static function init() {
		add_action( 'template_redirect', array( __CLASS__, 'handle' ), 8 );
	}

	public static function has( $uid, $object_id ) {
		global $wpdb;
		return $uid && (bool) $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM {$wpdb->prefix}ek_favourites WHERE user_id = %d AND object_id = %d", $uid, $object_id ) );
	}

	public static function toggle( $uid, $object_id ) {
		global $wpdb;
		$post = get_post( (int) $object_id );
		if ( ! $uid || ! $post || 'publish' !== $post->post_status || ! in_array( $post->post_type, apply_filters( 'ek_favourite_types', array( Post_Types::BUSINESS ) ), true ) ) {
			return new \WP_Error( 'invalid', __( 'This place cannot be saved.', 'explore-katsina' ) );
		}
		if ( self::has( $uid, $object_id ) ) {
			$wpdb->delete( $wpdb->prefix . 'ek_favourites', array( 'user_id' => (int) $uid, 'object_id' => (int) $object_id ) );
			return false;
		}
		$wpdb->insert( $wpdb->prefix . 'ek_favourites', array( 'user_id' => (int) $uid, 'object_id' => (int) $object_id, 'created_at' => current_time( 'mysql', true ) ) );
		return true;
	}

	public static function for_user( $uid ) {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT object_id FROM {$wpdb->prefix}ek_favourites WHERE user_id = %d ORDER BY created_at DESC", $uid ) );
		return array_values( array_filter( array_map( 'get_post', $ids ), static fn( $p ) => $p && 'publish' === $p->post_status ) );
	}

	public static function handle() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'fav_toggle' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$id  = absint( $_POST['object_id'] ?? 0 ); // phpcs:ignore
		$uid = get_current_user_id();
		if ( ! $uid ) {
			wp_safe_redirect( Account::url( '', array( 'redirect_to' => get_permalink( $id ) ) ) );
			exit;
		}
		if ( ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['_ek_nonce'] ?? '' ) ), 'ek_fav_' . $id ) ) {
			wp_die( esc_html__( 'Please try again.', 'explore-katsina' ), '', array( 'response' => 400 ) );
		}
		self::toggle( $uid, $id );
		$back = wp_get_referer();
		wp_safe_redirect( $back ? $back : get_permalink( $id ) );
		exit;
	}

	/** Heart button (a small form, works without JavaScript). */
	public static function button( $object_id ) {
		$uid  = get_current_user_id();
		$on   = self::has( $uid, $object_id );
		$html = '<form method="post" class="ek-fav">';
		$html .= '<input type="hidden" name="ek_action" value="fav_toggle"><input type="hidden" name="object_id" value="' . (int) $object_id . '">';
		$html .= '<input type="hidden" name="_ek_nonce" value="' . esc_attr( wp_create_nonce( 'ek_fav_' . (int) $object_id ) ) . '">';
		$html .= '<button type="submit" class="ek-fav-btn' . ( $on ? ' is-on' : '' ) . '" aria-pressed="' . ( $on ? 'true' : 'false' ) . '">' . ( $on ? '♥ ' . esc_html__( 'Saved', 'explore-katsina' ) : '♡ ' . esc_html__( 'Save', 'explore-katsina' ) ) . '</button></form>';
		return $html;
	}
}
