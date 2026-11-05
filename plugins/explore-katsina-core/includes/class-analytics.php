<?php
/**
 * Per-business analytics: page views, map pin taps, WhatsApp/call/website/directions clicks.
 * Counted per day. No personal data is stored (only a short-lived hashed
 * fingerprint to ignore repeat taps for 30 minutes).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Analytics {

	const METRICS = array( 'view', 'pin_tap', 'whatsapp', 'call', 'website', 'directions' );

	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'routes' ) );
	}

	public static function routes() {
		register_rest_route(
			'ek/v1',
			'/track',
			array(
				'methods'             => 'POST',
				'permission_callback' => '__return_true',
				'callback'            => array( __CLASS__, 'rest_track' ),
				'args'                => array(
					'business' => array(
						'type'     => 'integer',
						'required' => true,
					),
					'metric'   => array(
						'type'     => 'string',
						'required' => true,
						'enum'     => self::METRICS,
					),
				),
			)
		);
	}

	public static function rest_track( \WP_REST_Request $req ) {
		$id     = (int) $req['business'];
		$metric = (string) $req['metric'];
		$post   = Business::get( $id );
		if ( ! $post || 'publish' !== $post->post_status ) {
			return new \WP_REST_Response( array( 'ok' => false ), 404 );
		}
		// Owners and staff looking at their own page don't count.
		$uid = get_current_user_id();
		if ( $uid && ( (int) $post->post_author === $uid || user_can( $uid, 'edit_posts' ) ) ) {
			return new \WP_REST_Response( array( 'ok' => true, 'counted' => false ), 200 );
		}
		$ip    = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ?? '' ) );
		$ua    = sanitize_text_field( wp_unslash( $_SERVER['HTTP_USER_AGENT'] ?? '' ) );
		$key   = 'ek_t_' . substr( hash( 'sha256', wp_salt( 'nonce' ) . $ip . $ua . $id . $metric ), 0, 32 );
		if ( get_transient( $key ) ) {
			return new \WP_REST_Response( array( 'ok' => true, 'counted' => false ), 200 );
		}
		set_transient( $key, 1, 30 * MINUTE_IN_SECONDS );
		self::bump( $id, $metric );
		return new \WP_REST_Response( array( 'ok' => true, 'counted' => true ), 200 );
	}

	public static function bump( $business_id, $metric, $by = 1, $day = null ) {
		global $wpdb;
		if ( ! in_array( $metric, self::METRICS, true ) ) {
			return;
		}
		$day = $day ? $day : wp_date( 'Y-m-d', null, new \DateTimeZone( 'Africa/Lagos' ) );
		$wpdb->query(
			$wpdb->prepare(
				"INSERT INTO {$wpdb->prefix}ek_analytics_daily (business_id, day, metric, count) VALUES (%d, %s, %s, %d)
				 ON DUPLICATE KEY UPDATE count = count + VALUES(count)",
				$business_id,
				$day,
				$metric,
				$by
			)
		);
	}

	/**
	 * Totals per metric for the last $days days, plus bookings and revenue from the bookings table.
	 */
	public static function summary( $business_id, $days = 30 ) {
		global $wpdb;
		$tz    = new \DateTimeZone( 'Africa/Lagos' );
		$since = ( new \DateTimeImmutable( 'now', $tz ) )->modify( '-' . ( (int) $days - 1 ) . ' days' )->format( 'Y-m-d' );
		$rows  = $wpdb->get_results(
			$wpdb->prepare( "SELECT metric, SUM(count) AS total FROM {$wpdb->prefix}ek_analytics_daily WHERE business_id = %d AND day >= %s GROUP BY metric", $business_id, $since )
		);
		$out = array_fill_keys( self::METRICS, 0 );
		foreach ( $rows as $r ) {
			$out[ $r->metric ] = (int) $r->total;
		}
		$b = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT COUNT(*) AS n, COALESCE(SUM(paid_kobo),0) AS revenue FROM {$wpdb->prefix}ek_bookings
				 WHERE business_id = %d AND created_at >= %s AND status NOT IN ('cancelled','declined')",
				$business_id,
				$since . ' 00:00:00'
			)
		);
		$out['bookings'] = (int) ( $b->n ?? 0 );
		$out['revenue']  = (int) ( $b->revenue ?? 0 );
		return $out;
	}

	/** Daily series for a sparkline: [ 'Y-m-d' => count ]. */
	public static function series( $business_id, $metric, $days = 30 ) {
		global $wpdb;
		$tz     = new \DateTimeZone( 'Africa/Lagos' );
		$start  = ( new \DateTimeImmutable( 'now', $tz ) )->modify( '-' . ( (int) $days - 1 ) . ' days' );
		$series = array();
		for ( $i = 0; $i < $days; $i++ ) {
			$series[ $start->modify( "+{$i} days" )->format( 'Y-m-d' ) ] = 0;
		}
		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT day, count FROM {$wpdb->prefix}ek_analytics_daily WHERE business_id = %d AND metric = %s AND day >= %s", $business_id, $metric, $start->format( 'Y-m-d' ) )
		);
		foreach ( $rows as $r ) {
			if ( isset( $series[ $r->day ] ) ) {
				$series[ $r->day ] = (int) $r->count;
			}
		}
		return $series;
	}
}
