<?php
/**
 * Styles and scripts. Everything is served from the plugin (no outside CDNs),
 * so pages stay fast on mobile data and work if a CDN is blocked.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Assets {

	public static function init() {
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register' ), 5 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'auto_enqueue' ), 20 );
		add_action( 'wp_head', array( __CLASS__, 'js_flag' ), 1 );
	}

	private static function ver( $rel ) {
		$file = EK_DIR . $rel;
		return file_exists( $file ) ? EK_VERSION . '.' . filemtime( $file ) : EK_VERSION;
	}

	public static function register() {
		wp_register_style( 'ek-fonts', EK_URL . 'assets/fonts/fonts.css', array(), self::ver( 'assets/fonts/fonts.css' ) );
		wp_register_style( 'ek', EK_URL . 'assets/css/ek.css', array( 'ek-fonts' ), self::ver( 'assets/css/ek.css' ) );
		wp_register_style( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.css', array(), '1.9.4' );
		wp_register_script( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.js', array(), '1.9.4', true );

		wp_register_script( 'ek-map-picker', EK_URL . 'assets/js/map-picker.js', array( 'leaflet' ), self::ver( 'assets/js/map-picker.js' ), true );
		wp_localize_script( 'ek-map-picker', 'ekMap', self::map_config() );

		wp_register_script( 'ek-forms', EK_URL . 'assets/js/forms.js', array(), self::ver( 'assets/js/forms.js' ), true );
		wp_localize_script(
			'ek-forms',
			'ekForms',
			array(
				'maxMb'   => (int) Settings::get( 'max_photo_mb' ),
				'i18n'    => array(
					'required'  => __( 'Please fill in this field.', 'explore-katsina' ),
					'pin'       => __( 'Drag the pin to your exact location before continuing.', 'explore-katsina' ),
					'agreement' => __( 'Please accept the Listing & Partner Agreement.', 'explore-katsina' ),
					'tooBig'    => __( 'is larger than the size limit and will be skipped.', 'explore-katsina' ),
					'fixErrors' => __( 'Please check the highlighted fields.', 'explore-katsina' ),
				),
			)
		);

		wp_register_script( 'ek-track', EK_URL . 'assets/js/track.js', array(), self::ver( 'assets/js/track.js' ), true );
		wp_localize_script( 'ek-track', 'ekTrack', array( 'url' => esc_url_raw( rest_url( 'ek/v1/track' ) ) ) );

		wp_register_script( 'ek-search', EK_URL . 'assets/js/search.js', array( 'leaflet' ), self::ver( 'assets/js/search.js' ), true );
		wp_localize_script( 'ek-search', 'ekMap', self::map_config() );
		wp_localize_script(
			'ek-search',
			'ekSearch',
			array(
				'i18n' => array(
					'locating' => __( 'Finding you…', 'explore-katsina' ),
					'denied'   => __( 'We could not get your location. Please allow location access, or choose an LGA.', 'explore-katsina' ),
					'noGeo'    => __( 'Your browser cannot share its location.', 'explore-katsina' ),
					'view'     => __( 'View hotel', 'explore-katsina' ),
					'you'      => __( 'You are here', 'explore-katsina' ),
				),
			)
		);

		wp_register_script( 'ek-mini-map', EK_URL . 'assets/js/mini-map.js', array( 'leaflet' ), self::ver( 'assets/js/mini-map.js' ), true );
		wp_localize_script( 'ek-mini-map', 'ekMap', self::map_config() );
	}

	/**
	 * Map provider settings in one place. Phase 8 can switch to Google Maps by
	 * adding an API key; everything else reads from here.
	 */
	public static function map_config() {
		return array(
			'provider'    => 'leaflet-osm',
			'tiles'       => 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
			'attribution' => '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
			'centre'      => Business::CENTRE,
			'bounds'      => array( array( Business::BOUNDS['lat_min'], Business::BOUNDS['lng_min'] ), array( Business::BOUNDS['lat_max'], Business::BOUNDS['lng_max'] ) ),
			'pinColours'  => array(
				'hotel'         => '#8E1B2C',
				'restaurant'    => '#B07F1C',
				'event-centre'  => '#141B3A',
				'attraction'    => '#1F6B52',
				'tour-operator' => '#6E1422',
				'directory'     => '#5B5965',
			),
			'i18n'        => array(
				'locate'     => __( 'Use my location', 'explore-katsina' ),
				'locating'   => __( 'Finding you…', 'explore-katsina' ),
				'denied'     => __( 'We could not get your location. Drag the pin instead.', 'explore-katsina' ),
				'outside'    => __( 'That point is outside Katsina State. Move the pin inside the state.', 'explore-katsina' ),
				'dragHint'   => __( 'Drag the pin, or tap the map, to mark your exact entrance.', 'explore-katsina' ),
				'pinPlaced'  => __( 'Pin placed', 'explore-katsina' ),
			),
		);
	}

	public static function auto_enqueue() {
		$post = get_queried_object();
		if ( $post instanceof \WP_Post && preg_match( '/\[ek_(list_business|business_dashboard|hotel_search|booking)/', $post->post_content ) ) {
			wp_enqueue_style( 'ek' );
		}
		if ( is_singular( Post_Types::BUSINESS ) ) {
			wp_enqueue_style( 'ek' );
		}
	}

	public static function js_flag() {
		echo "<script>document.documentElement.classList.add('ek-js');</script>\n";
	}

	public static function enqueue_form( $with_map = true ) {
		wp_enqueue_style( 'ek' );
		wp_enqueue_script( 'ek-forms' );
		if ( $with_map ) {
			wp_enqueue_style( 'leaflet' );
			wp_enqueue_script( 'ek-map-picker' );
		}
	}
}
