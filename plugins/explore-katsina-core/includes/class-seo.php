<?php
/**
 * Phase 14 – search engines and link previews.
 *
 * Structured data (schema.org JSON-LD) so Google, Bing and AI assistants understand each page:
 *  - Hotels → Hotel (star rating only when verified by us, check-in/out, amenities, room offers in ₦).
 *  - Restaurants → Restaurant with its full Menu (sections, dishes, prices), cuisines, reservations.
 *  - Event centres → EventVenue (largest hall capacity, hall offers).
 *  - Other businesses → LocalBusiness (or a more exact type: TravelAgency, Store, BankOrCreditUnion…).
 *    Every business: address, map position, opening hours, photos, socials, price range, and the
 *    average of **verified** reviews (only reviews from real bookings exist on this site).
 *  - Attractions → TouristAttraction. Festivals & events → Event (only when the date is confirmed),
 *    with ticket offers. Tours → TouristTrip with upcoming departures. Shop products → Product
 *    (written by Rank Math's WooCommerce module).
 *
 * Only facts already shown on the page are used, so the markup never claims more than visitors see.
 * Open Graph / Twitter cards and the XML sitemap come from Rank Math (set up in Phase 12); here we add
 * a default share picture, the homepage's title and description, and correct the picture's file type.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Seo {

	/** Business type → schema.org type. */
	const TYPES = array(
		'hotel'         => 'Hotel',
		'restaurant'    => 'Restaurant',
		'event-centre'  => 'EventVenue',
		'tour-operator' => 'TravelAgency',
		'transport'     => 'LocalBusiness',
		'crafts'        => 'Store',
		'shopping'      => 'Store',
		'health'        => 'MedicalOrganization',
		'bank'          => 'BankOrCreditUnion',
	);

	public static function init() {
		add_action( 'wp_head', array( __CLASS__, 'print_schema' ), 30 );
		add_filter( 'rank_math/opengraph/facebook/og_image', array( __CLASS__, 'remember_image' ) );
		add_filter( 'rank_math/opengraph/facebook/og_image_type', array( __CLASS__, 'og_image_type' ) );
		add_filter( 'rank_math/frontend/description', array( __CLASS__, 'description' ) );
		add_filter( 'rank_math/frontend/title', array( __CLASS__, 'home_title' ), 20 );
	}

	/* ---------------- Output ---------------- */

	public static function print_schema() {
		$data = self::for_current();
		if ( ! $data ) {
			return;
		}
		echo "\n<script type=\"application/ld+json\" class=\"ek-schema\">" . wp_json_encode( $data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE ) . "</script>\n"; // phpcs:ignore
	}

	/** Schema for the page being viewed, or null. */
	public static function for_current() {
		if ( ! is_singular() ) {
			return null;
		}
		$id = get_queried_object_id();
		if ( 'publish' !== get_post_status( $id ) || post_password_required( $id ) ) {
			return null;
		}
		switch ( get_post_type( $id ) ) {
			case Post_Types::BUSINESS:
				return self::business( $id );
			case Attractions::CPT:
				return self::attraction( $id );
			case Events::CPT:
				return self::event( $id );
			case Tours::CPT:
				return self::tour( $id );
		}
		return null;
	}

	/* ---------------- Businesses ---------------- */

	public static function business( $id ) {
		$b = Business::profile( $id );
		if ( ! $b || 'publish' !== $b['status'] ) {
			return null;
		}
		$type = self::TYPES[ $b['type'] ] ?? 'LocalBusiness';
		$s    = array(
			'@context' => 'https://schema.org',
			'@type'    => $type,
			'@id'      => $b['url'] . '#business',
			'name'     => $b['name'],
			'url'      => $b['url'],
		);
		$desc = self::text( $b['description'] );
		if ( $desc ) {
			$s['description'] = $desc;
		}
		$images = self::images( $b['photos'] );
		if ( $images ) {
			$s['image'] = $images;
		}
		$s['address'] = self::address( $b['address'], $b['lga'] );
		if ( $b['lat'] && $b['lng'] ) {
			$s['geo'] = self::geo( $b['lat'], $b['lng'] );
			$s['hasMap'] = 'https://www.google.com/maps/search/?api=1&query=' . rawurlencode( $b['lat'] . ',' . $b['lng'] );
		}
		if ( $b['phone'] ) {
			$s['telephone'] = $b['phone'];
		}
		$same = array_values( array_filter( array_merge( array( $b['website'] ), array_values( $b['socials'] ) ), static fn( $u ) => $u && wp_http_validate_url( $u ) ) );
		if ( $same ) {
			$s['sameAs'] = $same;
		}
		$hours = self::opening_hours( $b['hours'] );
		if ( $hours ) {
			$s['openingHoursSpecification'] = $hours;
		}

		// Reviews: every review on this site comes from a completed booking.
		$stats = Reviews::stats( $id );
		if ( $stats['count'] > 0 ) {
			$s['aggregateRating'] = array(
				'@type'       => 'AggregateRating',
				'ratingValue' => $stats['overall'],
				'reviewCount' => $stats['count'],
				'bestRating'  => 5,
				'worstRating' => 1,
			);
			$s['review'] = array();
			foreach ( Reviews::for_business( $id, 5 ) as $r ) {
				$rev = array(
					'@type'         => 'Review',
					'author'        => array( '@type' => 'Person', 'name' => $r->author_name ? $r->author_name : __( 'Guest', 'explore-katsina' ) ),
					'datePublished' => substr( (string) $r->created_at, 0, 10 ),
					'reviewRating'  => array( '@type' => 'Rating', 'ratingValue' => (int) $r->rating_overall, 'bestRating' => 5, 'worstRating' => 1 ),
				);
				if ( $r->title ) {
					$rev['name'] = $r->title;
				}
				if ( $r->body ) {
					$rev['reviewBody'] = self::text( $r->body, 500 );
				}
				$s['review'][] = $rev;
			}
		}

		if ( 'hotel' === $b['type'] ) {
			$s = self::hotel( $id, $s );
		} elseif ( 'restaurant' === $b['type'] ) {
			$s = self::restaurant( $id, $s );
		} elseif ( 'event-centre' === $b['type'] ) {
			$s = self::venue( $id, $s );
		}
		return apply_filters( 'ek_schema_business', $s, $b );
	}

	private static function hotel( $id, array $s ) {
		$h = Hotel::settings( $id );
		if ( $h['stars'] && $h['stars_verified'] ) { // Only stars our team has checked.
			$s['starRating'] = array( '@type' => 'Rating', 'ratingValue' => $h['stars'] );
		}
		$s['checkinTime']  = $h['checkin'];
		$s['checkoutTime'] = $h['checkout'];
		$labels = Hotel::amenities();
		if ( $h['amenities'] ) {
			$s['amenityFeature'] = array_map( static fn( $a ) => array( '@type' => 'LocationFeatureSpecification', 'name' => $labels[ $a ], 'value' => true ), $h['amenities'] );
		}
		$rooms  = Rooms::for_hotel( $id );
		$prices = array();
		$offers = array();
		foreach ( $rooms as $r ) {
			$p = array_filter( array( $r['price'], $r['weekend_price'] ) );
			if ( ! $p ) {
				continue;
			}
			$prices = array_merge( $prices, $p );
			$room   = array(
				'@type'     => 'HotelRoom',
				'name'      => $r['name'],
				'occupancy' => array( '@type' => 'QuantitativeValue', 'maxValue' => $r['max_guests'], 'unitCode' => 'C62' ),
			);
			if ( $r['bed'] ) {
				$beds = Hotel::bed_types();
				$room['bed'] = $beds[ $r['bed'] ] ?? $r['bed'];
			}
			$offers[] = array(
				'@type'              => 'Offer',
				'name'               => $r['name'],
				'itemOffered'        => $room,
				'priceSpecification' => array(
					'@type'         => 'UnitPriceSpecification',
					'price'         => self::naira( min( $p ) ),
					'priceCurrency' => 'NGN',
					'unitCode'      => 'DAY',
					'unitText'      => __( 'per night', 'explore-katsina' ),
				),
				'url'                => $s['url'] . '#rooms',
			);
		}
		if ( $offers ) {
			$s['makesOffer'] = $offers;
			$s['priceRange'] = self::range( $prices );
		}
		return $s;
	}

	private static function restaurant( $id, array $s ) {
		$r      = Restaurant::settings( $id );
		$labels = Restaurant::cuisines();
		if ( $r['cuisines'] ) {
			$s['servesCuisine'] = array_values( array_map( static fn( $c ) => $labels[ $c ], $r['cuisines'] ) );
		}
		$levels = Restaurant::price_levels();
		if ( isset( $levels[ (int) $r['price_level'] ] ) ) {
			$s['priceRange'] = $levels[ (int) $r['price_level'] ][0];
		}
		$s['acceptsReservations'] = (bool) $r['res_enabled'];
		$sections = array();
		foreach ( Menu::full( $id ) as $cat ) {
			$items = array();
			foreach ( $cat->items as $i ) {
				if ( empty( $i->available ) ) {
					continue;
				}
				$item = array( '@type' => 'MenuItem', 'name' => $i->name );
				if ( ! empty( $i->description ) ) {
					$item['description'] = self::text( $i->description, 300 );
				}
				if ( (int) $i->price_kobo > 0 ) {
					$item['offers'] = array( '@type' => 'Offer', 'price' => self::naira( $i->price_kobo ), 'priceCurrency' => 'NGN' );
				}
				$items[] = $item;
			}
			if ( $items ) {
				$sections[] = array( '@type' => 'MenuSection', 'name' => $cat->name, 'hasMenuItem' => $items );
			}
		}
		if ( $sections ) {
			$s['hasMenu'] = array(
				'@type'          => 'Menu',
				'name'           => sprintf( /* translators: %s: restaurant */ __( '%s menu', 'explore-katsina' ), $s['name'] ),
				'url'            => $s['url'] . '#menu',
				'inLanguage'     => 'en',
				'hasMenuSection' => $sections,
			);
		}
		return $s;
	}

	private static function venue( $id, array $s ) {
		$halls  = Halls::for_venue( $id );
		$max    = 0;
		$prices = array();
		$offers = array();
		foreach ( $halls as $h ) {
			$max = max( $max, $h['capacity_seated'], $h['capacity_standing'] );
			$p   = array_filter( array( $h['price'], $h['weekend_price'] ) );
			if ( ! $p ) {
				continue;
			}
			$prices   = array_merge( $prices, $p );
			$offers[] = array(
				'@type'              => 'Offer',
				'name'               => $h['name'],
				'itemOffered'        => array( '@type' => 'Place', 'name' => $h['name'], 'maximumAttendeeCapacity' => max( $h['capacity_seated'], $h['capacity_standing'] ) ),
				'priceSpecification' => array(
					'@type'         => 'UnitPriceSpecification',
					'price'         => self::naira( min( $p ) ),
					'priceCurrency' => 'NGN',
					'unitText'      => 'event' === $h['pricing'] ? __( 'per event', 'explore-katsina' ) : __( 'per day', 'explore-katsina' ),
				),
				'url'                => $s['url'] . '#halls',
			);
		}
		if ( $max ) {
			$s['maximumAttendeeCapacity'] = $max;
		}
		if ( $offers ) {
			$s['makesOffer'] = $offers;
			$s['priceRange'] = self::range( $prices );
		}
		$labels = Venue::amenities();
		$am     = Venue::settings( $id )['amenities'];
		if ( $am ) {
			$s['amenityFeature'] = array_map( static fn( $a ) => array( '@type' => 'LocationFeatureSpecification', 'name' => $labels[ $a ], 'value' => true ), $am );
		}
		return $s;
	}

	/* ---------------- Attractions, events, tours ---------------- */

	public static function attraction( $id ) {
		$p = get_post( $id );
		$d = Attractions::data( $id );
		$s = array(
			'@context' => 'https://schema.org',
			'@type'    => 'TouristAttraction',
			'@id'      => get_permalink( $id ) . '#place',
			'name'     => $p->post_title,
			'url'      => get_permalink( $id ),
		);
		$desc = self::text( $p->post_excerpt ? $p->post_excerpt : $p->post_content );
		if ( $desc ) {
			$s['description'] = $desc;
		}
		$images = self::images( self::post_images( $id ) );
		if ( $images ) {
			$s['image'] = $images;
		}
		$s['address'] = self::address( '', $d['lga'] );
		if ( $d['lat'] && $d['lng'] ) {
			$s['geo'] = self::geo( $d['lat'], $d['lng'] );
		}
		if ( $d['category'] ) {
			$s['touristType'] = $d['category'];
		}
		if ( preg_match( '/^\s*free\b/i', $d['entry_fee'] ) ) {
			$s['isAccessibleForFree'] = true;
		}
		$s['publicAccess'] = true;
		return apply_filters( 'ek_schema_attraction', $s, $id );
	}

	public static function event( $id ) {
		$p = get_post( $id );
		$d = Events::data( $id );
		if ( $d['tbc'] || ! $d['start'] ) {
			return null; // Search engines need a real date: none until the date is confirmed.
		}
		$tz = Availability::tz();
		$s  = array(
			'@context'            => 'https://schema.org',
			'@type'               => 'Event',
			'@id'                 => get_permalink( $id ) . '#event',
			'name'                => $p->post_title,
			'url'                 => get_permalink( $id ),
			'startDate'           => ( new \DateTimeImmutable( $d['start'], $tz ) )->format( 'c' ),
			'eventStatus'         => 'https://schema.org/EventScheduled',
			'eventAttendanceMode' => 'https://schema.org/OfflineEventAttendanceMode',
		);
		if ( $d['end'] ) {
			$s['endDate'] = ( new \DateTimeImmutable( $d['end'], $tz ) )->format( 'c' );
		}
		$desc = self::text( $p->post_excerpt ? $p->post_excerpt : $p->post_content );
		if ( $desc ) {
			$s['description'] = $desc;
		}
		$images = self::images( self::post_images( $id ) );
		if ( $images ) {
			$s['image'] = $images;
		}
		$place = array( '@type' => 'Place', 'name' => $d['venue'] ? $d['venue'] : ( $d['lga'] ? $d['lga'] : 'Katsina State' ), 'address' => self::address( '', $d['lga'] ) );
		if ( $d['lat'] && $d['lng'] ) {
			$place['geo'] = self::geo( $d['lat'], $d['lng'] );
		}
		$s['location']  = $place;
		$s['organizer'] = array( '@type' => 'Organization', 'name' => get_bloginfo( 'name' ), 'url' => home_url( '/' ) );
		$offers         = array();
		foreach ( Tickets::types( $id ) as $t ) {
			$offers[] = array(
				'@type'         => 'Offer',
				'name'          => $t->name,
				'price'         => self::naira( $t->price_kobo ),
				'priceCurrency' => 'NGN',
				'availability'  => Tickets::available( $t ) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
				'url'           => get_permalink( $id ) . '#tickets',
			);
		}
		if ( $offers ) {
			$s['offers'] = $offers;
		}
		return apply_filters( 'ek_schema_event', $s, $id );
	}

	public static function tour( $id ) {
		$p = get_post( $id );
		$d = Tours::data( $id );
		$s = array(
			'@context' => 'https://schema.org',
			'@type'    => 'TouristTrip',
			'@id'      => get_permalink( $id ) . '#trip',
			'name'     => $p->post_title,
			'url'      => get_permalink( $id ),
			'provider' => array( '@type' => 'Organization', 'name' => get_bloginfo( 'name' ), 'url' => home_url( '/' ) ),
		);
		$desc = self::text( $p->post_excerpt ? $p->post_excerpt : $p->post_content );
		if ( $desc ) {
			$s['description'] = $desc;
		}
		$images = self::images( self::post_images( $id ) );
		if ( $images ) {
			$s['image'] = $images;
		}
		$offers = array();
		foreach ( array_slice( Tours::departures( $id ), 0, 10 ) as $dep ) {
			$offers[] = array(
				'@type'         => 'Offer',
				'price'         => self::naira( Tours::price_of( $dep ) ),
				'priceCurrency' => 'NGN',
				'availability'  => Tours::seats_left( $dep ) > 0 ? 'https://schema.org/InStock' : 'https://schema.org/SoldOut',
				'availabilityStarts' => gmdate( 'c', time() ),
				'validThrough'  => wp_date( 'c', Tours::starts_at( $dep ) ),
				'url'           => get_permalink( $id ),
			);
		}
		if ( $offers ) {
			$s['offers'] = $offers;
		} elseif ( $d['price'] ) {
			$s['offers'] = array( '@type' => 'Offer', 'price' => self::naira( $d['price'] ), 'priceCurrency' => 'NGN', 'url' => get_permalink( $id ) );
		}
		return apply_filters( 'ek_schema_tour', $s, $id );
	}

	/* ---------------- Helpers ---------------- */

	/** Plain text from page content, shortened at a word. */
	public static function text( $html, $max = 300 ) {
		$t = trim( preg_replace( '/\s+/u', ' ', wp_strip_all_tags( strip_shortcodes( (string) $html ) ) ) );
		$t = html_entity_decode( $t, ENT_QUOTES, 'UTF-8' );
		if ( mb_strlen( $t ) > $max ) {
			$t = rtrim( mb_substr( $t, 0, mb_strrpos( mb_substr( $t, 0, $max - 1 ), ' ' ) ?: $max - 1 ), ' ,.;:' ) . '…'; // phpcs:ignore
		}
		return $t;
	}

	private static function naira( $kobo ) {
		$n = (int) $kobo / 100;
		return 0 === (int) $kobo % 100 ? (string) (int) $n : number_format( $n, 2, '.', '' );
	}

	private static function range( array $kobo ) {
		$kobo = array_filter( array_map( 'intval', $kobo ) );
		if ( ! $kobo ) {
			return '';
		}
		$lo = min( $kobo );
		$hi = max( $kobo );
		return $lo === $hi ? Money::format( $lo ) : Money::format( $lo ) . '–' . Money::format( $hi );
	}

	private static function address( $street, $lga ) {
		$a = array( '@type' => 'PostalAddress' );
		if ( $street ) {
			$a['streetAddress'] = $street;
		}
		if ( $lga ) {
			$a['addressLocality'] = $lga;
		}
		$a['addressRegion']  = 'Katsina State';
		$a['addressCountry'] = 'NG';
		return $a;
	}

	private static function geo( $lat, $lng ) {
		return array( '@type' => 'GeoCoordinates', 'latitude' => round( (float) $lat, 6 ), 'longitude' => round( (float) $lng, 6 ) );
	}

	private static function post_images( $id ) {
		$ids = array();
		if ( has_post_thumbnail( $id ) ) {
			$ids[] = (int) get_post_thumbnail_id( $id );
		}
		return array_values( array_unique( array_merge( $ids, Gallery::ids( $id ) ) ) );
	}

	private static function images( array $ids, $max = 3 ) {
		$out = array();
		foreach ( array_slice( $ids, 0, $max ) as $aid ) {
			$src = wp_get_attachment_image_url( (int) $aid, 'large' );
			if ( $src ) {
				$out[] = $src;
			}
		}
		return $out;
	}

	private static function opening_hours( array $hours ) {
		$names = array( 'mon' => 'Monday', 'tue' => 'Tuesday', 'wed' => 'Wednesday', 'thu' => 'Thursday', 'fri' => 'Friday', 'sat' => 'Saturday', 'sun' => 'Sunday' );
		if ( ! empty( $hours['always'] ) ) {
			return array( array( '@type' => 'OpeningHoursSpecification', 'dayOfWeek' => array_values( $names ), 'opens' => '00:00', 'closes' => '23:59' ) );
		}
		$out = array();
		foreach ( $names as $k => $day ) {
			if ( empty( $hours[ $k ] ) || ! empty( $hours[ $k ]['closed'] ) ) {
				continue;
			}
			$out[] = array( '@type' => 'OpeningHoursSpecification', 'dayOfWeek' => $day, 'opens' => $hours[ $k ]['open'], 'closes' => $hours[ $k ]['close'] );
		}
		return $out;
	}

	/* ---------------- Rank Math (titles, descriptions, share pictures) ---------------- */

	/** @var string The share picture's address, to give its real file type. */
	private static $og_image = '';

	/** Default share picture for pages without their own (the credited Commons photo of the Emir's Palace, Katsina: wide, as share previews need). */
	public static function default_image_id() {
		$found = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_ek_media_key', 'meta_value' => 'katsina-palace-1', 'lang' => '' ) ); // phpcs:ignore
		return $found ? (int) $found[0] : 0;
	}

	/** Run once by `wp ek plugins-setup`: Rank Math's default share picture. */
	public static function setup_rank_math() {
		$t  = (array) get_option( 'rank-math-options-titles', array() );
		$id = self::default_image_id();
		if ( $id && ( empty( $t['open_graph_image'] ) || get_post_meta( (int) ( $t['open_graph_image_id'] ?? 0 ), '_ek_media_key', true ) ) ) { // Never replace a picture the owner chose.
			$t['open_graph_image']    = wp_get_attachment_image_url( $id, 'full' );
			$t['open_graph_image_id'] = $id;
		}
		$t['twitter_card_type'] = 'summary_large_image';
		update_option( 'rank-math-options-titles', $t );
		return $id ? 'default share picture set' : 'no default share picture (run wp ek import-guide --media)';
	}

	public static function remember_image( $url ) {
		self::$og_image = (string) $url;
		return $url;
	}

	/** Rank Math gives the original upload's type (JPEG) even when the picture is the WebP copy. */
	public static function og_image_type( $type ) {
		$ext = strtolower( pathinfo( (string) wp_parse_url( self::$og_image, PHP_URL_PATH ), PATHINFO_EXTENSION ) );
		$map = array( 'webp' => 'image/webp', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'gif' => 'image/gif', 'avif' => 'image/avif' );
		return $map[ $ext ] ?? $type;
	}

	public static function home_title( $title ) {
		if ( is_front_page() ) {
			$t = (array) get_option( 'rank-math-options-titles', array() );
			return ! empty( $t['homepage_title'] ) ? $t['homepage_title'] : $title;
		}
		return $title;
	}

	/** Search-result descriptions for our main pages (about 150 characters; shown under the title on Google). */
	public static function page_descriptions() {
		return array(
			'explore'           => __( 'Everything to see and do in Katsina State: hotels, restaurants, event centres, attractions, festivals and tours, all in one place.', 'explore-katsina' ),
			'hotels'            => __( 'Find and book hotels and guest houses in Katsina State. Compare rooms and Naira prices, read verified guest reviews and pay securely.', 'explore-katsina' ),
			'restaurants'       => __( 'Restaurants and eateries in Katsina State: menus with prices, opening hours, verified reviews and table reservations online.', 'explore-katsina' ),
			'event_centres'     => __( 'Event centres and halls in Katsina State for weddings, conferences and parties. Compare capacity and prices, check dates and book.', 'explore-katsina' ),
			'things_to_do'      => __( 'Things to do in Katsina State: palaces, the Gobarau Minaret, museums, city gates, markets, nature and crafts, with maps and visiting tips.', 'explore-katsina' ),
			'map'               => __( 'The Katsina Map: hotels, restaurants, event centres and attractions across all 34 LGAs. Use "near me" to find places around you.', 'explore-katsina' ),
			'top_hotels'        => __( 'Top 10 hotels in Katsina State, ranked daily from verified guest reviews, bookings and responsiveness. Rankings cannot be bought.', 'explore-katsina' ),
			'top_restaurants'   => __( 'Top 10 restaurants in Katsina State, ranked daily from verified diner reviews and reliability. Rankings cannot be bought.', 'explore-katsina' ),
			'top_event_centres' => __( 'Top 10 event centres in Katsina State, ranked daily from verified client reviews and reliability. Rankings cannot be bought.', 'explore-katsina' ),
			'events'            => __( 'Festivals and events in Katsina State, including the Sallah Durbar. Dates, places and tickets where available.', 'explore-katsina' ),
			'tours'             => __( 'Guided tours of Katsina State with upcoming departure dates, prices in Naira and secure online booking.', 'explore-katsina' ),
			'directory'         => __( 'Directory of businesses in Katsina State: hotels, restaurants, transport, crafts, shopping, health and banks, by LGA.', 'explore-katsina' ),
			'stories'           => __( 'Stories, guides and travel tips about Katsina State: history, culture, food and festivals.', 'explore-katsina' ),
			'plan_trip'         => __( 'Plan a trip to Katsina State: getting there, when to visit, sample itineraries, local customs and safety tips.', 'explore-katsina' ),
			'guides'            => __( 'Travel guides to Katsina State, to read on your phone or print before your trip.', 'explore-katsina' ),
			'list_business'     => __( 'List your hotel, restaurant, event centre or business on Explore Katsina. Basic listings are free; take bookings and get found on the Katsina Map.', 'explore-katsina' ),
			'pricing'           => __( 'Explore Katsina prices for businesses: free Basic listing, Featured and Premium plans, booking commission and extras.', 'explore-katsina' ),
			'advertise'         => __( 'Advertise on Explore Katsina: banners, sponsored stories and promoted events reaching visitors planning trips to Katsina State.', 'explore-katsina' ),
			'about'             => __( 'About Explore Katsina: the tourism guide, business directory and booking site for Katsina State, Nigeria.', 'explore-katsina' ),
			'contact'           => __( 'Contact Explore Katsina by email, phone or WhatsApp for help with bookings, listings or advertising.', 'explore-katsina' ),
			'faq_travellers'    => __( 'Answers for travellers: booking, paying, cancelling, refunds, reviews and getting help on Explore Katsina.', 'explore-katsina' ),
			'faq_businesses'    => __( 'Answers for businesses: listing, approval, bookings, commission, payouts, reviews and rankings on Explore Katsina.', 'explore-katsina' ),
		);
	}

	/** A description for pages that have none of their own. */
	public static function description( $desc ) {
		if ( $desc ) {
			return $desc;
		}
		if ( is_front_page() ) {
			$t = (array) get_option( 'rank-math-options-titles', array() );
			return (string) ( $t['homepage_description'] ?? '' );
		}
		foreach ( self::page_descriptions() as $key => $text ) {
			if ( Install::is_page( $key ) ) {
				return $text;
			}
		}
		if ( function_exists( 'is_shop' ) && is_shop() ) {
			return __( 'Katsina crafts, souvenirs and travel guides from the Explore Katsina shop, delivered in Nigeria.', 'explore-katsina' );
		}
		if ( is_singular( array( Post_Types::BUSINESS, Attractions::CPT, Events::CPT, Tours::CPT, 'page' ) ) ) {
			$p = get_queried_object();
			return self::text( $p->post_excerpt ? $p->post_excerpt : $p->post_content, 158 );
		}
		return $desc;
	}
}
