<?php
/**
 * Phase 14 isolation test helper (used by tests/e2e/phase14-isolation.js).
 *
 *   wp eval-file ek-tests/e2e/fixture-phase14.php setup            → JSON: logins, IDs of the "victim" businesses
 *   wp eval-file ek-tests/e2e/fixture-phase14.php nonces <cookie> <uid> <action:business>...  → JSON nonces
 *   wp eval-file ek-tests/e2e/fixture-phase14.php snapshot         → fingerprint of everything the victims own
 *   wp eval-file ek-tests/e2e/fixture-phase14.php cleanup          → removes what setup added
 *
 * Pairs (attacker → victim), all SAMPLE data: Crimson Gate Hotel → Emerald Court Hotel,
 * Mama Tuwo Kitchen → Garden Terrace Restaurant, Grand Durbar Hall → Royal Garden Events.
 */
use EK\Halls;
use EK\Menu;
use EK\Rooms;

global $wpdb;
$mode = $args[0] ?? 'setup';
$by   = static function ( $title ) {
	$p = get_posts( array( 'post_type' => 'ek_business', 'title' => $title, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'lang' => '' ) );
	return $p ? (int) $p[0] : 0;
};
$pairs = array(
	'hotel'      => array( $by( 'SAMPLE Crimson Gate Hotel' ), $by( 'SAMPLE Emerald Court Hotel' ) ),
	'restaurant' => array( $by( 'SAMPLE Mama Tuwo Kitchen' ), $by( 'SAMPLE Garden Terrace Restaurant' ) ),
	'venue'      => array( $by( 'SAMPLE Grand Durbar Hall' ), $by( 'SAMPLE Royal Garden Events' ) ),
);
$victims = array_map( static fn( $p ) => $p[1], $pairs );
$t       = static fn( $n ) => $wpdb->prefix . 'ek_' . $n;

if ( 'setup' === $mode ) {
	$out = array( 'pairs' => $pairs, 'logins' => array() );
	foreach ( $pairs as $kind => $p ) {
		if ( ! $p[0] || ! $p[1] ) {
			WP_CLI::error( "SAMPLE {$kind} pair missing: run wp ek sample-data" );
		}
		$owner = get_userdata( (int) get_post_field( 'post_author', $p[0] ) );
		$pass  = 'Iso-' . wp_generate_password( 14, false );
		wp_set_password( $pass, $owner->ID );
		$out['logins'][ $kind ] = array( 'user' => $owner->user_login, 'pass' => $pass, 'uid' => $owner->ID );
		$out['names'][ $kind ]  = array( get_the_title( $p[0] ), get_the_title( $p[1] ) );
	}
	list( $ha, $hb ) = $pairs['hotel'];
	$rooms_b = wp_list_pluck( Rooms::for_hotel( $hb, true ), 'id' );
	$rooms_a = wp_list_pluck( Rooms::for_hotel( $ha, true ), 'id' );
	// A price rule on the victim's room (so we can try to delete it from the attacker's account).
	$wpdb->insert( $t( 'rate_rules' ), array( 'item_id' => $rooms_b[0], 'label' => 'SAMPLE isolation test', 'start_date' => gmdate( 'Y-m-d', strtotime( '+200 days' ) ), 'end_date' => gmdate( 'Y-m-d', strtotime( '+201 days' ) ), 'price_kobo' => 5000000, 'created_at' => current_time( 'mysql', true ) ) );
	$rule_b = (int) $wpdb->insert_id;
	// An unpaid invoice for the victim (the attacker will try to pay it from their own balance).
	$wpdb->insert( $t( 'invoices' ), array( 'number' => 'SAMPLE-ISO-' . wp_rand( 1000, 9999 ), 'business_id' => $hb, 'period_start' => gmdate( 'Y-m-01' ), 'period_end' => gmdate( 'Y-m-t' ), 'amount_kobo' => 150000, 'status' => 'unpaid', 'due_at' => gmdate( 'Y-m-d H:i:s', strtotime( '+30 days' ) ), 'created_at' => current_time( 'mysql', true ) ) );
	$inv_b = (int) $wpdb->insert_id;
	$booking_b = $wpdb->get_row( $wpdb->prepare( "SELECT id, code, access_key FROM {$t( 'bookings' )} WHERE business_id = %d AND status IN ('new','confirmed') ORDER BY id DESC LIMIT 1", $hb ) );
	$review_b  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$t( 'reviews' )} WHERE business_id = %d AND status = 'published' ORDER BY id LIMIT 1", $hb ) );
	$photo_b   = (int) ( (array) get_post_meta( $hb, '_ek_gallery', true ) )[0];
	list( $ra, $rb ) = $pairs['restaurant'];
	$items_b = Menu::items( $rb );
	$cats_b  = Menu::categories( $rb );
	$cats_a  = Menu::categories( $ra );
	list( $va, $vb ) = $pairs['venue'];
	$halls_b = wp_list_pluck( Halls::for_venue( $vb, true ), 'id' );
	$halls_a = wp_list_pluck( Halls::for_venue( $va, true ), 'id' );
	$out['ids'] = array(
		'room_a'      => (int) $rooms_a[0],
		'room_b'      => (int) $rooms_b[0],
		'room_b_name' => get_the_title( $rooms_b[0] ),
		'rule_b'      => $rule_b,
		'invoice_b'   => $inv_b,
		'booking_b'   => (int) $booking_b->id,
		'code_b'      => $booking_b->code,
		'key_b'       => $booking_b->access_key,
		'review_b'    => $review_b,
		'photo_b'     => $photo_b,
		'item_b'      => (int) $items_b[0]->id,
		'item_b_name' => $items_b[0]->name,
		'cat_b'       => (int) $cats_b[0]->id,
		'cat_a'       => (int) $cats_a[0]->id,
		'hall_a'      => (int) $halls_a[0],
		'hall_b'      => (int) $halls_b[0],
		'hall_b_name' => get_the_title( $halls_b[0] ),
		'bank_a_last4' => substr( (string) ( EK\Business::private_details( $ha, true )['account_number'] ?? '' ), -4 ),
		'bank_b_last4' => substr( (string) ( EK\Business::private_details( $hb, true )['account_number'] ?? '' ), -4 ),
	);
	// Two guests with bookings: guest 1 must never see guest 2's bookings.
	$guests = $wpdb->get_col( "SELECT customer_id FROM {$t( 'bookings' )} WHERE customer_id > 0 GROUP BY customer_id HAVING COUNT(*) > 0 ORDER BY customer_id LIMIT 2" );
	if ( count( $guests ) === 2 ) {
		$g1   = get_userdata( (int) $guests[0] );
		$pass = 'Iso-' . wp_generate_password( 14, false );
		wp_set_password( $pass, $g1->ID );
		$out['guest'] = array(
			'user'       => $g1->user_login,
			'pass'       => $pass,
			'own_code'   => $wpdb->get_var( $wpdb->prepare( "SELECT code FROM {$t( 'bookings' )} WHERE customer_id = %d ORDER BY id DESC LIMIT 1", $g1->ID ) ),
			'other_code' => $wpdb->get_var( $wpdb->prepare( "SELECT code FROM {$t( 'bookings' )} WHERE customer_id = %d ORDER BY id DESC LIMIT 1", (int) $guests[1] ) ),
		);
	}
	update_option( 'ek_test_iso', array( 'rule' => $rule_b, 'invoice' => $inv_b ), false );
	echo wp_json_encode( $out );
	return;
}

