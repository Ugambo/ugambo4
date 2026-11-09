<?php
/**
 * Partner referral links (airlines, bus companies, car hire…): every link goes through
 * /go/{partner}/, which counts the click (partner, page it came from, date) and forwards the visitor.
 * Use [ek_partner slug="airpeace" label="Book a flight"] in pages. Commissions partners pay you are
 * recorded by hand in wp-admin → Partners so they show in the revenue dashboard.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Partners {

	public static function categories() {
		return array(
			'airline'   => __( 'Airline', 'explore-katsina' ),
			'bus'       => __( 'Bus / transport company', 'explore-katsina' ),
			'car_hire'  => __( 'Car hire', 'explore-katsina' ),
			'other'     => __( 'Other', 'explore-katsina' ),
		);
	}

	public static function init() {
		add_action( 'init', static fn() => add_rewrite_rule( '^go/([a-z0-9-]+)/?$', 'index.php?ek_go=$matches[1]', 'top' ) );
		add_filter( 'query_vars', static fn( $v ) => array_merge( $v, array( 'ek_go' ) ) );
		add_action( 'template_redirect', array( __CLASS__, 'go' ), 1 );
		add_shortcode( 'ek_partner', array( __CLASS__, 'shortcode' ) );
	}

	public static function all() {
		global $wpdb;
		return $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}ek_partners ORDER BY name" );
	}

	public static function by_slug( $slug ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_partners WHERE slug = %s", sanitize_title( $slug ) ) );
	}

	/** @return int|\WP_Error */
	public static function save( array $in, $id = 0 ) {
		global $wpdb;
		$slug = sanitize_title( $in['slug'] ?? ( $in['name'] ?? '' ) );
		$url  = View::valid_url( $in['url'] ?? '' );
		if ( '' === trim( (string) ( $in['name'] ?? '' ) ) || '' === $slug || ! View::valid_url( $url ) ) {
			return new \WP_Error( 'fields', __( 'A partner needs a name and a valid link (https://…).', 'explore-katsina' ) );
		}
		$other = $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_partners WHERE slug = %s AND id <> %d", $slug, $id ) );
		if ( $other ) {
			return new \WP_Error( 'slug', __( 'Another partner already uses that short name.', 'explore-katsina' ) );
		}
		$row = array(
			'slug'            => $slug,
			'name'            => mb_substr( sanitize_text_field( $in['name'] ), 0, 190 ),
			'category'        => isset( self::categories()[ $in['category'] ?? '' ] ) ? $in['category'] : 'other',
			'url'             => $url,
			'commission_note' => mb_substr( sanitize_text_field( $in['commission_note'] ?? '' ), 0, 250 ),
			'active'          => empty( $in['active'] ) ? 0 : 1,
		);
		if ( $id ) {
			$wpdb->update( $wpdb->prefix . 'ek_partners', $row, array( 'id' => (int) $id ) );
			return (int) $id;
		}
		$wpdb->insert( $wpdb->prefix . 'ek_partners', $row + array( 'created_at' => current_time( 'mysql', true ) ) );
		return (int) $wpdb->insert_id;
	}

	public static function link( $slug ) {
		return home_url( '/go/' . sanitize_title( $slug ) . '/' );
	}

	public static function go() {
		$slug = get_query_var( 'ek_go' );
		if ( ! $slug ) {
			return;
		}
		global $wpdb;
		$p = self::by_slug( $slug );
		if ( ! $p || ! $p->active ) {
			wp_safe_redirect( home_url( '/' ) );
			exit;
		}
		$from = wp_get_raw_referer();
		$path = $from && 0 === strpos( $from, home_url() ) ? (string) wp_parse_url( $from, PHP_URL_PATH ) : '';
		if ( ! preg_match( '/bot|crawl|spider|slurp|headless/i', (string) ( $_SERVER['HTTP_USER_AGENT'] ?? '' ) ) ) { // phpcs:ignore
			$wpdb->insert( $wpdb->prefix . 'ek_partner_clicks', array( 'partner_id' => $p->id, 'source_url' => mb_substr( $path, 0, 255 ), 'created_at' => current_time( 'mysql', true ) ) );
		}
		nocache_headers();
		wp_redirect( $p->url, 302, 'Explore Katsina' ); // phpcs:ignore WordPress.Security.SafeRedirect -- partner link set by admin.
		exit;
	}

	public static function shortcode( $atts ) {
		$a = shortcode_atts( array( 'slug' => '', 'label' => '' ), $atts );
		$p = self::by_slug( $a['slug'] );
		if ( ! $p || ! $p->active ) {
			return '';
		}
		return '<a class="ek-partner-link" href="' . esc_url( self::link( $p->slug ) ) . '" rel="sponsored nofollow noopener" target="_blank">' . esc_html( $a['label'] ? $a['label'] : $p->name ) . '</a>';
	}

	/** Clicks per partner per month (last 12 months). */
	public static function clicks_by_month( $months = 12 ) {
		global $wpdb;
		$since = gmdate( 'Y-m-01 00:00:00', strtotime( '-' . ( $months - 1 ) . ' months' ) );
		$rows  = $wpdb->get_results( $wpdb->prepare( "SELECT partner_id, DATE_FORMAT(created_at, '%%Y-%%m') m, COUNT(*) n FROM {$wpdb->prefix}ek_partner_clicks WHERE created_at >= %s GROUP BY partner_id, m", $since ) );
		$out   = array();
		foreach ( $rows as $r ) {
			$out[ (int) $r->partner_id ][ $r->m ] = (int) $r->n;
		}
		return $out;
	}

	public static function top_sources( $partner_id, $limit = 5 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT source_url, COUNT(*) n FROM {$wpdb->prefix}ek_partner_clicks WHERE partner_id = %d GROUP BY source_url ORDER BY n DESC LIMIT %d", $partner_id, $limit ) );
	}

	/** CSV of clicks for a month, to send partners when claiming commission. */
	public static function csv( $month ) {
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT c.created_at, p.name, c.source_url FROM {$wpdb->prefix}ek_partner_clicks c JOIN {$wpdb->prefix}ek_partners p ON p.id = c.partner_id WHERE DATE_FORMAT(c.created_at, '%%Y-%%m') = %s ORDER BY c.created_at", $month ), ARRAY_A );
		$fh   = fopen( 'php://temp', 'w+' );
		fputcsv( $fh, array( 'Clicked (UTC)', 'Partner', 'From page' ) );
		foreach ( $rows as $r ) {
			fputcsv( $fh, array_values( $r ) );
		}
		rewind( $fh );
		$csv = stream_get_contents( $fh );
		fclose( $fh );
		return $csv;
	}
}
