<?php
/**
 * "Find an event centre": [ek_venue_search]
 * Date, guest count, LGA, Near me, price range, amenities; sort by distance, rank, rating, price.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Venue_Search {

	const PER_PAGE = 12;

	public static function init() {
		add_shortcode( 'ek_venue_search', array( __CLASS__, 'shortcode' ) );
	}

	public static function params( array $src = null ) {
		$g   = $src ?? $_GET; // phpcs:ignore WordPress.Security.NonceVerification
		$get = static fn( $k ) => isset( $g[ $k ] ) ? sanitize_text_field( wp_unslash( (string) $g[ $k ] ) ) : '';
		$p   = array(
			'date'      => Availability::valid_date( $get( 'date' ) ) && $get( 'date' ) >= Availability::today() ? $get( 'date' ) : '',
			'guests'    => absint( $get( 'guests' ) ),
			'layout'    => 'standing' === $get( 'layout' ) ? 'standing' : 'seated',
			'lga'       => absint( $get( 'lga' ) ),
			'lat'       => is_numeric( $get( 'lat' ) ) ? (float) $get( 'lat' ) : null,
			'lng'       => is_numeric( $get( 'lng' ) ) ? (float) $get( 'lng' ) : null,
			'price_max' => '' !== $get( 'price_max' ) ? Money::to_kobo( $get( 'price_max' ) ) : 0,
			'amenities' => array_values( array_intersect( array_map( 'sanitize_key', (array) ( $g['amenities'] ?? array() ) ), array_keys( Venue::amenities() ) ) ),
			'sort'      => in_array( $get( 'sort' ), array( 'distance', 'rank', 'rating', 'price' ), true ) ? $get( 'sort' ) : '',
			'view'      => 'map' === $get( 'view' ) ? 'map' : 'list',
			'page'      => max( 1, absint( $get( 'pg' ) ) ),
		);
		if ( null !== $p['lat'] && ( abs( $p['lat'] ) > 90 || abs( (float) $p['lng'] ) > 180 ) ) {
			$p['lat'] = $p['lng'] = null;
		}
		if ( ! $p['sort'] ) {
			$p['sort'] = null !== $p['lat'] ? 'distance' : 'rank';
		}
		return $p;
	}

	public static function search( array $p ) {
		Booking::expire_holds();
		$q = array(
			'post_type'      => Post_Types::BUSINESS,
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'tax_query'      => array( array( 'taxonomy' => Post_Types::TAX_TYPE, 'field' => 'slug', 'terms' => 'event-centre' ) ), // phpcs:ignore
		);
		if ( $p['lga'] ) {
			$q['tax_query'][] = array( 'taxonomy' => Post_Types::TAX_LGA, 'field' => 'term_id', 'terms' => $p['lga'] );
		}
		$posts = get_posts( $q );
		$halls = array();
		$ids   = array();
		foreach ( $posts as $post ) {
			$halls[ $post->ID ] = Halls::for_venue( $post->ID );
			$ids                = array_merge( $ids, wp_list_pluck( $halls[ $post->ID ], 'id' ) );
		}
		if ( $p['date'] ) {
			Availability::forget();
			Availability::prefetch( $ids, $p['date'], ( new \DateTimeImmutable( $p['date'], Availability::tz() ) )->modify( '+1 day' )->format( 'Y-m-d' ) );
		}
		$items = array();
		foreach ( $posts as $post ) {
			$s = Venue::settings( $post->ID );
			if ( $p['amenities'] && array_diff( $p['amenities'], $s['amenities'] ) ) {
				continue;
			}
			$best = null;
			$cap  = 0;
			foreach ( $halls[ $post->ID ] as $h ) {
				$hcap = 'standing' === $p['layout'] ? $h['capacity_standing'] : $h['capacity_seated'];
				$cap  = max( $cap, $h['capacity_seated'], $h['capacity_standing'] );
				if ( $p['guests'] && $hcap < $p['guests'] ) {
					continue;
				}
				$price = $h['price'];
				if ( $p['date'] ) {
					$q2 = Venue::quote( $h, $p['date'], $p['date'] );
					if ( ! $q2['ok'] ) {
						continue;
					}
					$price = $q2['total'];
				}
				if ( ! $best || $price < $best['price'] ) {
					$best = array( 'price' => $price, 'pricing' => $h['pricing'], 'hall' => $h['name'] );
				}
			}
			if ( ! $best || ( $p['price_max'] && $best['price'] > $p['price_max'] ) ) {
				continue;
			}
			$lat     = (float) get_post_meta( $post->ID, '_ek_lat', true );
			$lng     = (float) get_post_meta( $post->ID, '_ek_lng', true );
			$reviews = Reviews::stats( $post->ID );
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
				'price'      => $best['price'],
				'pricing'    => $best['pricing'],
				'halls'      => count( $halls[ $post->ID ] ),
				'capacity'   => $cap,
				'mode'       => $s['booking_mode'],
				'amenities'  => $s['amenities'],
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
				usort( $items, static fn( $a, $b ) => $a['price'] <=> $b['price'] ?: $by_name( $a, $b ) );
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
				'date'      => $p['date'],
				'guests'    => $p['guests'] ? $p['guests'] : '',
				'layout'    => 'standing' === $p['layout'] ? 'standing' : '',
				'lga'       => $p['lga'] ? $p['lga'] : '',
				'lat'       => null !== $p['lat'] ? round( $p['lat'], 5 ) : '',
				'lng'       => null !== $p['lng'] ? round( $p['lng'], 5 ) : '',
				'price_max' => $p['price_max'] ? $p['price_max'] / 100 : '',
				'sort'      => $p['sort'],
				'view'      => 'map' === $p['view'] ? 'map' : '',
			),
			$override
		);
		$out = array_filter( $args, static fn( $v ) => '' !== $v && null !== $v );
		if ( $p['amenities'] && ! isset( $override['amenities'] ) ) {
			$out['amenities'] = $p['amenities'];
		}
		return $out;
	}

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		wp_enqueue_style( 'leaflet' );
		wp_enqueue_script( 'ek-search' );
		$p = self::params();
		return View::render( 'venue-search', array( 'p' => $p, 'r' => self::search( $p ) ) );
	}
}