if ( 'nonces' === $mode ) {
	// Nonces are tied to the browser's login session: rebuild them from that session's cookie.
	$_COOKIE[ LOGGED_IN_COOKIE ] = rawurldecode( $args[1] );
	wp_set_current_user( (int) $args[2] );
	$out = array();
	foreach ( array_slice( $args, 3 ) as $pair ) {
		list( $action, $biz ) = explode( ':', $pair );
		$out[ $pair ]         = wp_create_nonce( $action . '_' . (int) $biz );
	}
	echo wp_json_encode( $out );
	return;
}

if ( 'snapshot' === $mode ) {
	$parts = array();
	foreach ( $victims as $biz ) {
		$post    = get_post( $biz );
		$parts[] = array( $post->post_title, $post->post_status, $post->post_content, get_post_meta( $biz ) );
		$kids    = get_posts( array( 'post_type' => array( Rooms::CPT, Halls::CPT ), 'post_parent' => $biz, 'post_status' => 'any', 'posts_per_page' => -1, 'orderby' => 'ID', 'order' => 'ASC', 'lang' => '' ) );
		foreach ( $kids as $k ) {
			$parts[] = array( $k->ID, $k->post_title, $k->post_status, $k->post_content, get_post_meta( $k->ID ) );
			$parts[] = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$t( 'nights' )} WHERE item_id = %d ORDER BY night", $k->ID ), ARRAY_A );
			$parts[] = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$t( 'rate_rules' )} WHERE item_id = %d ORDER BY id", $k->ID ), ARRAY_A );
		}
		foreach ( array( 'bookings', 'reviews', 'invoices', 'payouts', 'menu_categories', 'menu_items', 'ledger', 'business_private' ) as $tbl ) {
			$parts[] = $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$t( $tbl )} WHERE business_id = %d ORDER BY 1", $biz ), ARRAY_A ); // phpcs:ignore
		}
		foreach ( (array) get_post_meta( $biz, '_ek_gallery', true ) as $pid ) {
			$parts[] = array( $pid, get_post_status( (int) $pid ), file_exists( (string) get_attached_file( (int) $pid ) ) );
		}
	}
	echo md5( serialize( $parts ) );
	return;
}

if ( 'cleanup' === $mode ) {
	$o = (array) get_option( 'ek_test_iso', array() );
	if ( ! empty( $o['rule'] ) ) {
		$wpdb->delete( $t( 'rate_rules' ), array( 'id' => (int) $o['rule'] ) );
	}
	if ( ! empty( $o['invoice'] ) ) {
		$wpdb->delete( $t( 'invoices' ), array( 'id' => (int) $o['invoice'] ) );
	}
	delete_option( 'ek_test_iso' );
	echo 'ok';
}
