<?php
/**
 * The full-screen Katsina Map ([ek_map] on the "Katsina Map" page) and its data endpoint
 * GET /wp-json/ek/v1/map, which returns only the pins inside the visible area.
 *
 * Visitors' locations are used only to work out distances for that one request and are never stored.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Map_Page {

	const TYPES = array( 'hotel', 'restaurant', 'event-centre', 'attraction' );

	public static function init() {
		add_shortcode( 'ek_map', array( __CLASS__, 'shortcode' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
		add_filter( 'template_include', array( __CLASS__, 'shell' ), 99 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'assets' ) );
	}

	public static function is_map_page() {
		return Install::is_page( 'map' );
	}

	/** The map page uses its own full-screen layout (no theme header/footer). */
	public static function shell( $template ) {
		return self::is_map_page() ? EK_DIR . 'templates/map-shell.php' : $template;
	}

	public static function assets() {
		if ( ! self::is_map_page() ) {
			return;
		}
		wp_enqueue_style( 'ek' );
		wp_enqueue_style( 'leaflet' );
		wp_enqueue_style( 'ek-markercluster', EK_URL . 'assets/vendor/markercluster/MarkerCluster.css', array( 'leaflet' ), '1.5.3' );
		wp_enqueue_script( 'ek-markercluster', EK_URL . 'assets/vendor/markercluster/leaflet.markercluster.js', array( 'leaflet' ), '1.5.3', true );
		wp_enqueue_script( 'ek-track' );
		wp_enqueue_script( 'ek-kmap', EK_URL . 'assets/js/katsina-map.js', array( 'leaflet', 'ek-markercluster', 'ek-track' ), Assets::ver( 'assets/js/katsina-map.js' ), true );
		$focus = absint( $_GET['focus'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification
		$fpin  = null;
		if ( $focus ) {
			global $wpdb;
			$row  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_map_index WHERE object_id = %d", $focus ) );
			$fpin = $row ? Map_Index::card( $row ) : null;
		}
		$cfg = Assets::map_config();
		wp_localize_script(
			'ek-kmap',
			'ekKmap',
			array(
				'rest'    => esc_url_raw( rest_url( 'ek/v1/map' ) ),
				'tiles'   => $cfg['tiles'],
				'attribution' => $cfg['attribution'],
				'centre'  => $cfg['centre'],
				'bounds'  => $cfg['bounds'],
				'colours' => $cfg['pinColours'],
				'labels'  => self::type_labels(),
				'focus'   => $fpin,
				'i18n'    => array(
					'places'     => __( '%d places', 'explore-katsina' ),
					'place'      => __( '1 place', 'explore-katsina' ),
					'none'       => __( 'Nothing here with these filters. Try zooming out or removing a filter.', 'explore-katsina' ),
					'zoomIn'     => __( 'Showing the first places only: zoom in to see everything here.', 'explore-katsina' ),
					'loading'    => __( 'Loading…', 'explore-katsina' ),
					'error'      => __( 'Could not load places. Check your connection and try again.', 'explore-katsina' ),
					'locating'   => __( 'Finding you…', 'explore-katsina' ),
					'denied'     => __( 'We could not get your location. You can still browse the map.', 'explore-katsina' ),
					'outside'    => __( 'You seem to be outside Katsina State: distances are from where you are.', 'explore-katsina' ),
					'you'        => __( 'You are here', 'explore-katsina' ),
					'view'       => __( 'View', 'explore-katsina' ),
					'directions' => __( 'Directions', 'explore-katsina' ),
					'whatsapp'   => __( 'WhatsApp', 'explore-katsina' ),
					'featured'   => __( 'Featured', 'explore-katsina' ),
					'reviews'    => __( '%d reviews', 'explore-katsina' ),
					'review'     => __( '1 review', 'explore-katsina' ),
					'noReviews'  => __( 'No reviews yet', 'explore-katsina' ),
					'newPlace'   => __( 'New, not yet ranked', 'explore-katsina' ),
					'away'       => __( '%s away', 'explore-katsina' ),
					'openNow'    => __( 'Open now', 'explore-katsina' ),
					'closed'     => __( 'Closed now', 'explore-katsina' ),
					'showList'   => __( 'Show list', 'explore-katsina' ),
					'showMap'    => __( 'Show map', 'explore-katsina' ),
				),
			)
		);
	}

	public static function type_labels() {
		return array(
			'hotel'        => __( 'Hotels', 'explore-katsina' ),
			'restaurant'   => __( 'Restaurants', 'explore-katsina' ),
			'event-centre' => __( 'Event centres', 'explore-katsina' ),
			'attraction'   => __( 'Attractions', 'explore-katsina' ),
		);
	}

	public static function routes() {
		register_rest_route(
			'ek/v1',
			'/map',
			array(
				'methods'             => 'GET',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'rest' ),
			)
		);
	}

	public static function rest( \WP_REST_Request $r ) {
		$csv  = static fn( $v ) => array_values( array_filter( array_map( 'trim', explode( ',', (string) $v ) ), 'strlen' ) );
		$bbox  = array_map( 'floatval', $csv( $r['bbox'] ) );
		$types = array_values( array_intersect( $csv( null === $r['types'] ? implode( ',', self::TYPES ) : $r['types'] ), self::TYPES ) );
		if ( ! $types ) {
			return rest_ensure_response( array( 'pins' => array(), 'count' => 0, 'truncated' => false ) ); // Every type switched off.
		}
		$res  = Map_Index::query(
			array(
				'bbox'       => 4 === count( $bbox ) ? $bbox : array(),
				'types'      => $types,
				'lga'        => absint( $r['lga'] ),
				'min_rating' => min( 5, max( 0, (float) $r['min_rating'] ) ),
				'price'      => array_map( 'intval', $csv( $r['price'] ) ),
				'open'       => ! empty( $r['open'] ),
				'amenity'    => sanitize_key( (string) $r['amenity'] ),
				'lat'        => is_numeric( $r['lat'] ) ? (float) $r['lat'] : null,
				'lng'        => is_numeric( $r['lng'] ) ? (float) $r['lng'] : null,
				'radius_km'  => in_array( (int) $r['radius'], array( 1, 5, 10, 25 ), true ) ? (int) $r['radius'] : 0,
				'limit'      => 400,
			)
		);
		$resp = rest_ensure_response( array( 'pins' => $res['pins'], 'count' => count( $res['pins'] ), 'truncated' => $res['truncated'] ) );
		// Short public cache unless a location is in the request (locations are never cached or stored).
		$resp->header( 'Cache-Control', is_numeric( $r['lat'] ) ? 'no-store' : 'public, max-age=60' );
		return $resp;
	}

	public static function shortcode() {
		return View::render( 'map' );
	}
}
