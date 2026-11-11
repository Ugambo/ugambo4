<?php
/**
 * "Top 10" pages: Top Hotels / Restaurants / Event Centres in Katsina, and per LGA
 * (/top-hotels/daura/). Ranked by the honest ranking only; Featured never changes the order.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Top {

	/** page key => business type + URL slug. */
	const PAGES = array(
		'top_hotels'        => array( 'hotel', 'top-hotels' ),
		'top_restaurants'   => array( 'restaurant', 'top-restaurants' ),
		'top_event_centres' => array( 'event-centre', 'top-event-centres' ),
	);

	public static function init() {
		add_shortcode( 'ek_top', array( __CLASS__, 'shortcode' ) );
		add_action( 'init', array( __CLASS__, 'rewrites' ) );
		add_filter( 'query_vars', static fn( $v ) => array_merge( $v, array( 'ek_top_lga' ) ) );
		add_filter( 'document_title_parts', array( __CLASS__, 'title' ) );
		add_filter( 'rank_math/frontend/title', array( __CLASS__, 'seo_title' ) ); // Rank Math sets titles itself.
		add_action( 'wp_enqueue_scripts', static function () {
			$post = get_queried_object();
			if ( $post instanceof \WP_Post && has_shortcode( $post->post_content, 'ek_top' ) ) {
				wp_enqueue_style( 'ek' );
			}
		} );
	}

	public static function rewrites() {
		$slugs = implode( '|', array_map( static fn( $p ) => $p[1], self::PAGES ) );
		add_rewrite_rule( '^(' . $slugs . ')/([a-z0-9-]+)/?$', 'index.php?pagename=$matches[1]&ek_top_lga=$matches[2]', 'top' );
	}

	public static function url( $type, $lga_slug = '' ) {
		foreach ( self::PAGES as $key => $p ) {
			if ( $p[0] === $type ) {
				$base = Install::page_url( $key );
				return $lga_slug ? trailingslashit( $base ) . $lga_slug . '/' : $base;
			}
		}
		return home_url( '/' );
	}

	public static function current_lga() {
		$slug = sanitize_title( (string) ( get_query_var( 'ek_top_lga' ) ? get_query_var( 'ek_top_lga' ) : ( $_GET['lga'] ?? '' ) ) ); // phpcs:ignore
		$term = $slug ? get_term_by( 'slug', $slug, Post_Types::TAX_LGA ) : null;
		return $term && ! is_wp_error( $term ) ? $term : null;
	}

	public static function heading( $type, $lga = null ) {
		$n = Ranking::ranked_types()[ $type ][1] ?? '';
		/* translators: 1: plural type (hotels), 2: place */
		return sprintf( __( 'Top 10 %1$s in %2$s', 'explore-katsina' ), $n, $lga ? $lga->name : __( 'Katsina State', 'explore-katsina' ) );
	}

	public static function title( $parts ) {
		$post = get_queried_object();
		if ( $post instanceof \WP_Post && has_shortcode( $post->post_content, 'ek_top' ) && preg_match( '/type="([a-z-]+)"/', $post->post_content, $m ) ) {
			$parts['title'] = ucfirst( self::heading( $m[1], self::current_lga() ) );
		}
		return $parts;
	}

	/** Same per-place title when Rank Math is in charge of titles: "Top 10 hotels in Katsina – Explore Katsina". */
	public static function seo_title( $title ) {
		$parts = self::title( array() );
		return empty( $parts['title'] ) ? $title : $parts['title'] . ' – ' . get_bloginfo( 'name' );
	}

	public static function shortcode( $atts ) {
		$atts = shortcode_atts( array( 'type' => 'hotel' ), $atts );
		$type = isset( Ranking::ranked_types()[ $atts['type'] ] ) ? $atts['type'] : 'hotel';
		$lga  = self::current_lga();
		return View::render( 'top', array( 'type' => $type, 'lga' => $lga, 'rows' => Ranking::top( $type, $lga ? $lga->term_id : 0, 10 ) ) );
	}
}
