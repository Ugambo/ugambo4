<?php
/**
 * Map index: one row per pin (approved business or published attraction) with everything the
 * Katsina Map needs. The map asks only for pins inside the visible area (fast on 3G/4G).
 * Kept fresh automatically whenever a business, its rooms/halls, an attraction or the rankings change.
 *
 * Price bands (for the "Price" filter, PLACEHOLDERS you can change here):
 *  - Hotels, lowest room per night: ₦ under ₦15,000 · ₦₦ ₦15,000–35,000 · ₦₦₦ ₦35,000–70,000 · ₦₦₦₦ over ₦70,000
 *  - Restaurants: their own price range (₦ to ₦₦₦₦ per person)
 *  - Event centres, cheapest hall: ₦ under ₦200,000 · ₦₦ to ₦500,000 · ₦₦₦ to ₦1,000,000 · ₦₦₦₦ over
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Map_Index {

	const BANDS = array(
		'hotel'        => array( 1500000, 3500000, 7000000 ),
		'event-centre' => array( 20000000, 50000000, 100000000 ),
	);

	/** Amenities offered as map filters (across hotels, restaurants and event centres). */
	public static function filter_amenities() {
		return array(
			'wifi'       => __( 'Free WiFi', 'explore-katsina' ),
			'parking'    => __( 'Parking', 'explore-katsina' ),
			'power'      => __( '24-hour power', 'explore-katsina' ),
			'ac'         => __( 'Air conditioning', 'explore-katsina' ),
			'pool'       => __( 'Swimming pool', 'explore-katsina' ),
			'halal'      => __( 'Halal', 'explore-katsina' ),
			'prayer'     => __( 'Prayer room', 'explore-katsina' ),
			'accessible' => __( 'Wheelchair accessible', 'explore-katsina' ),
			'security'   => __( 'Security', 'explore-katsina' ),
		);
	}

	private static $queue = array();

	public static function init() {
		foreach ( array( 'updated_post_meta', 'added_post_meta', 'deleted_post_meta' ) as $h ) {
			add_action( $h, array( __CLASS__, 'meta_changed' ), 10, 2 );
		}
		add_action( 'save_post', array( __CLASS__, 'queue' ) );
		add_action( 'deleted_post', array( __CLASS__, 'queue' ) );
		add_action( 'set_object_terms', array( __CLASS__, 'queue' ) );
		add_action( 'transition_post_status', array( __CLASS__, 'status_changed' ), 10, 3 );
		add_action( 'ek_review_changed', array( __CLASS__, 'queue' ) );
		add_action( 'shutdown', array( __CLASS__, 'flush' ) );
	}

	public static function meta_changed( $meta_id, $object_id ) {
		self::queue( $object_id );
	}

	public static function status_changed( $new, $old, $post ) {
		self::queue( $post->ID );
	}

	/** Remember which pins to refresh at the end of the request (rooms/halls refresh their parent). */
	public static function queue( $post_id ) {
		$post = get_post( (int) $post_id );
		if ( ! $post ) {
			self::$queue[ (int) $post_id ] = true; // Deleted: remove its pin.
			return;
		}
		if ( in_array( $post->post_type, array( Rooms::CPT, Halls::CPT ), true ) && $post->post_parent ) {
			self::$queue[ (int) $post->post_parent ] = true;
		} elseif ( in_array( $post->post_type, array( Post_Types::BUSINESS, Attractions::CPT ), true ) ) {
			self::$queue[ (int) $post->ID ] = true;
		}
	}

	public static function flush() {
		$ids         = array_keys( self::$queue );
		self::$queue = array();
		foreach ( $ids as $id ) {
			self::refresh( $id );
		}
		if ( $ids ) {
			do_action( 'ek_listings_changed', $ids ); // Lists, maps and Top 10 pages show fresh data.
		}
	}

	public static function rebuild() {
		global $wpdb;
		$ids = get_posts( array( 'post_type' => array( Post_Types::BUSINESS, Attractions::CPT ), 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => -1 ) );
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}ek_map_index WHERE object_id NOT IN (" . implode( ',', array_fill( 0, max( 1, count( $ids ) ), '%d' ) ) . ')', $ids ? $ids : array( 0 ) ) ); // phpcs:ignore
		foreach ( $ids as $id ) {
			self::refresh( $id );
		}
		do_action( 'ek_listings_changed', $ids );
		return count( $ids );
	}

	private static function band( $type, $kobo ) {
		if ( ! $kobo || empty( self::BANDS[ $type ] ) ) {
			return 0;
		}
		$b = 1;
		foreach ( self::BANDS[ $type ] as $limit ) {
			if ( $kobo >= $limit ) {
				$b++;
			}
		}
		return $b;
	}

	/** Build (or remove) one pin. */
	public static function refresh( $id ) {
		global $wpdb;
		$t    = $wpdb->prefix . 'ek_map_index';
		$post = get_post( (int) $id );
		if ( ! $post || 'publish' !== $post->post_status || ! in_array( $post->post_type, array( Post_Types::BUSINESS, Attractions::CPT ), true ) ) {
			$wpdb->delete( $t, array( 'object_id' => (int) $id ) );
			return false;
		}
		$row = Attractions::CPT === $post->post_type ? self::attraction_row( $post ) : self::business_row( $post );
		if ( ! $row || ! is_numeric( $row['lat'] ) || ! is_numeric( $row['lng'] ) || ( ! (float) $row['lat'] && ! (float) $row['lng'] ) ) {
			$wpdb->delete( $t, array( 'object_id' => (int) $id ) );
			return false;
		}
		$row['object_id']  = (int) $id;
		$row['updated_at'] = current_time( 'mysql', true );
		$wpdb->replace( $t, $row );
		return true;
	}

	private static function business_row( $post ) {
		$id    = $post->ID;
		$p     = Business::profile( $id );
		$type  = $p['type'];
		$stats = Reviews::stats( $id );
		$rank  = Ranking::current( $id );
		$lga   = Business::lga_of( $id );
		$price = 0;
		$unit  = '';
		$band  = 0;
		$text  = '';
		$amen  = array();
		if ( 'hotel' === $type ) {
			$price = Hotel::from_price( $id );
			$unit  = 'night';
			$band  = self::band( $type, $price );
			$amen  = Hotel::settings( $id )['amenities'];
		} elseif ( 'event-centre' === $type ) {
			$price = Halls::from_price( $id );
			$unit  = 'hall';
			$band  = self::band( $type, $price );
			$amen  = Venue::settings( $id )['amenities'];
		} elseif ( 'restaurant' === $type ) {
			$r    = Restaurant::settings( $id );
			$band = (int) $r['price_level'];
			$lv   = Restaurant::price_levels()[ $band ] ?? null;
			$text = $lv ? $lv[0] . ' · ' . $lv[1] : '';
			if ( ! empty( $r['halal'] ) ) {
				$amen[] = 'halal';
			}
		}
		return array(
			'kind'        => 'business',
			'type'        => $type,
			'lga_id'      => $lga ? $lga->term_id : 0,
			'lat'         => $p['lat'],
			'lng'         => $p['lng'],
			'title'       => mb_substr( $p['name'], 0, 190 ),
			'photo_id'    => (int) ( $p['photos'][0] ?? 0 ),
			'price_from'  => (int) $price,
			'price_unit'  => $unit,
			'price_band'  => $band,
			'price_text'  => mb_substr( $text, 0, 120 ),
			'rating'      => (float) $stats['overall'],
			'reviews'     => (int) $stats['count'],
			'rank_state'  => $rank && $rank->rank_state ? (int) $rank->rank_state : null,
			'total_state' => $rank ? (int) $rank->total_state : 0,
			'rank_lga'    => $rank && $rank->rank_lga ? (int) $rank->rank_lga : null,
			'total_lga'   => $rank ? (int) $rank->total_lga : 0,
			'badges'      => $rank ? (string) $rank->badges : ( $p['verified'] ? 'verified' : '' ),
			'featured'    => self::is_featured( $id ) ? 1 : 0,
			'verified'    => $p['verified'] ? 1 : 0,
			'amenities'   => implode( ',', array_intersect( (array) $amen, array_keys( self::filter_amenities() ) ) ),
			'whatsapp'    => (string) $p['whatsapp'],
		);
	}

	private static function attraction_row( $post ) {
		$a   = Attractions::data( $post->ID );
		$lga = $a['lga_id'];
		return array(
			'kind'        => 'attraction',
			'type'        => 'attraction',
			'lga_id'      => $lga,
			'lat'         => $a['lat'],
			'lng'         => $a['lng'],
			'title'       => mb_substr( get_the_title( $post ), 0, 190 ),
			'photo_id'    => (int) get_post_thumbnail_id( $post ),
			'price_from'  => 0,
			'price_unit'  => '',
			'price_band'  => 0,
			'price_text'  => mb_substr( $a['entry_fee'], 0, 120 ),
			'rating'      => 0,
			'reviews'     => 0,
			'rank_state'  => null,
			'total_state' => 0,
			'rank_lga'    => null,
			'total_lga'   => 0,
			'badges'      => '',
			'featured'    => 0,
			'verified'    => 0,
			'amenities'   => '',
			'whatsapp'    => '',
		);
	}

	/**
	 * Featured is a paid placement (plans arrive in Phase 9). It gives a highlighted pin and a
	 * "Featured" label only: it is never part of the ranking score.
	 */
	public static function is_featured( $business_id ) {
		$until = (int) get_post_meta( $business_id, '_ek_featured_until', true );
		return (bool) apply_filters( 'ek_is_featured', $until > time(), $business_id );
	}

	public static function distance_m( $lat1, $lng1, $lat2, $lng2 ) {
		$r  = 6371000;
		$p1 = deg2rad( $lat1 );
		$p2 = deg2rad( $lat2 );
		$dp = $p2 - $p1;
		$dl = deg2rad( $lng2 - $lng1 );
		$a  = sin( $dp / 2 ) ** 2 + cos( $p1 ) * cos( $p2 ) * sin( $dl / 2 ) ** 2;
		return (int) round( 2 * $r * asin( min( 1, sqrt( $a ) ) ) );
	}

	/**
	 * Pins for the map.
	 *
	 * @param array $q bbox [s,w,n,e], types[], lga, min_rating, price[], open, amenity, lat, lng, radius_km, limit.
	 * @return array{pins: array, truncated: bool}
	 */
	public static function query( array $q ) {
		global $wpdb;
		$t     = $wpdb->prefix . 'ek_map_index';
		$where = array( '1=1' );
		$args  = array();
		$lat   = isset( $q['lat'] ) && is_numeric( $q['lat'] ) ? (float) $q['lat'] : null;
		$lng   = isset( $q['lng'] ) && is_numeric( $q['lng'] ) ? (float) $q['lng'] : null;
		$rad   = (float) ( $q['radius_km'] ?? 0 );
		if ( ! empty( $q['bbox'] ) && 4 === count( $q['bbox'] ) ) {
			list( $s, $w, $n, $e ) = array_map( 'floatval', $q['bbox'] );
			$where[] = 'lat BETWEEN %f AND %f AND lng BETWEEN %f AND %f';
			array_push( $args, min( $s, $n ), max( $s, $n ), min( $w, $e ), max( $w, $e ) );
		}
		if ( null !== $lat && null !== $lng && $rad > 0 ) {
			$dlat    = $rad / 111.0;
			$dlng    = $rad / ( 111.0 * max( 0.2, cos( deg2rad( $lat ) ) ) );
			$where[] = 'lat BETWEEN %f AND %f AND lng BETWEEN %f AND %f';
			array_push( $args, $lat - $dlat, $lat + $dlat, $lng - $dlng, $lng + $dlng );
		}
		$types = array_values( array_intersect( (array) ( $q['types'] ?? array() ), array_merge( array_keys( Business::types() ), array( 'attraction' ) ) ) );
		if ( $types ) {
			$where[] = 'type IN (' . implode( ',', array_fill( 0, count( $types ), '%s' ) ) . ')';
			$args    = array_merge( $args, $types );
		}
		if ( ! empty( $q['lga'] ) ) {
			$where[] = 'lga_id = %d';
			$args[]  = (int) $q['lga'];
		}
		if ( ! empty( $q['min_rating'] ) ) {
			$where[] = 'rating >= %f AND reviews > 0';
			$args[]  = (float) $q['min_rating'];
		}
		$bands = array_values( array_filter( array_map( 'intval', (array) ( $q['price'] ?? array() ) ) ) );
		if ( $bands ) {
			$where[] = 'price_band IN (' . implode( ',', array_fill( 0, count( $bands ), '%d' ) ) . ')';
			$args    = array_merge( $args, $bands );
		}
		if ( ! empty( $q['amenity'] ) && isset( self::filter_amenities()[ $q['amenity'] ] ) ) {
			$where[] = 'FIND_IN_SET(%s, amenities)';
			$args[]  = $q['amenity'];
		}
		$limit = max( 1, min( 600, (int) ( $q['limit'] ?? 400 ) ) );
		$sql   = "SELECT * FROM {$t} WHERE " . implode( ' AND ', $where ) . ' ORDER BY featured DESC, (rank_state IS NULL), rank_state, reviews DESC LIMIT ' . ( $limit + 1 );
		$rows  = $wpdb->get_results( $args ? $wpdb->prepare( $sql, $args ) : $sql ); // phpcs:ignore
		$trunc = count( $rows ) > $limit;
		$rows  = array_slice( $rows, 0, $limit );
		$pins  = array();
		foreach ( $rows as $r ) {
			$dist = null !== $lat && null !== $lng ? self::distance_m( $lat, $lng, (float) $r->lat, (float) $r->lng ) : null;
			if ( $rad > 0 && null !== $dist && $dist > $rad * 1000 ) {
				continue;
			}
			$open = 'business' === $r->kind ? Business::is_open( (int) $r->object_id ) : null;
			if ( ! empty( $q['open'] ) && true !== $open ) {
				continue; // Attractions have no structured hours, so they are left out when "Open now" is on.
			}
			$pins[] = self::card( $r, $dist, $open );
		}
		return array( 'pins' => $pins, 'truncated' => $trunc );
	}

	/** What the map card and list need for one pin. */
	public static function card( $r, $dist = null, $open = null ) {
		$id    = (int) $r->object_id;
		$url   = get_permalink( $id );
		$lga   = $r->lga_id ? get_term( (int) $r->lga_id ) : null;
		$lga_n = $lga && ! is_wp_error( $lga ) ? $lga->name : '';
		$types = Business::types();
		$price = '';
		if ( 'night' === $r->price_unit && $r->price_from ) {
			/* translators: %s: price */
			$price = sprintf( __( 'From %s / night', 'explore-katsina' ), Money::format( $r->price_from ) );
		} elseif ( 'hall' === $r->price_unit && $r->price_from ) {
			/* translators: %s: price */
			$price = sprintf( __( 'Halls from %s', 'explore-katsina' ), Money::format( $r->price_from ) );
		} elseif ( $r->price_text ) {
			$price = 'attraction' === $r->type ? __( 'Entry:', 'explore-katsina' ) . ' ' . $r->price_text : $r->price_text;
		}
		$book = array(
			'hotel'        => array( __( 'Book', 'explore-katsina' ), '#rooms' ),
			'restaurant'   => array( __( 'Reserve', 'explore-katsina' ), '#reserve' ),
			'event-centre' => array( __( 'See halls', 'explore-katsina' ), '#halls' ),
		);
		$rank = $r->rank_state ? Ranking::label( $r, $r->type ) : '';
		$wa   = $r->whatsapp ? 'https://wa.me/' . ltrim( $r->whatsapp, '+' ) : '';
		return array(
			'id'        => $id,
			'kind'      => $r->kind,
			'type'      => $r->type,
			'typeLabel' => 'attraction' === $r->type ? __( 'Attraction', 'explore-katsina' ) : ( $types[ $r->type ]['label'] ?? $r->type ),
			'lat'       => (float) $r->lat,
			'lng'       => (float) $r->lng,
			'title'     => $r->title,
			'url'       => $url,
			'photo'     => $r->photo_id ? (string) wp_get_attachment_image_url( (int) $r->photo_id, 'medium' ) : '',
			'rating'    => (float) $r->rating,
			'reviews'   => (int) $r->reviews,
			'rank'      => $r->rank_state ? (int) $r->rank_state : null,
			'rankLabel' => $rank,
			'lga'       => $lga_n,
			'price'     => $price,
			'priceSort' => (int) ( $r->price_from ? $r->price_from : $r->price_band ),
			'featured'  => (bool) $r->featured,
			'verified'  => (bool) $r->verified,
			'badges'    => array_values( array_intersect_key( Ranking::badge_labels(), array_flip( array_filter( explode( ',', (string) $r->badges ) ) ) ) ),
			'distance'  => $dist,
			'open'      => $open,
			'book'      => isset( $book[ $r->type ] ) ? array( 'label' => $book[ $r->type ][0], 'url' => $url . $book[ $r->type ][1] ) : null,
			'whatsapp'  => $wa,
			'directions' => 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $r->lat . ',' . $r->lng ),
			'appleMaps' => 'https://maps.apple.com/?daddr=' . rawurlencode( $r->lat . ',' . $r->lng ),
		);
	}

	/** Just what the small map needs for nearby pins. */
	public static function mini( array $pins ) {
		$colours = Assets::map_config()['pinColours'];
		return array_map( static fn( $p ) => array( 'lat' => $p['lat'], 'lng' => $p['lng'], 't' => $p['title'], 'u' => $p['url'], 'c' => $colours[ $p['type'] ] ?? '#5B5965' ), $pins );
	}

	/** Pins near a point (for the small maps on business and attraction pages). */
	public static function near( $lat, $lng, $km = 3, $limit = 12, $exclude = 0 ) {
		$res = self::query( array( 'lat' => $lat, 'lng' => $lng, 'radius_km' => $km, 'limit' => 200 ) );
		$out = array_values( array_filter( $res['pins'], static fn( $p ) => $p['id'] !== (int) $exclude ) );
		usort( $out, static fn( $a, $b ) => $a['distance'] <=> $b['distance'] );
		return array_slice( $out, 0, $limit );
	}

	/**
	 * The nearest few places of one type (hotel, restaurant, event-centre, attraction), any distance
	 * up to $km, closest first. Used on attraction pages ("Where to stay, eat and celebrate nearby").
	 */
	public static function nearest( $lat, $lng, $type, $limit = 3, $km = 80, $exclude = 0 ) {
		$res = self::query( array( 'lat' => $lat, 'lng' => $lng, 'radius_km' => $km, 'types' => array( $type ), 'limit' => 600 ) );
		$out = array_values( array_filter( $res['pins'], static fn( $p ) => $p['id'] !== (int) $exclude ) );
		usort( $out, static fn( $a, $b ) => $a['distance'] <=> $b['distance'] );
		return array_slice( $out, 0, $limit );
	}
}
