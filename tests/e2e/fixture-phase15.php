<?php
/**
 * Phase 15 journey helpers: things a browser cannot do, such as letting time pass (a stay ending, money
 * being released, an invoice falling due, a plan running out) or creating many map pins at once.
 *
 *   shift <code> <days>             move a booking so it starts <days> from today (negative = in the past)
 *   release-booking <code>          the booking's 3-day money hold has passed: release it
 *   invoice-month <code>            move a finished booking into last month; prints that month (Y-m)
 *   invoice-due <business_id>       the business's newest invoice is past due: run the daily check
 *   event <stamp>                   an event with tickets + a check-in staff account
 *   ads-off / ads-restore           show only the journey's ad in its zone, then put the others back
 *   expire-plan <business_id>       let the business's paid plan run out now
 *   owner <business_title>          set a known password for a SAMPLE owner → {user, pass, id}
 *   ranking <stamp> <lat> <lng>     a newcomer hotel with one 5★ review + an established 4.6★ hotel
 *   pins <count> <stamp>            add SAMPLE directory pins across the state (for the 200+ pin map test)
 *   status <code>                   the booking's status and money lines
 *   cleanup <stamp>                 remove what this file created
 */
use EK\Booking;
use EK\Business;
use EK\Install;
use EK\Invoices;
use EK\Ledger;
use EK\Map_Index;
use EK\Plans;
use EK\Ranking;

global $wpdb;
$mode = $args[0] ?? '';
$tz   = EK\Availability::tz();
$out  = array();

