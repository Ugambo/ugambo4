<?php
/**
 * "Find a restaurant": [ek_restaurant_search]
 * Near me, LGA, cuisine, price range, open now, minimum rating; sort by distance,
 * rank, rating or price; list or map view.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Restaurant_Search {

	const PER_PAGE = 12;

	public static function init() {
		add_shortcode( 'ek_restaurant_search', array( __CLASS__, 'shortcode' ) );
	}

	public static function params( array $src = null ) {
		$g   = $src ?? $_GET; // phpcs:ignore WordPress.Security.NonceVerification
		$get = static fn( $k ) => isset( $g[ $k ] ) ? sanitize_text_field( wp_unslash( (string) $g[ $k ] ) ) : '';
		$p   = array(
			'lga'        => absint( $get( 'lga' ) ),
			'lat'        => is_numeric( $get( 'lat' ) ) ? (float) $get( 'lat' ) : null,
			'lng'        => is_numeric( $get( 'lng' ) ) ? (float) $get( 'lng' ) : null,
			'near'       => absint( $get( 'near' ) ),
			'cuisine'    => isset( Restaurant::cuisines()[ $get( 'cuisine' ) ] ) ? $get( 'cuisine' ) : '',
			'price'      => min( 4, absint( $get( 'price' ) ) ),
			'open_now'   => '1' === $get( 'open_now' ),
			'min_rating' => min( 5, (float) $get( 'min_rating' ) ),
			'halal'      => '1' === $get( 'halal' ),
			'sort'       => in_array( $get( 'sort' ), array( 'distance', 'rank', 'rating', 'price' ), true ) ? $get( 'sort' ) : '',
			'view'       => 'map' === $get( 'view' ) ? 'map' : 'list',
			'page'       => max( 1, absint( $get( 'pg' ) ) ),
		);
		if ( null !== $p['lat'] && ( abs( $p['lat'] ) > 90 || abs( (float) $p['lng'] ) > 180 ) ) {
			$p['lat'] = $p['lng'] = null;
		}
		if ( $p['near'] && null === $p['lat'] && 'publish' === get_post_status( $p['near'] ) ) {
			$lat = get_post_meta( $p['near'], '_ek_lat', true );
			$lng = get_post_meta( $p['near'], '_ek_lng', true );
			if ( is_numeric( $lat ) && is_numeric( $lng ) ) {
				$p['lat'] = (float) $lat;
				$p['lng'] = (float) $lng;
			}
		}
		if ( ! $p['sort'] ) {
			$p['sort'] = null !== $p['lat'] ? 'distance' : 'rank';
		}
		return $p;
	}

	public static function search( array $p ) {
		$q = array(
			'post_type'      => Post_Types::BUSINESS,
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'tax_query'      => array( array( 'taxonomy' => Post_Types::TAX_TYPE, 'field' => 'slug', 'terms' => 'restaurant' ) ), // phpcs:ignore
		);
		if ( $p['lga'] ) {
			$q['tax_query'][] = array( 'taxonomy' => Post_Types::TAX_LGA, 'field' => 'term_id', 'terms' => $p['lga'] );
		}
		$items = array();
		foreach ( get_posts( $q ) as $post ) {
			$s = Restaurant::settings( $post->ID );
			if ( $p['cuisine'] && ! in_array( $p['cuisine'], $s['cuisines'], true ) ) {
				continue;
			}
			if ( $p['price'] && (int) $s['price_level'] > $p['price'] ) {
				continue;
			}
			if ( $p['halal'] && ! $s['halal'] ) {
				continue;
			}
			$open = Business::is_open( $post->ID );
			if ( $p['open_now'] && ! $open ) {
				continue;
			}
			$reviews = Reviews::stats( $post->ID );
			if ( $p['min_rating'] && $reviews['overall'] < $p['min_rating'] ) {
				continue;
			}
			$lat     = (float) get_post_meta( $post->ID, '_ek_lat', true );
			$lng     = (float) get_post_meta( $post->ID, '_ek_lng', true );
			$rank    = Ranking::current( $post->ID );
			$lga     = Business::lga_of( $post->ID );
			$photos  = (array) get_post_meta( $post->ID, '_ek_gallery', true );
			$items[] = array(
				'id'         => $post->ID,
				'name'       => $post->post_title,
				'url'        => get_permalink( $post ),
				'lga'        => $lga ? $lga->name : '',
				'lat'        => $lat,
				'lng'        => $lng,
				'distance'   => null !== $p['lat'] ? Hotel_Search::distance( $p['lat'], $p['lng'], $lat, $lng ) : null,
				'cuisines'   => $s['cuisines'],
				'level'      => (int) $s['price_level'],
				'halal'      => (bool) $s['halal'],
				'open'       => $open,
				'reserve'    => (bool) $s['res_enabled'],
				'rating'     => $reviews['overall'],
				'reviews'    => $reviews['count'],
				'rank'       => $rank && $rank->rank_state ? (int) $rank->rank_state : null,
				'rank_total' => $rank ? (int) $rank->total_state : 0,
				'verified'   => (bool) get_post_meta( $post->ID, '_ek_verified', true ),
				'photo'      => (int) ( $photos[0] ?? 0 ),
			);
		}
		$by_name = static fn( $a, $b ) => strcasecmp( $a['name'], $b['name'] );
		switch ( $p['sort'] ) {
			case 'distance':
				usort( $items, static fn( $a, $b ) => ( $a['distance'] ?? INF ) <=> ( $b['distance'] ?? INF ) ?: $by_name( $a, $b ) );
				break;
			case 'price':
				usort( $items, static fn( $a, $b ) => $a['level'] <=> $b['level'] ?: $b['rating'] <=> $a['rating'] ?: $by_name( $a, $b ) );
				break;
			case 'rating':
				usort( $items, static fn( $a, $b ) => $b['rating'] <=> $a['rating'] ?: $b['reviews'] <=> $a['reviews'] ?: $by_name( $a, $b ) );
				break;
			default:
				usort( $items, static fn( $a, $b ) => ( $a['rank'] ?? PHP_INT_MAX ) <=> ( $b['rank'] ?? PHP_INT_MAX ) ?: $b['rating'] <=> $a['rating'] ?: $by_name( $a, $b ) );
		}
		$items = Plans::promote( $items );
		return array(
			'all'   => $items,
			'items' => array_slice( $items, ( $p['page'] - 1 ) * self::PER_PAGE, self::PER_PAGE ),
			'total' => count( $items ),
		);
	}

	public static function query_args( array $p, array $override = array() ) {
		$args = array_merge(
			array(
				'lga'        => $p['lga'] ? $p['lga'] : '',
				'lat'        => null !== $p['lat'] && ! $p['near'] ? round( $p['lat'], 5 ) : '',
				'lng'        => null !== $p['lng'] && ! $p['near'] ? round( $p['lng'], 5 ) : '',
				'near'       => $p['near'] ? $p['near'] : '',
				'cuisine'    => $p['cuisine'],
				'price'      => $p['price'] ? $p['price'] : '',
				'open_now'   => $p['open_now'] ? 1 : '',
				'min_rating' => $p['min_rating'] ? $p['min_rating'] : '',
				'halal'      => $p['halal'] ? 1 : '',
				'sort'       => $p['sort'],
				'view'       => 'map' === $p['view'] ? 'map' : '',
			),
			$override
		);
		return array_filter( $args, static fn( $v ) => '' !== $v && null !== $v );
	}

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		wp_enqueue_style( 'leaflet' );
		wp_enqueue_script( 'ek-search' );
		$p = self::params();
		return View::render( 'restaurant-search', array( 'p' => $p, 'r' => self::search( $p ) ) );
	}
}
