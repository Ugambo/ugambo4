<?php
/**
 * "Find a hotel": [ek_hotel_search]
 * Search by dates, guests, LGA, "Near me" or near a place; filter; sort by distance,
 * rank, rating or price; list or map view.
 *
 * Featured placement (Phase 9) is shown separately and never changes rank numbers.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Hotel_Search {

	const PER_PAGE = 12;

	public static function init() {
		add_shortcode( 'ek_hotel_search', array( __CLASS__, 'shortcode' ) );
	}

	/** Read and clean the search parameters from the URL. */
	public static function params( array $src = null ) {
		$g   = $src ?? $_GET; // phpcs:ignore WordPress.Security.NonceVerification
		$get = static fn( $k ) => isset( $g[ $k ] ) ? sanitize_text_field( wp_unslash( (string) $g[ $k ] ) ) : '';
		$p   = array(
			'checkin'   => Availability::valid_date( $get( 'checkin' ) ) ? $get( 'checkin' ) : '',
			'checkout'  => Availability::valid_date( $get( 'checkout' ) ) ? $get( 'checkout' ) : '',
			'guests'    => max( 1, min( 40, absint( $get( 'guests' ) ? $get( 'guests' ) : 2 ) ) ),
			'rooms'     => max( 1, min( 20, absint( $get( 'rooms' ) ? $get( 'rooms' ) : 1 ) ) ),
			'lga'       => absint( $get( 'lga' ) ),
			'lat'       => is_numeric( $get( 'lat' ) ) ? (float) $get( 'lat' ) : null,
			'lng'       => is_numeric( $get( 'lng' ) ) ? (float) $get( 'lng' ) : null,
			'near'      => absint( $get( 'near' ) ),
			'price_min' => $get( 'price_min' ) !== '' ? Money::to_kobo( $get( 'price_min' ) ) : 0,
			'price_max' => $get( 'price_max' ) !== '' ? Money::to_kobo( $get( 'price_max' ) ) : 0,
			'stars'     => min( 5, absint( $get( 'stars' ) ) ),
			'room_type' => sanitize_key( $get( 'room_type' ) ),
			'pay_venue' => '1' === $get( 'pay_venue' ),
			'amenities' => array_values( array_intersect( array_map( 'sanitize_key', (array) ( $g['amenities'] ?? array() ) ), array_keys( Hotel::amenities() ) ) ),
			'sort'      => in_array( $get( 'sort' ), array( 'distance', 'rank', 'rating', 'price' ), true ) ? $get( 'sort' ) : '',
			'view'      => 'map' === $get( 'view' ) ? 'map' : 'list',
			'page'      => max( 1, absint( $get( 'pg' ) ) ),
		);
		if ( $p['lat'] !== null && ! Business::in_katsina( $p['lat'], $p['lng'] ) ) {
			// Outside the state: still measure distances (a visitor driving in), but keep it sane.
			if ( abs( $p['lat'] ) > 90 || abs( $p['lng'] ) > 180 ) {
				$p['lat'] = $p['lng'] = null;
			}
		}
		if ( $p['near'] && null === $p['lat'] ) {
			$lat = get_post_meta( $p['near'], '_ek_lat', true );
			$lng = get_post_meta( $p['near'], '_ek_lng', true );
			if ( is_numeric( $lat ) && is_numeric( $lng ) && 'publish' === get_post_status( $p['near'] ) ) {
				$p['lat'] = (float) $lat;
				$p['lng'] = (float) $lng;
			}
		}
		if ( $p['checkin'] && $p['checkout'] && is_wp_error( Availability::check_dates( $p['checkin'], $p['checkout'] ) ) ) {
			$p['date_error'] = Availability::check_dates( $p['checkin'], $p['checkout'] )->get_error_message();
			$p['checkin']    = $p['checkout'] = '';
		}
		if ( ! $p['sort'] ) {
			$p['sort'] = null !== $p['lat'] ? 'distance' : 'rank';
		}
		return $p;
	}

	/** Straight-line distance in km. */
	public static function distance( $lat1, $lng1, $lat2, $lng2 ) {
		$r    = 6371;
		$dlat = deg2rad( $lat2 - $lat1 );
		$dlng = deg2rad( $lng2 - $lng1 );
		$a    = sin( $dlat / 2 ) ** 2 + cos( deg2rad( $lat1 ) ) * cos( deg2rad( $lat2 ) ) * sin( $dlng / 2 ) ** 2;
		return 2 * $r * asin( min( 1, sqrt( $a ) ) );
	}

	public static function format_distance( $km ) {
		if ( null === $km ) {
			return '';
		}
		/* translators: %s: distance */
		return $km < 1 ? sprintf( __( '%s m away', 'explore-katsina' ), number_format_i18n( round( $km * 1000, -1 ) ) ) : sprintf( __( '%s km away', 'explore-katsina' ), number_format_i18n( $km, $km < 10 ? 1 : 0 ) );
	}

	/**
	 * Run the search.
	 *
	 * @return array{items: array[], total: int, all: array[]}
	 */
	public static function search( array $p ) {
		Booking::expire_holds();
		$q = array(
			'post_type'      => Post_Types::BUSINESS,
			'post_status'    => 'publish',
			'posts_per_page' => 500,
			'no_found_rows'  => true,
			'tax_query'      => array( array( 'taxonomy' => Post_Types::TAX_TYPE, 'field' => 'slug', 'terms' => 'hotel' ) ), // phpcs:ignore
		);
		if ( $p['lga'] ) {
			$q['tax_query'][] = array( 'taxonomy' => Post_Types::TAX_LGA, 'field' => 'term_id', 'terms' => $p['lga'] );
		}
		$posts = get_posts( $q );

		// Load all rooms and their calendars in one go.
		$rooms_by_hotel = array();
		$room_ids       = array();
		foreach ( $posts as $post ) {
			$rooms_by_hotel[ $post->ID ] = Rooms::for_hotel( $post->ID );
			$room_ids                    = array_merge( $room_ids, wp_list_pluck( $rooms_by_hotel[ $post->ID ], 'id' ) );
		}
		$has_dates = $p['checkin'] && $p['checkout'];
		if ( $has_dates ) {
			Availability::forget();
			Availability::prefetch( $room_ids, $p['checkin'], $p['checkout'] );
		}
		$nights = $has_dates ? count( Availability::nights( $p['checkin'], $p['checkout'] ) ) : 0;

		$items = array();
		foreach ( $posts as $post ) {
			$rooms = $rooms_by_hotel[ $post->ID ];
			if ( ! $rooms ) {
				continue; // Not bookable yet.
			}
			$settings = Hotel::settings( $post->ID );
			if ( $p['stars'] && $settings['stars'] < $p['stars'] ) {
				continue;
			}
			if ( $p['amenities'] && array_diff( $p['amenities'], $settings['amenities'] ) ) {
				continue;
			}
			if ( $p['pay_venue'] && ! $settings['pay_at_venue'] ) {
				continue;
			}

			// Which room categories fit the guests, room type and dates?
			$best = null;
			foreach ( $rooms as $room ) {
				if ( $p['room_type'] && false === stripos( $room['name'], $p['room_type'] ) ) {
					continue;
				}
				if ( $room['max_guests'] * $p['rooms'] < $p['guests'] ) {
					continue;
				}
				if ( $has_dates ) {
					$quote = Availability::quote( $room, $p['checkin'], $p['checkout'], $p['rooms'] );
					if ( ! $quote['ok'] ) {
						continue;
					}
					$night_price = $quote['avg'];
					$total       = $quote['total'];
				} else {
					$night_price = $room['price'];
					$total       = 0;
				}
				if ( ! $best || $night_price < $best['night'] ) {
					$best = array( 'night' => $night_price, 'total' => $total, 'room' => $room['name'] );
				}
			}
			if ( ! $best ) {
				continue;
			}
			if ( $p['price_min'] && $best['night'] < $p['price_min'] ) {
				continue;
			}
			if ( $p['price_max'] && $best['night'] > $p['price_max'] ) {
				continue;
			}

			$lat     = (float) get_post_meta( $post->ID, '_ek_lat', true );
			$lng     = (float) get_post_meta( $post->ID, '_ek_lng', true );
			$reviews = Reviews::stats( $post->ID );
			$rank    = Ranking::current( $post->ID );
			$lga     = Business::lga_of( $post->ID );
			$photos  = (array) get_post_meta( $post->ID, '_ek_gallery', true );
			$items[] = array(
				'id'          => $post->ID,
				'name'        => $post->post_title,
				'url'         => get_permalink( $post ),
				'lga'         => $lga ? $lga->name : '',
				'lat'         => $lat,
				'lng'         => $lng,
				'distance'    => null !== $p['lat'] ? self::distance( $p['lat'], $p['lng'], $lat, $lng ) : null,
				'stars'       => $settings['stars'],
				'stars_ok'    => $settings['stars_verified'],
				'verified'    => (bool) get_post_meta( $post->ID, '_ek_verified', true ),
				'amenities'   => $settings['amenities'],
				'pay_venue'   => $settings['pay_at_venue'],
				'rating'      => $reviews['overall'],
				'reviews'     => $reviews['count'],
				'rank'        => $rank && $rank->rank_state ? (int) $rank->rank_state : null,
				'rank_total'  => $rank ? (int) $rank->total_state : 0,
				'score'       => $rank ? (float) $rank->score : 0,
				'night'       => $best['night'],
				'total'       => $best['total'],
				'nights'      => $nights,
				'photo'       => (int) ( $photos[0] ?? 0 ),
				'excerpt'     => wp_trim_words( wp_strip_all_tags( $post->post_content ), 22 ),
			);
		}

		usort( $items, self::comparator( $p['sort'] ) );
		$total = count( $items );
		return array(
			'all'   => $items,
			'items' => array_slice( $items, ( $p['page'] - 1 ) * self::PER_PAGE, self::PER_PAGE ),
			'total' => $total,
		);
	}

	private static function comparator( $sort ) {
		$by_name = static fn( $a, $b ) => strcasecmp( $a['name'], $b['name'] );
		switch ( $sort ) {
			case 'distance':
				return static fn( $a, $b ) => ( $a['distance'] ?? INF ) <=> ( $b['distance'] ?? INF ) ?: $by_name( $a, $b );
			case 'price':
				return static fn( $a, $b ) => $a['night'] <=> $b['night'] ?: $by_name( $a, $b );
			case 'rating':
				return static fn( $a, $b ) => $b['rating'] <=> $a['rating'] ?: $b['reviews'] <=> $a['reviews'] ?: $by_name( $a, $b );
			default: // rank: ranked first (lowest number), then unranked by rating.
				return static fn( $a, $b ) => ( $a['rank'] ?? PHP_INT_MAX ) <=> ( $b['rank'] ?? PHP_INT_MAX ) ?: $b['rating'] <=> $a['rating'] ?: $by_name( $a, $b );
		}
	}

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		wp_enqueue_style( 'leaflet' );
		wp_enqueue_script( 'ek-search' );
		$p = self::params();
		$r = self::search( $p );
		return View::render( 'hotel-search', array( 'p' => $p, 'r' => $r ) );
	}

	/** Keep the current search in links (pagination, sort, hotel page). */
	public static function query_args( array $p, array $override = array() ) {
		$args = array(
			'checkin'   => $p['checkin'],
			'checkout'  => $p['checkout'],
			'guests'    => 2 !== $p['guests'] ? $p['guests'] : '',
			'rooms'     => 1 !== $p['rooms'] ? $p['rooms'] : '',
			'lga'       => $p['lga'] ? $p['lga'] : '',
			'lat'       => null !== $p['lat'] && ! $p['near'] ? round( $p['lat'], 5 ) : '',
			'lng'       => null !== $p['lng'] && ! $p['near'] ? round( $p['lng'], 5 ) : '',
			'near'      => $p['near'] ? $p['near'] : '',
			'price_min' => $p['price_min'] ? $p['price_min'] / 100 : '',
			'price_max' => $p['price_max'] ? $p['price_max'] / 100 : '',
			'stars'     => $p['stars'] ? $p['stars'] : '',
			'room_type' => $p['room_type'],
			'pay_venue' => $p['pay_venue'] ? 1 : '',
			'sort'      => $p['sort'],
			'view'      => 'map' === $p['view'] ? 'map' : '',
		);
		$args = array_merge( $args, $override );
		$out  = array_filter( $args, static fn( $v ) => '' !== $v && null !== $v );
		if ( $p['amenities'] && ! isset( $override['amenities'] ) ) {
			$out['amenities'] = $p['amenities'];
		}
		return $out;
	}
}