switch ( $mode ) {
	case 'shift':
		$b     = Booking::by_code( $args[1] );
		$len   = (int) round( ( strtotime( $b->end_date ) - strtotime( $b->start_date ) ) / DAY_IN_SECONDS );
		$start = ( new DateTimeImmutable( 'today', $tz ) )->modify( ( (int) $args[2] >= 0 ? '+' : '' ) . (int) $args[2] . ' days' );
		$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'start_date' => $start->format( 'Y-m-d' ), 'end_date' => $start->modify( "+{$len} days" )->format( 'Y-m-d' ) ), array( 'id' => $b->id ) );
		$out = array( 'start' => $start->format( 'Y-m-d' ) );
		break;

	case 'invoice-month':
		$b    = Booking::by_code( $args[1] );
		$last = new DateTimeImmutable( 'first day of last month', $tz );
		$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'start_date' => $last->modify( '+4 days' )->format( 'Y-m-d' ), 'end_date' => $last->modify( '+5 days' )->format( 'Y-m-d' ) ), array( 'id' => $b->id ) );
		$out = array( 'month' => $last->format( 'Y-m' ) );
		break;

	case 'expire-plan':
		update_post_meta( (int) $args[1], '_ek_plan_until', time() - 60 );
		$out = Plans::tick();
		Map_Index::flush();
		break;

	case 'owner':
		$id    = (int) ( get_posts( array( 'post_type' => 'ek_business', 'title' => $args[1], 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'lang' => '' ) )[0] ?? 0 );
		$owner = get_userdata( (int) get_post_field( 'post_author', $id ) );
		$pass  = 'Journey-' . wp_generate_password( 12, false );
		wp_set_password( $pass, $owner->ID );
		$out = array( 'id' => $id, 'user' => $owner->user_login, 'pass' => $pass, 'url' => get_permalink( $id ) );
		break;

	case 'ranking':
		list( , $stamp, $lat, $lng ) = $args;
		$lga  = get_term_by( 'name', 'Mashi', 'ek_lga' ) ?: get_term_by( 'name', 'Katsina', 'ek_lga' ); // phpcs:ignore
		$make = static function ( $name, $dlat ) use ( $lga, $lat, $lng ) {
			$uid = wp_insert_user( array( 'user_login' => sanitize_user( strtolower( str_replace( ' ', '_', $name ) ) ), 'user_email' => sanitize_title( $name ) . '@example.test', 'user_pass' => wp_generate_password( 16 ), 'role' => Install::ROLE_OWNER ) );
			$id  = Business::create( array( 'name' => $name, 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'SAMPLE address', 'lat' => (float) $lat + $dlat, 'lng' => (float) $lng, 'phone' => '+2348000000000', 'whatsapp' => '', 'email' => 'x@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => 'SAMPLE business for the Phase 15 ranking journey. Not a real business.' ), $uid );
			wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
			EK\Rooms::save( $id, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2000000, 'weekend_price' => 0, 'units' => 3, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );
			return $id;
		};
		$reviews = static function ( $biz, array $ratings ) use ( $wpdb ) {
			foreach ( $ratings as $i => $r ) {
				$at = gmdate( 'Y-m-d H:i:s', time() - ( $i * 3 + 2 ) * DAY_IN_SECONDS );
				$wpdb->insert( $wpdb->prefix . 'ek_bookings', array( 'code' => 'J' . strtoupper( wp_generate_password( 9, false ) ), 'kind' => 'hotel', 'business_id' => $biz, 'status' => 'checked_out', 'start_date' => gmdate( 'Y-m-d', strtotime( $at ) - DAY_IN_SECONDS ), 'end_date' => gmdate( 'Y-m-d', strtotime( $at ) ), 'customer_name' => 'SAMPLE Guest', 'created_at' => $at, 'updated_at' => $at ) );
				$wpdb->insert( $wpdb->prefix . 'ek_reviews', array( 'business_id' => $biz, 'booking_id' => $wpdb->insert_id, 'author_name' => 'SAMPLE G.', 'rating_overall' => $r, 'title' => 'SAMPLE review', 'body' => 'SAMPLE review for the ranking journey.', 'status' => 'published', 'created_at' => $at ) );
			}
		};
		$new = $make( "SAMPLE Newcomer Inn {$stamp}", 0.002 );
		$old = $make( "SAMPLE Established Lodge {$stamp}", -0.002 );
		$reviews( $new, array( 5 ) );
		$reviews( $old, array_merge( array_fill( 0, 16, 5 ), array_fill( 0, 6, 4 ), array( 3, 4, 5, 4 ) ) );
		Ranking::run();
		$cur = static fn( $id ) => Ranking::current( $id );
		$out = array( 'new' => $new, 'old' => $old, 'new_url' => get_permalink( $new ), 'old_url' => get_permalink( $old ), 'lga' => $lga->slug, 'new_rank' => $cur( $new ), 'old_rank' => $cur( $old ), 'new_avg' => EK\Reviews::stats( $new )['overall'], 'old_avg' => EK\Reviews::stats( $old )['overall'] );
		break;

	case 'pins':
		list( , $count, $stamp ) = $args;
		$lgas = get_terms( array( 'taxonomy' => 'ek_lga', 'hide_empty' => false ) );
		$uid  = get_users( array( 'role' => 'administrator', 'number' => 1, 'fields' => 'ID' ) )[0];
		$made = 0;
		for ( $i = 0; $i < (int) $count; $i++ ) {
			$lga = $lgas[ $i % count( $lgas ) ];
			$id  = wp_insert_post( array( 'post_type' => 'ek_business', 'post_status' => 'publish', 'post_title' => "SAMPLE Map Pin {$stamp} {$i}", 'post_content' => 'SAMPLE pin for the map load test.', 'post_author' => $uid ) );
			wp_set_object_terms( $id, $lga->term_id, 'ek_lga' );
			wp_set_object_terms( $id, array( 'restaurant', 'event-centre', 'hotel' )[ $i % 3 ], 'ek_type' ); // Types the map shows.
			update_post_meta( $id, '_ek_lat', 11.2 + ( $i * 37 % 100 ) / 100 * 2.1 );
			update_post_meta( $id, '_ek_lng', 6.9 + ( $i * 61 % 100 ) / 100 * 1.6 );
			update_post_meta( $id, '_ek_hours', array( 'always' => 1 ) );
			update_post_meta( $id, '_ek_journey', $stamp );
			$made++;
		}
		Map_Index::rebuild();
		$out = array( 'made' => $made, 'total' => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}ek_map_index" ) );
		break;

	case 'event':
		$stamp = $args[1];
		$ev    = wp_insert_post( array( 'post_type' => EK\Events::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Journey Concert {$stamp}", 'post_content' => 'SAMPLE event for the Phase 15 ticket journey. Not a real event.' ) );
		update_post_meta( $ev, '_ek_start', ( new DateTimeImmutable( '+25 days', $tz ) )->format( 'Y-m-d' ) . ' 18:00' );
		update_post_meta( $ev, '_ek_venue', 'SAMPLE Hall' );
		update_post_meta( $ev, '_ek_journey', $stamp );
		EK\Tickets::save_types( $ev, array( array( 'name' => 'Regular', 'price' => '2500', 'quantity' => 40 ) ) );
		$pass  = 'Staff-' . wp_generate_password( 12, false );
		$staff = wp_insert_user( array( 'user_login' => "jstaff_{$stamp}", 'user_email' => "jstaff_{$stamp}@example.test", 'user_pass' => $pass, 'role' => EK\Tickets::ROLE ) );
		$out   = array( 'event' => $ev, 'url' => get_permalink( $ev ), 'staff' => "jstaff_{$stamp}", 'staff_pass' => $pass );
		break;

	case 'ads-off':
		// Only our journey ad in its zone, so it is the one shown (the others are switched back on afterwards).
		$ids = $wpdb->get_col( "SELECT id FROM {$wpdb->prefix}ek_ads WHERE active = 1" );
		$wpdb->query( "UPDATE {$wpdb->prefix}ek_ads SET active = 0 WHERE active = 1" );
		update_option( 'ek_test_ads_off', $ids, false );
		$out = array( 'paused' => count( $ids ) );
		break;

	case 'ads-restore':
		foreach ( (array) get_option( 'ek_test_ads_off', array() ) as $id ) {
			$wpdb->update( $wpdb->prefix . 'ek_ads', array( 'active' => 1 ), array( 'id' => (int) $id ) );
		}
		delete_option( 'ek_test_ads_off' );
		$out = array( 'ok' => true );
		break;

	case 'release-booking':
		// The money for this booking becomes due now (as if its 3-day hold had passed), then the release job runs.
		$b = Booking::by_code( $args[1] );
		$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_ledger SET release_at = %s WHERE booking_id = %d AND status = 'on_hold'", gmdate( 'Y-m-d H:i:s', time() - 60 ), $b->id ) );
		$out = array( 'released' => Ledger::release_due() );
		break;

	case 'invoice-due':
		// This business's newest unpaid invoice is now past its due date; the daily check runs.
		$inv = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_invoices WHERE business_id = %d AND status = 'unpaid' ORDER BY id DESC LIMIT 1", (int) $args[1] ) );
		$wpdb->update( $wpdb->prefix . 'ek_invoices', array( 'due_at' => gmdate( 'Y-m-d H:i:s', time() - DAY_IN_SECONDS ) ), array( 'id' => $inv->id ) );
		Invoices::enforce();
		$out = array( 'status' => get_post_status( (int) $args[1] ), 'invoice' => $inv->number );
		break;

	case 'guest':
		// A SAMPLE guest account (email sample-guest-…, so `wp ek delete-sample` removes it).
		$u = get_user_by( 'login', 'sample_guest_account' );
		if ( ! $u ) {
			$u = get_userdata( wp_insert_user( array( 'user_login' => 'sample_guest_account', 'user_email' => 'sample-guest-account@example.test', 'user_pass' => wp_generate_password( 20 ), 'role' => EK\Account::customer_role(), 'display_name' => 'SAMPLE Guest Account' ) ) );
		}
		$pass = 'Guest-' . wp_generate_password( 12, false );
		wp_set_password( $pass, $u->ID );
		$out = array( 'user' => $u->user_login, 'pass' => $pass );
		break;

	case 'sweep-urls':
		// Every page in the brief (both languages), one of each kind of listing, and the shop pages.
		$rel  = static fn( $u ) => wp_make_link_relative( $u );
		$keys = array_unique( array_merge( EK\Languages::PAGES, array( 'book', 'account', 'agreement', 'promote_event', 'checkin', 'dashboard' ) ) );
		$en   = array();
		$ha   = array();
		foreach ( $keys as $k ) {
			$id = EK\Install::page_id( $k );
			if ( ! $id ) {
				continue;
			}
			$en[ $k ] = $rel( get_permalink( $id ) );
			$h        = function_exists( 'pll_get_post' ) ? pll_get_post( $id, 'ha' ) : 0;
			if ( $h ) {
				$ha[ $k ] = $rel( get_permalink( $h ) );
			}
		}
		$one = static function ( $args ) use ( $rel ) {
			$p = get_posts( array_merge( array( 'posts_per_page' => 1, 'post_status' => 'publish', 'lang' => '' ), $args ) );
			return $p ? $rel( get_permalink( $p[0] ) ) : '';
		};
		$items = array();
		foreach ( array( 'hotel', 'restaurant', 'event-centre', 'tour-operator', 'transport', 'crafts', 'shopping', 'health', 'banks' ) as $t ) {
			$items[ $t ] = $one( array( 'post_type' => 'ek_business', 'meta_key' => '_ek_sample_set', 'tax_query' => array( array( 'taxonomy' => 'ek_type', 'field' => 'slug', 'terms' => $t ) ) ) ); // phpcs:ignore
		}
		$items['attraction'] = $one( array( 'post_type' => EK\Attractions::CPT ) );
		$items['event']      = $one( array( 'post_type' => EK\Events::CPT, 'meta_key' => '_ek_sample_set' ) ); // phpcs:ignore
		$items['festival']   = $one( array( 'post_type' => EK\Events::CPT, 's' => 'Durbar' ) );
		$items['tour']       = $one( array( 'post_type' => EK\Tours::CPT, 'meta_key' => '_ek_sample_set' ) ); // phpcs:ignore
		$items['story']      = $one( array( 'post_type' => 'post', 'category__not_in' => array( (int) get_option( 'default_category' ) ) ) );
		$items['product']    = $one( array( 'post_type' => 'product' ) );
		$items['shop']       = $rel( get_permalink( wc_get_page_id( 'shop' ) ) );
		$items['cart']       = $rel( get_permalink( wc_get_page_id( 'cart' ) ) );
		$items['top_lga']    = $rel( EK\Top::url( 'hotel', 'katsina' ) );
		$biz = array();
		foreach ( array( 'hotel' => 'SAMPLE Crimson Gate Hotel', 'restaurant' => 'SAMPLE Mama Tuwo Kitchen', 'venue' => 'SAMPLE Grand Durbar Hall', 'directory' => 'SAMPLE Indigo Dye Workshop' ) as $k => $title ) {
			$id    = (int) ( get_posts( array( 'post_type' => 'ek_business', 'title' => $title, 'posts_per_page' => 1, 'fields' => 'ids', 'lang' => '' ) )[0] ?? 0 );
			$owner = $id ? get_userdata( (int) get_post_field( 'post_author', $id ) ) : null;
			if ( $owner ) {
				$pass        = 'Sweep-' . wp_generate_password( 12, false );
				wp_set_password( $pass, $owner->ID );
				$biz[ $k ] = array( 'id' => $id, 'user' => $owner->user_login, 'pass' => $pass, 'sections' => array_keys( EK\Dashboard::sections( EK\Business::type_of( $id ) ) ) );
			}
		}
		$out = array( 'en' => $en, 'ha' => $ha, 'items' => array_filter( $items ), 'biz' => $biz );
		break;

	case 'status':
		$b   = Booking::by_code( $args[1] );
		$out = array( 'status' => $b->status, 'ledger' => $wpdb->get_results( $wpdb->prepare( "SELECT entry_type, amount_kobo, status FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d", $b->id ), ARRAY_A ) );
		break;

	case 'cleanup':
		$stamp = $args[1];
		$ids   = get_posts( array( 'post_type' => 'ek_business', 'post_status' => 'any', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => '_ek_journey', 'meta_value' => $stamp, 'lang' => '' ) ); // phpcs:ignore
		foreach ( $ids as $id ) {
			wp_delete_post( $id, true );
		}
		Map_Index::rebuild();
		$out = array( 'deleted_pins' => count( $ids ) );
		break;
}
echo wp_json_encode( $out );
