<?php
/**
 * "Explore" hub page ([ek_explore]): one tap to every part of the guide, with live counts. It is the
 * "Explore" button of the mobile bottom navigation. Also registers the "Durbar Regalia" colour scheme
 * for wp-admin (used by default until someone picks another in their profile).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Explore {

	const ADMIN_SCHEME = 'ek-durbar';

	public static function init() {
		add_shortcode( 'ek_explore', array( __CLASS__, 'page' ) );
		add_action( 'admin_init', array( __CLASS__, 'admin_scheme' ) );
		add_filter( 'get_user_option_admin_color', array( __CLASS__, 'default_scheme' ) );
		add_action( 'login_enqueue_scripts', array( __CLASS__, 'login_style' ) );
		add_filter( 'login_headerurl', static fn() => home_url( '/' ) );
		add_filter( 'login_headertext', static fn() => get_bloginfo( 'name' ) );
	}

	public static function admin_scheme() {
		wp_admin_css_color( self::ADMIN_SCHEME, __( 'Explore Katsina (Durbar Regalia)', 'explore-katsina' ), EK_URL . 'assets/css/admin-colors.css', array( '#141B3A', '#222B52', '#8E1B2C', '#D2A03A' ), array( 'base' => '#F3EDE1', 'focus' => '#fff', 'current' => '#fff' ) );
	}

	/** Use the brand scheme unless the user picked another scheme ('fresh' and 'modern' are WordPress's defaults). */
	public static function default_scheme( $scheme ) {
		return ( ! $scheme || in_array( $scheme, array( 'fresh', 'modern' ), true ) ) ? self::ADMIN_SCHEME : $scheme;
	}

	/** Branded login screen: emblem and name instead of the WordPress logo, brand colours. */
	public static function login_style() {
		if ( ! wp_style_is( 'ek-fonts', 'registered' ) ) {
			wp_register_style( 'ek-fonts', EK_URL . 'assets/fonts/fonts.css', array(), EK_VERSION );
		}
		wp_enqueue_style( 'ek-fonts' );
		$emblem = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 30 36'%3E%3Cpath d='M2 35V15A13 13 0 0 1 28 15v20' fill='none' stroke='%23D2A03A' stroke-width='3'/%3E%3Cpath d='M8 35V17a7 7 0 0 1 14 0v18' fill='%238E1B2C'/%3E%3Cpath d='M15 3v4' stroke='%23D2A03A' stroke-width='3'/%3E%3C/svg%3E";
		wp_add_inline_style(
			'ek-fonts',
			'body.login{background:#141B3A;font-family:"Overpass",Arial,sans-serif}'
			. '.login h1 a{background:url("' . $emblem . '") no-repeat center top/56px 68px;width:auto;height:auto;padding-top:76px;text-indent:0;font:700 22px/1.2 "Unbounded",Arial,sans-serif;color:#D2A03A;overflow:visible}'
			. '.login form{border:0;border-top:5px solid #D2A03A;border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.35)}'
			. '.login .button-primary{background:#8E1B2C;border-color:#8E1B2C;border-radius:8px;min-height:40px;padding:0 18px;font-weight:700}'
			. '.login .button-primary:hover,.login .button-primary:focus{background:#6E1422;border-color:#6E1422}'
			. '.login input[type=text]:focus,.login input[type=password]:focus{border-color:#141B3A;box-shadow:0 0 0 2px #D2A03A}'
			. '.login #nav a,.login #backtoblog a,.login .privacy-policy-page-link a{color:#F3EDE1}.login #nav a:hover,.login #backtoblog a:hover{color:#D2A03A}'
			. '.login .button.wp-hide-pw .dashicons{color:#8E1B2C}.login .message,.login .notice{border-left-color:#D2A03A}'
			. '.language-switcher{display:none}'
		);
	}

	/** The hub's tiles: key => [title, text, page key or URL, icon path]. */
	public static function tiles() {
		$count = static fn( $type ) => (int) ( wp_count_posts( $type )->publish ?? 0 );
		$biz   = static function ( $type ) {
			global $wpdb;
			return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}ek_map_index WHERE type = %s", $type ) );
		};
		return array(
			'hotels'        => array( __( 'Hotels', 'explore-katsina' ), $biz( 'hotel' ), 'hotels' ),
			'restaurants'   => array( __( 'Restaurants', 'explore-katsina' ), $biz( 'restaurant' ), 'restaurants' ),
			'event_centres' => array( __( 'Event centres', 'explore-katsina' ), $biz( 'event-centre' ), 'event_centres' ),
			'things_to_do'  => array( __( 'Things to do', 'explore-katsina' ), $count( Attractions::CPT ), 'things_to_do' ),
			'events'        => array( __( 'Festivals & events', 'explore-katsina' ), count( Events::upcoming( 300 ) ), 'events' ),
			'tours'         => array( __( 'Tours', 'explore-katsina' ), $count( Tours::CPT ), 'tours' ),
			'top'           => array( __( 'Top 10 rankings', 'explore-katsina' ), null, 'top_hotels' ),
			'map'           => array( __( 'Katsina Map', 'explore-katsina' ), null, 'map' ),
			'plan'          => array( __( 'Plan your trip', 'explore-katsina' ), null, 'plan_trip' ),
			'stories'       => array( __( 'Stories', 'explore-katsina' ), $count( 'post' ), 'stories' ),
		);
	}

	public static function page() {
		wp_enqueue_style( 'ek' );
		return View::render( 'public/explore', array( 'tiles' => self::tiles() ) );
	}
}
