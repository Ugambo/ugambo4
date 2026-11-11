<?php
/**
 * SAMPLE data for demonstrations and testing (`wp ek sample-data`), from content/sample/data.php:
 *  - 8 hotels (3–4 room types each), 8 restaurants with full menus, 5 event centres with halls, and 3
 *    businesses in each directory category, spread over 7 LGAs with map pins near real town centres;
 *  - past completed visits with verified reviews, so rankings show (one hotel has too few reviews to be
 *    ranked, to show "new, not yet ranked");
 *  - current bookings and reservations in every status, made through the real booking engine where
 *    possible (so payments, refunds and money records are real);
 *  - 2 Explore Katsina tours with dates, 1 ticketed event with tickets sold, 5 shop products and
 *    1 digital guide (PDF);
 *  - one Featured hotel and one Premium restaurant, one Verified business.
 * Everything is named "SAMPLE …" and removed by `wp ek delete-sample --yes`. No real business names,
 * phone numbers (placeholder +234 800 000 0000) or photos of real businesses (generic Wikimedia Commons
 * photos, credited, when available locally).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Sample_Data {

	const META   = '_ek_sample_set';
	const OPTION = 'ek_sample_data';
	const PHONE  = '+2348000000000';

	private $d;
	private $out    = array( 'businesses' => 0, 'rooms' => 0, 'menu_items' => 0, 'halls' => 0, 'reviews' => 0, 'bookings' => 0, 'tours' => 0, 'events' => 0, 'products' => 0, 'photos' => 0 );
	private $media  = '';
	private $credits = array();
	private $ids    = array( 'hotel' => array(), 'restaurant' => array(), 'event-centre' => array() );
	private $guest  = 0;
	private $photo_cache = array();

	public static function exists() {
		return (bool) get_posts( array( 'post_type' => Post_Types::BUSINESS, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => self::META, 'meta_value' => 1 ) ); // phpcs:ignore
	}

	/** @return array|\WP_Error counts */
	public static function generate( $media_dir = '' ) {
		if ( self::exists() ) {
			return new \WP_Error( 'exists', 'SAMPLE data is already there. Run `wp ek delete-sample --yes` first to start again.' );
		}
		$g = new self();
		return $g->run( $media_dir );
	}

	private function run( $media_dir ) {
		$this->d = (array) include EK_DIR . 'content/sample/data.php';
		if ( $media_dir && file_exists( trailingslashit( $media_dir ) . 'credits.json' ) ) {
			$this->media   = trailingslashit( $media_dir );
			$this->credits = (array) json_decode( (string) file_get_contents( $this->media . 'credits.json' ), true );
		}
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		add_filter( 'pre_wp_mail', '__return_true', 99 ); // No emails for sample bookings.
		mt_srand( 20261111 ); // Same pins and choices every time.

		$this->hotels();
		$this->restaurants();
		$this->venues();
		$this->others();
		$this->extras();
		$this->history();
		$this->live_bookings();
		$this->tours();
		$this->ticketed_event();
		$this->shop();

		Map_Index::flush();
		Ranking::run();
		Map_Index::rebuild();
		remove_filter( 'pre_wp_mail', '__return_true', 99 );
		update_option( self::OPTION, array( 'created' => time(), 'counts' => $this->out ), false );
		return $this->out;
	}

	/* ---------------- Helpers ---------------- */

	private function pin( $town ) {
		$t   = $this->d['towns'][ $town ];
		$ang = mt_rand( 0, 359 ) * M_PI / 180;
		$km  = mt_rand( 200, 1500 ) / 1000;
		return array( round( $t[1] + $km / 111 * cos( $ang ), 6 ), round( $t[2] + $km / ( 111 * cos( deg2rad( $t[1] ) ) ) * sin( $ang ), 6 ) );
	}

	private function slug( $name ) {
		return substr( sanitize_title( $name ), 0, 40 );
	}

	private function business( $name, $type, $town, $description, $hours = array( 'always' => 1 ) ) {
		$slug = $this->slug( $name );
		$uid  = username_exists( 'sample_' . $slug );
		if ( ! $uid ) {
			$uid = wp_insert_user( array( 'user_login' => 'sample_' . $slug, 'user_email' => 'sample-' . $slug . '@example.test', 'user_pass' => wp_generate_password( 20 ), 'role' => Install::ROLE_OWNER, 'display_name' => 'SAMPLE Owner (' . $name . ')' ) );
		}
		list( $lat, $lng ) = $this->pin( $town );
		$lga = get_term_by( 'name', $this->d['towns'][ $town ][0], Post_Types::TAX_LGA );
		$id  = Business::create(
			array(
				'name'        => 'SAMPLE ' . $name,
				'type'        => $type,
				'lga_id'      => $lga ? $lga->term_id : 0,
				'address'     => 'SAMPLE address, ' . $this->d['towns'][ $town ][0],
				'lat'         => $lat,
				'lng'         => $lng,
				'phone'       => self::PHONE,
				'whatsapp'    => self::PHONE,
				'email'       => 'sample-' . $slug . '@example.test',
				'website'     => '',
				'socials'     => array(),
				'hours'       => $hours,
				'description' => 'SAMPLE listing for demonstration only. Not a real business. ' . $description,
			),
			$uid
		);
		if ( is_wp_error( $id ) ) {
			return 0;
		}
		Business::save_private( $id, array( 'owner_name' => 'SAMPLE Owner', 'cac_number' => '', 'bank_name' => 'SAMPLE Bank', 'account_name' => 'SAMPLE ' . $name, 'account_number' => '0000000000' ) );
		update_post_meta( $id, self::META, 1 );
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
		$this->out['businesses']++;
		return (int) $id;
	}

	/** Attach generic Commons photos (credited) from the local sample folder. */
	private function photos( $biz, array $keys ) {
		if ( ! $this->media ) {
			return;
		}
		$ids = array();
		foreach ( $keys as $k ) {
			if ( empty( $this->credits[ $k ] ) || ! file_exists( $this->media . $k . '.jpg' ) ) {
				continue;
			}
			$tmp = wp_tempnam( $k . '.jpg' );
			copy( $this->media . $k . '.jpg', $tmp );
			$pid = media_handle_sideload( array( 'name' => 'sample-' . $k . '.jpg', 'tmp_name' => $tmp ), $biz, 'SAMPLE photo' );
			if ( is_wp_error( $pid ) ) {
				continue;
			}
			update_post_meta( $pid, '_ek_business_photo', $biz );
			update_post_meta( $pid, '_ek_credit', $this->credits[ $k ] );
			update_post_meta( $pid, self::META, 1 );
			$ids[] = (int) $pid;
			$this->out['photos']++;
		}
		if ( $ids ) {
			Business::set_photos( $biz, $ids );
		}
	}

	private function guest() {
		$n = $this->d['guests'][ $this->guest++ % count( $this->d['guests'] ) ];
		return array( 'SAMPLE ' . $n, 'sample-guest-' . sanitize_title( $n ) . '@example.test', '08000000000' );
	}

	private function day( $offset ) {
		return ( new \DateTimeImmutable( 'today', Availability::tz() ) )->modify( ( $offset >= 0 ? '+' : '' ) . (int) $offset . ' days' )->format( 'Y-m-d' );
	}

	/* ---------------- Businesses ---------------- */

	private function hotels() {
		$room_photos = array( 'hotel-room-2', 'hotel-room-3', 'hotel-room-4' );
		foreach ( $this->d['hotels'] as $i => $h ) {
			list( $name, $town, $stars, $policy, $amen, $rooms ) = $h;
			$id = $this->business( $name, 'hotel', $town, sprintf( 'A %d-star hotel in %s.', $stars, $this->d['towns'][ $town ][0] ) );
			if ( ! $id ) {
				continue;
			}
			Hotel::save( $id, array( 'stars' => $stars, 'amenities' => $amen, 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => 'SAMPLE house rules: no smoking in rooms; quiet hours from 10 pm.', 'policy' => $policy, 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => 0 !== $i % 3 ) );
			foreach ( $rooms as $r ) {
				Rooms::save( $id, 0, array( 'name' => $r[0], 'description' => 'SAMPLE room.', 'price' => $r[1] * 100, 'weekend_price' => $r[2] * 100, 'units' => $r[3], 'max_guests' => $r[4], 'bed' => $r[5], 'size' => $r[6], 'amenities' => array( 'ac', 'tv', 'wifi' ), 'active' => true ) );
				$this->out['rooms']++;
			}
			$keys = array( $room_photos[ $i % 3 ], $room_photos[ ( $i + 1 ) % 3 ] );
			if ( in_array( 'pool', $amen, true ) ) {
				$keys[] = 'hotel-pool-1';
			}
			$this->photos( $id, $keys );
			$this->ids['hotel'][] = $id;
		}
	}

	private function restaurants() {
		$food = array( 'food-jollof-2', 'food-suya-1', 'food-masa-1', 'food-tuwo-1' );
		foreach ( $this->d['restaurants'] as $i => $r ) {
			list( $name, $town, $cuisines, $level, $menu ) = $r;
			$hours = array();
			foreach ( array( 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' ) as $day ) {
				$hours[ $day ] = array( 'open' => '08:00', 'close' => '22:00' );
			}
			$id = $this->business( $name, 'restaurant', $town, 'A restaurant in ' . $this->d['towns'][ $town ][0] . '.', array( 'always' => 1 ) );
			if ( ! $id ) {
				continue;
			}
			Restaurant::save( $id, array_merge( Restaurant::settings( $id ), array( 'cuisines' => $cuisines, 'price_level' => $level, 'capacity' => 30 + 10 * ( $i % 3 ), 'slot_minutes' => 60, 'max_party' => 12, 'min_notice_hours' => 1, 'res_from' => '11:00', 'res_to' => '21:00', 'deposit_enabled' => 3 === $i ? 1 : 0, 'deposit_min_party' => 6, 'deposit_per_guest' => 200000 ) ) );
			foreach ( $menu as $cat => $items ) {
				$cid = Menu::add_category( $id, $cat );
				foreach ( $items as $it ) {
					Menu::save_item( $id, 0, array( 'name' => $it[0], 'description' => $it[2], 'price_kobo' => $it[1] * 100, 'category_id' => $cid, 'available' => 1 ) );
					$this->out['menu_items']++;
				}
			}
			$this->photos( $id, array( $food[ $i % 4 ], $food[ ( $i + 2 ) % 4 ] ) );
			$this->ids['restaurant'][] = $id;
		}
	}

	private function venues() {
		$hall_photos = array( 'event-hall-2', 'event-hall-3' );
		foreach ( $this->d['venues'] as $i => $v ) {
			list( $name, $town, $mode, $policy, $amen, $halls ) = $v;
			$id = $this->business( $name, 'event-centre', $town, 'An event centre in ' . $this->d['towns'][ $town ][0] . ' for weddings, naming ceremonies and conferences.' );
			if ( ! $id ) {
				continue;
			}
			Venue::save( $id, array_merge( Venue::defaults(), array( 'booking_mode' => $mode, 'deposit_pct' => 30, 'policy' => $policy, 'amenities' => $amen ) ) );
			foreach ( $halls as $h ) {
				Halls::save( $id, 0, array( 'name' => $h[0], 'description' => 'SAMPLE hall.', 'price' => $h[1] * 100, 'weekend_price' => $h[2] * 100, 'pricing' => 'day', 'capacity_seated' => $h[3], 'capacity_standing' => $h[4], 'setting' => $h[5], 'active' => true ) );
				$this->out['halls']++;
			}
			$this->photos( $id, array( $hall_photos[ $i % 2 ] ) );
			$this->ids['event-centre'][] = $id;
		}
	}

	private function others() {
		foreach ( $this->d['others'] as $type => $list ) {
			foreach ( $list as $b ) {
				$this->business( $b[0], $type, $b[1], $b[2] );
			}
		}
	}

	/** One Featured hotel, one Premium restaurant (paid placement, never changes rank), one Verified business. */
	private function extras() {
		$until = time() + 30 * DAY_IN_SECONDS;
		if ( ! empty( $this->ids['hotel'][1] ) ) {
			update_post_meta( $this->ids['hotel'][1], '_ek_plan', 'featured' );
			update_post_meta( $this->ids['hotel'][1], '_ek_plan_until', $until );
			update_post_meta( $this->ids['hotel'][1], '_ek_featured_until', $until );
		}
		if ( ! empty( $this->ids['restaurant'][3] ) ) {
			update_post_meta( $this->ids['restaurant'][3], '_ek_plan', 'premium' );
			update_post_meta( $this->ids['restaurant'][3], '_ek_plan_until', $until );
			update_post_meta( $this->ids['restaurant'][3], '_ek_featured_until', $until );
		}
		if ( ! empty( $this->ids['hotel'][0] ) ) {
			update_post_meta( $this->ids['hotel'][0], '_ek_verified', 1 );
		}
	}

	/* ---------------- Past visits + verified reviews ---------------- */

	/** Ratings per business, so ranks differ (and Palmview Lodge, with 2 reviews, stays unranked). */
	private function ratings() {
		return array(
			'hotel'        => array( array( 5, 5, 5, 4, 5, 4, 5 ), array( 4, 4, 5, 3 ), array( 5, 4, 5, 5, 4, 5 ), array( 4, 5, 4 ), array( 3, 4, 2 ), array( 4, 4, 4, 5, 3 ), array( 4, 3 ), array( 5, 4, 4, 5 ) ),
			'restaurant'   => array( array( 5, 4, 5, 5 ), array( 5, 5, 4, 5, 5 ), array( 4, 4, 3, 4 ), array( 5, 4, 4 ), array( 4, 3, 4 ), array( 3, 4, 3, 4 ), array( 4, 5, 4 ), array( 3, 3, 4 ) ),
			'event-centre' => array( array( 5, 4, 5, 5 ), array( 4, 5, 4 ), array( 4, 4, 3 ), array( 5, 5 ), array( 4, 5, 5, 4 ) ),
		);
	}

	private function history() {
		global $wpdb;
		$kinds = array( 'hotel' => 'hotel', 'restaurant' => 'restaurant', 'event-centre' => 'event' );
		$done  = array( 'hotel' => 'checked_out', 'restaurant' => 'completed', 'event-centre' => 'completed' );
		foreach ( $this->ratings() as $type => $sets ) {
			foreach ( $sets as $i => $ratings ) {
				$biz = $this->ids[ $type ][ $i ] ?? 0;
				if ( ! $biz ) {
					continue;
				}
				$item = $this->first_item( $type, $biz );
				foreach ( $ratings as $n => $stars ) {
					$ago   = 12 + $n * 17 + $i * 3;
					$start = $this->day( -$ago );
					$end   = 'hotel' === $type ? $this->day( -$ago + 2 ) : $start;
					list( $gname, $gmail ) = $this->guest();
					$total = 'hotel' === $type ? 3600000 : ( 'restaurant' === $type ? 0 : 30000000 );
					$id    = $this->insert_booking( $kinds[ $type ], $biz, $item, $done[ $type ], $start, $end, $gname, $gmail, $total, 'restaurant' === $type ? 0 : $total, 'restaurant' === $type ? '' : 'full', 'restaurant' === $type ? '19:00:00' : null, $this->day( -$ago + ( 'hotel' === $type ? 2 : 0 ) ) . ' 12:00:00' );
					$texts = $this->d['reviews'][ $stars ] ?? $this->d['reviews'][4];
					$t     = $texts[ ( $n + $i ) % count( $texts ) ];
					$wpdb->insert(
						$wpdb->prefix . 'ek_reviews',
						array(
							'business_id'        => $biz,
							'booking_id'         => $id,
							'author_name'        => $gname,
							'rating_overall'     => $stars,
							'rating_cleanliness' => 'hotel' === $type ? $stars : null,
							'rating_service'     => $stars,
							'rating_value'       => max( 1, $stars - ( $n % 2 ) ),
							'title'              => 'SAMPLE ' . $t[0],
							'body'               => 'SAMPLE review. ' . $t[1],
							'lang'               => 'en',
							'status'             => 'published',
							'owner_reply'        => 0 === $n % 3 ? 'SAMPLE reply: Thank you for staying with us!' : null,
							'owner_reply_at'     => 0 === $n % 3 ? $this->day( -$ago + 4 ) . ' 10:00:00' : null,
							'created_at'         => $this->day( -$ago + 3 ) . ' 09:00:00',
						)
					);
					$this->out['reviews']++;
				}
			}
		}
	}

	private function first_item( $type, $biz ) {
		$cpt = array( 'hotel' => Rooms::CPT, 'event-centre' => Halls::CPT );
		if ( empty( $cpt[ $type ] ) ) {
			return 0;
		}
		$ids = get_posts( array( 'post_type' => $cpt[ $type ], 'post_parent' => $biz, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'orderby' => 'ID', 'order' => 'ASC' ) );
		return $ids ? (int) $ids[0] : 0;
	}

	/** Bookings in the past or today (the engine only takes future dates). History only: no money records. */
	private function insert_booking( $kind, $biz, $item, $status, $start, $end, $name, $email, $total, $paid, $mode, $time = null, $updated = null ) {
		global $wpdb;
		do {
			$code = 'EK-S' . strtoupper( wp_generate_password( 5, false ) );
		} while ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE code = %s", $code ) ) );
		$now = $updated ? $updated : current_time( 'mysql', true );
		$wpdb->insert(
			$wpdb->prefix . 'ek_bookings',
			array(
				'code'           => $code,
				'kind'           => $kind,
				'business_id'    => $biz,
				'item_id'        => $item,
				'customer_name'  => $name,
				'customer_email' => $email,
				'customer_phone' => '+2348000000000',
				'start_date'     => $start,
				'end_date'       => $end,
				'start_time'     => $time,
				'guests'         => 2,
				'quantity'       => 1,
				'total_kobo'     => $total,
				'deposit_kobo'   => 0,
				'paid_kobo'      => $paid,
				'payment_mode'   => $mode,
				'status'         => $status,
				'access_key'     => bin2hex( random_bytes( 16 ) ),
				'details'        => wp_json_encode( array( 'sample' => 1, 'note' => 'SAMPLE history booking (no money records).' ) ),
				'created_at'     => $start . ' 08:00:00',
				'updated_at'     => $now,
			)
		);
		$this->out['bookings']++;
		return (int) $wpdb->insert_id;
	}

	/* ---------------- Current bookings in every status ---------------- */

	private function hotel_booking( $room, $in, $nights, $pay ) {
		list( $name, $email, $phone ) = $this->guest();
		$max = (int) ( Rooms::data( $room )['max_guests'] ?? 1 );
		$b   = Booking::create_hotel( array( 'room_id' => $room, 'checkin' => $this->day( $in ), 'checkout' => $this->day( $in + $nights ), 'guests' => min( 2, max( 1, $max ) ), 'rooms' => 1, 'payment' => $pay, 'name' => $name, 'email' => $email, 'phone' => $phone ) );
		if ( ! is_wp_error( $b ) ) {
			$this->out['bookings']++;
		}
		return $b;
	}

	private function pay( $b, $full = true ) {
		if ( is_wp_error( $b ) ) {
			return $b;
		}
		$amount = (int) ( $b->details['pay_now'] ?? ( $full ? $b->total_kobo : $b->deposit_kobo ) );
		Booking::mark_paid( $b->id, $amount, 'SAMPLE-' . $b->code );
		return Booking::get( $b->id );
	}

	private function expire( $b, $late_payment = false ) {
		global $wpdb;
		if ( is_wp_error( $b ) ) {
			return;
		}
		$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $b->id ) );
		Booking::expire_holds();
		if ( $late_payment ) {
			Booking::mark_paid( $b->id, (int) ( $b->details['pay_now'] ?? $b->total_kobo ), 'SAMPLE-LATE-' . $b->code );
		}
	}

	/** Keep an unpaid booking "awaiting payment" for 2 days, so the status can be seen. */
	private function keep_waiting( $b ) {
		global $wpdb;
		if ( ! is_wp_error( $b ) ) {
			$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() + 2 * DAY_IN_SECONDS ) ), array( 'id' => $b->id ) );
		}
	}

	private function live_bookings() {
		$hotels = $this->ids['hotel'];
		if ( count( $hotels ) < 3 ) {
			return;
		}
		$owner = static fn( $biz ) => (int) get_post_field( 'post_author', $biz );
		$room  = $this->first_item( 'hotel', $hotels[0] );
		$room2 = $this->first_item( 'hotel', $hotels[1] ); // Flexible policy, pay at hotel allowed.

		// Hotels.
		$this->keep_waiting( $this->hotel_booking( $room, 20, 2, 'full' ) );                       // Awaiting payment.
		$this->expire( $this->hotel_booking( $room, 22, 1, 'full' ) );                             // Expired (not paid).
		// Payment issue: a guest's hold runs out, someone else takes the only suite, then the late payment arrives.
		$suite = 0;
		foreach ( get_posts( array( 'post_type' => Rooms::CPT, 'post_parent' => $hotels[2], 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1 ) ) as $rid ) {
			if ( 1 === (int) ( Rooms::data( $rid )['units'] ?? 0 ) ) {
				$suite = (int) $rid;
			}
		}
		if ( $suite ) {
			$late = $this->hotel_booking( $suite, 24, 1, 'full' );
			$this->expire( $late );
			$this->pay( $this->hotel_booking( $suite, 24, 1, 'full' ) );
			if ( ! is_wp_error( $late ) ) {
				Booking::mark_paid( $late->id, (int) ( $late->details['pay_now'] ?? $late->total_kobo ), 'SAMPLE-LATE-' . $late->code );
			}
		}
		$this->pay( $this->hotel_booking( $room, 26, 2, 'full' ) );                                // New (paid, waiting for the hotel).
		$c = $this->pay( $this->hotel_booking( $room, 28, 3, 'deposit' ), false );                 // Confirmed (deposit paid).
		if ( ! is_wp_error( $c ) ) {
			Booking::hotel_transition( $c, 'confirmed', $owner( $hotels[0] ) );
		}
		$d = $this->pay( $this->hotel_booking( $room, 30, 1, 'full' ) );                           // Declined (full refund).
		if ( ! is_wp_error( $d ) ) {
			Booking::hotel_transition( $d, 'declined', $owner( $hotels[0] ) );
		}
		$v = $this->hotel_booking( $room2, 18, 2, 'venue' );                                       // Pay at the hotel, confirmed.
		if ( ! is_wp_error( $v ) ) {
			Booking::hotel_transition( Booking::get( $v->id ), 'confirmed', $owner( $hotels[1] ) );
		}
		$g = $this->pay( $this->hotel_booking( $room2, 34, 2, 'full' ) );                          // Cancelled by the guest (refund by policy).
		if ( ! is_wp_error( $g ) ) {
			Booking::hotel_transition( $g, 'confirmed', $owner( $hotels[1] ) );
			Refunds::guest_cancel( Booking::get( $g->id ), 0 );
		}
		$h = $this->pay( $this->hotel_booking( $room2, 36, 1, 'full' ) );                          // Cancelled by the hotel (full refund).
		if ( ! is_wp_error( $h ) ) {
			Booking::hotel_transition( $h, 'confirmed', $owner( $hotels[1] ) );
			Booking::hotel_transition( Booking::get( $h->id ), 'cancelled', $owner( $hotels[1] ) );
		}
		// Today and yesterday (history rows).
		list( $n1, $e1 ) = $this->guest();
		$this->insert_booking( 'hotel', $hotels[2], $this->first_item( 'hotel', $hotels[2] ), 'checked_in', $this->day( 0 ), $this->day( 2 ), $n1, $e1, 4400000, 4400000, 'full' );
		list( $n2, $e2 ) = $this->guest();
		$this->insert_booking( 'hotel', $hotels[2], $this->first_item( 'hotel', $hotels[2] ), 'no_show', $this->day( -1 ), $this->day( 0 ), $n2, $e2, 2200000, 660000, 'deposit' );

		// Restaurants.
		$rest = $this->ids['restaurant'];
		if ( count( $rest ) >= 4 ) {
			$res = function ( $biz, $in, $party, $time = '19:00' ) {
				list( $name, $email, $phone ) = $this->guest();
				$b = Booking::create_reservation( array( 'business_id' => $biz, 'date' => $this->day( $in ), 'time' => $time, 'party' => $party, 'name' => $name, 'email' => $email, 'phone' => $phone ) );
				if ( ! is_wp_error( $b ) ) {
					$this->out['bookings']++;
				}
				return $b;
			};
			$res( $rest[2], 3, 2 );                                                                  // New.
			$r = $res( $rest[2], 4, 4, '13:00' );                                                    // Confirmed.
			if ( ! is_wp_error( $r ) ) {
				Booking::transition( $r, 'confirmed', $owner( $rest[2] ) );
			}
			$r = $res( $rest[2], 5, 3 );                                                             // Declined.
			if ( ! is_wp_error( $r ) ) {
				Booking::transition( $r, 'declined', $owner( $rest[2] ) );
			}
			$r = $res( $rest[2], 6, 2, '20:00' );                                                    // Cancelled by the restaurant.
			if ( ! is_wp_error( $r ) ) {
				Booking::transition( $r, 'confirmed', $owner( $rest[2] ) );
				Booking::transition( Booking::get( $r->id ), 'cancelled', $owner( $rest[2] ) );
			}
			$this->keep_waiting( $res( $rest[3], 7, 8 ) );                                           // Large group: deposit awaiting payment.
			$this->expire( $res( $rest[3], 8, 8 ) );                                                 // Large group: expired.
			$p = $this->pay( $res( $rest[3], 9, 10 ) );                                              // Large group: deposit paid.
			unset( $p );
			list( $n3, $e3 ) = $this->guest();
			$this->insert_booking( 'restaurant', $rest[0], 0, 'seated', $this->day( 0 ), $this->day( 0 ), $n3, $e3, 0, 0, '', '13:00:00' );
			list( $n4, $e4 ) = $this->guest();
			$this->insert_booking( 'restaurant', $rest[0], 0, 'no_show', $this->day( -1 ), $this->day( -1 ), $n4, $e4, 0, 0, '', '19:00:00' );
		}

		// Event centres: Grand Durbar Hall = request to book; Royal Garden Events = instant booking.
		$ven = $this->ids['event-centre'];
		if ( count( $ven ) >= 2 ) {
			$ev = function ( $venue, $in, $guests ) {
				list( $name, $email, $phone ) = $this->guest();
				$b = Booking::create_event( array( 'hall_id' => $this->first_item( 'event-centre', $venue ), 'start' => $this->day( $in ), 'end' => '', 'guests' => $guests, 'layout' => 'seated', 'event_type' => 'wedding', 'name' => $name, 'email' => $email, 'phone' => $phone ) );
				if ( ! is_wp_error( $b ) ) {
					$this->out['bookings']++;
				}
				return $b;
			};
			$ev( $ven[0], 40, 600 );                                                                 // Requested.
			$a = $ev( $ven[0], 45, 800 );                                                            // Accepted, deposit due.
			if ( ! is_wp_error( $a ) ) {
				Booking::transition( $a, 'confirmed', $owner( $ven[0] ) );
			}
			$p = $ev( $ven[0], 50, 900 );                                                            // Deposit paid.
			if ( ! is_wp_error( $p ) ) {
				Booking::transition( $p, 'confirmed', $owner( $ven[0] ) );
				$this->pay( Booking::get( $p->id ), false );
			}
			$x = $ev( $ven[0], 55, 300 );                                                            // Declined.
			if ( ! is_wp_error( $x ) ) {
				Booking::transition( $x, 'declined', $owner( $ven[0] ) );
			}
			$this->keep_waiting( $ev( $ven[1], 60, 400 ) );                                          // Instant: awaiting payment.
			$this->pay( $ev( $ven[1], 62, 500 ), false );                                            // Instant: deposit paid.
			$k = $this->pay( $ev( $ven[1], 64, 300 ), false );                                       // Cancelled by the guest.
			if ( ! is_wp_error( $k ) ) {
				Refunds::guest_cancel( Booking::get( $k->id ), 0 );
			}
			$this->expire( $ev( $ven[1], 66, 200 ) );                                                // Expired.
		}
	}

	/* ---------------- Tours, ticketed event, shop ---------------- */

	private function tours() {
		$sat = new \DateTimeImmutable( 'next saturday', Availability::tz() );
		foreach ( $this->d['tours'] as $t ) {
			list( $name, $price, $group, $duration, $pickup, $includes, $town, $time ) = $t;
			$id = wp_insert_post( array( 'post_type' => Tours::CPT, 'post_status' => 'publish', 'post_title' => 'SAMPLE ' . $name, 'post_content' => '<p>SAMPLE tour for demonstration only. Write your own tour description, route and times before selling real tours.</p>' ) );
			update_post_meta( $id, '_ek_price_kobo', $price * 100 );
			update_post_meta( $id, '_ek_group_size', $group );
			update_post_meta( $id, '_ek_pickup', $pickup );
			update_post_meta( $id, '_ek_duration', $duration );
			update_post_meta( $id, '_ek_includes', $includes );
			update_post_meta( $id, self::META, 1 );
			$rows = array();
			for ( $w = 0; $w < 4; $w++ ) {
				$rows[] = array( 'date' => $sat->modify( '+' . ( $w * 7 ) . ' days' )->format( 'Y-m-d' ), 'time' => $time, 'seats' => $group, 'price' => (string) $price );
			}
			Tours::save_departures( $id, $rows );
			$dep = Tours::departures( $id );
			if ( $dep ) {
				list( $gname, $gmail, $gphone ) = $this->guest();
				$sale = Tours::book( $dep[0]->id, 2, $gname, $gmail, $gphone );
				if ( ! is_wp_error( $sale ) ) {
					Sales::mark_paid( $sale->id, (int) $sale->amount_kobo, 'SAMPLE-' . $sale->code );
				}
			}
			$this->out['tours']++;
		}
	}

	private function ticketed_event() {
		$venue = $this->ids['event-centre'][0] ?? 0;
		$start = ( new \DateTimeImmutable( 'today', Availability::tz() ) )->modify( '+30 days' )->format( 'Y-m-d' );
		$id    = wp_insert_post( array( 'post_type' => Events::CPT, 'post_status' => 'publish', 'post_title' => 'SAMPLE Food & Culture Night', 'post_excerpt' => 'SAMPLE ticketed event for demonstration.', 'post_content' => '<p>SAMPLE event for demonstration only: an evening of local food, music and crafts. Not a real event.</p>' ) );
		wp_set_object_terms( $id, array( 'cultural', 'music' ), Events::TAX );
		$lga = get_term_by( 'name', 'Katsina', Post_Types::TAX_LGA );
		if ( $lga ) {
			wp_set_object_terms( $id, array( $lga->term_id ), Post_Types::TAX_LGA );
		}
		update_post_meta( $id, '_ek_start', $start . ' 18:00' );
		update_post_meta( $id, '_ek_end', $start . ' 23:00' );
		update_post_meta( $id, '_ek_date_tbc', 0 );
		update_post_meta( $id, '_ek_venue', $venue ? get_the_title( $venue ) : 'SAMPLE venue, Katsina' );
		if ( $venue ) {
			update_post_meta( $id, '_ek_lat', get_post_meta( $venue, '_ek_lat', true ) );
			update_post_meta( $id, '_ek_lng', get_post_meta( $venue, '_ek_lng', true ) );
		}
		update_post_meta( $id, self::META, 1 );
		Tickets::save_types( $id, array( array( 'id' => '', 'name' => 'Regular', 'price' => '5000', 'quantity' => 200, 'sales_end' => '' ), array( 'id' => '', 'name' => 'VIP', 'price' => '15000', 'quantity' => 50, 'sales_end' => '' ) ) );
		$types = Tickets::types( $id );
		if ( $types ) {
			list( $gname, $gmail, $gphone ) = $this->guest();
			$sale = Tickets::buy( $id, array( $types[0]->id => 2, ( $types[1]->id ?? 0 ) => 1 ), $gname, $gmail, $gphone );
			if ( ! is_wp_error( $sale ) ) {
				Sales::mark_paid( $sale->id, (int) $sale->amount_kobo, 'SAMPLE-' . $sale->code );
			}
		}
		$this->out['events']++;
	}

	private function shop() {
		if ( ! class_exists( '\WC_Product_Simple' ) ) {
			return;
		}
		Shop::setup();
		foreach ( $this->d['products'] as $p ) {
			list( $name, $price, $cat, $stock ) = $p;
			$term = get_term_by( 'slug', $cat, 'product_cat' );
			$prod = new \WC_Product_Simple();
			$prod->set_name( 'SAMPLE ' . $name );
			$prod->set_status( 'publish' );
			$prod->set_regular_price( (string) $price );
			$prod->set_manage_stock( true );
			$prod->set_stock_quantity( $stock );
			$prod->set_description( 'SAMPLE product for demonstration only. Replace with your real products, photos and prices.' );
			if ( $term ) {
				$prod->set_category_ids( array( $term->term_id ) );
			}
			$pid = $prod->save();
			update_post_meta( $pid, self::META, 1 );
			$this->out['products']++;
		}
		// Digital guide: a small PDF, downloadable after payment.
		$up  = wp_upload_dir();
		$dir = trailingslashit( $up['basedir'] ) . 'woocommerce_uploads';
		wp_mkdir_p( $dir );
		$file = $dir . '/sample-katsina-pocket-guide.pdf';
		file_put_contents( $file, self::pdf( array( 'SAMPLE Katsina Pocket Guide', '', 'This is a SAMPLE digital guide for demonstration only.', 'Replace it with your real guide (PDF) in WooCommerce > Products.', '', 'Explore Katsina - explorekatsina.com.ng' ) ) ); // phpcs:ignore
		$guide = new \WC_Product_Simple();
		$guide->set_name( 'SAMPLE Katsina Pocket Guide (PDF)' );
		$guide->set_status( 'publish' );
		$guide->set_regular_price( '2000' );
		$guide->set_virtual( true );
		$guide->set_downloadable( true );
		$dl = new \WC_Product_Download();
		$dl->set_name( 'Katsina Pocket Guide (SAMPLE)' );
		$dl->set_id( md5( $file ) );
		$dl->set_file( trailingslashit( $up['baseurl'] ) . 'woocommerce_uploads/sample-katsina-pocket-guide.pdf' );
		$guide->set_downloads( array( $dl ) );
		$guide->set_description( 'SAMPLE digital guide for demonstration only.' );
		$gt = get_term_by( 'slug', 'guides', 'product_cat' );
		if ( $gt ) {
			$guide->set_category_ids( array( $gt->term_id ) );
		}
		$gid = $guide->save();
		update_post_meta( $gid, self::META, 1 );
		$this->out['products']++;
	}

	/** A one-page PDF with a few lines of text (no library needed). */
	public static function pdf( array $lines ) {
		$text = "BT /F1 16 Tf 60 780 Td 22 TL\n";
		foreach ( $lines as $l ) {
			$text .= '(' . str_replace( array( '\\', '(', ')' ), array( '\\\\', '\\(', '\\)' ), $l ) . ") Tj T*\n";
		}
		$text .= 'ET';
		$objs = array(
			'<< /Type /Catalog /Pages 2 0 R >>',
			'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
			'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
			'<< /Length ' . strlen( $text ) . " >>\nstream\n" . $text . "\nendstream",
			'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
		);
		$pdf  = "%PDF-1.4\n";
		$offs = array();
		foreach ( $objs as $i => $o ) {
			$offs[] = strlen( $pdf );
			$pdf   .= ( $i + 1 ) . " 0 obj\n" . $o . "\nendobj\n";
		}
		$xref = strlen( $pdf );
		$pdf .= "xref\n0 " . ( count( $objs ) + 1 ) . "\n0000000000 65535 f \n";
		foreach ( $offs as $o ) {
			$pdf .= sprintf( "%010d 00000 n \n", $o );
		}
		return $pdf . "trailer\n<< /Size " . ( count( $objs ) + 1 ) . " /Root 1 0 R >>\nstartxref\n" . $xref . "\n%%EOF\n";
	}
}
