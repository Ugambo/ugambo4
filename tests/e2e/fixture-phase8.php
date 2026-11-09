<?php
/**
 * Phase 8 browser-test data around one point: the main SAMPLE hotel (made by fixture-hotel.php) gets a
 * room and 30 verified 5★ reviews; two more SAMPLE hotels, a SAMPLE restaurant and a SAMPLE attraction
 * are added close by; then rankings are calculated.
 * Run: wp eval-file ek-tests/e2e/fixture-phase8.php <hotel_id> <lat> <lng> <stamp>
 */
use EK\Attractions;
use EK\Business;
use EK\Hotel;
use EK\Post_Types;
use EK\Ranking;
use EK\Restaurant;
use EK\Rooms;

list( $main, $lat, $lng, $stamp ) = array( (int) $args[0], (float) $args[1], (float) $args[2], $args[3] );
$lga   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$owner = (int) get_post_field( 'post_author', $main );
global $wpdb;
$hotel_settings = array( 'stars' => 3, 'amenities' => array( 'wifi', 'parking' ), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true );
$reviews = static function ( $biz, array $ratings, $replied = false ) use ( $wpdb ) {
	foreach ( $ratings as $i => $r ) {
		$at = gmdate( 'Y-m-d H:i:s', time() - ( $i + 2 ) * DAY_IN_SECONDS );
		$wpdb->insert( $wpdb->prefix . 'ek_bookings', array( 'code' => 'F' . strtoupper( wp_generate_password( 9, false ) ), 'kind' => 'hotel', 'business_id' => $biz, 'status' => 'checked_out', 'start_date' => gmdate( 'Y-m-d', strtotime( $at ) - DAY_IN_SECONDS ), 'end_date' => gmdate( 'Y-m-d', strtotime( $at ) ), 'customer_name' => 'SAMPLE Guest', 'created_at' => $at, 'updated_at' => $at ) );
		$wpdb->insert( $wpdb->prefix . 'ek_reviews', array( 'business_id' => $biz, 'booking_id' => $wpdb->insert_id, 'author_name' => 'SAMPLE G.', 'rating_overall' => $r, 'title' => 'SAMPLE review', 'body' => 'SAMPLE review text for the map and ranking test.', 'status' => 'published', 'owner_reply' => $replied ? 'Thank you!' : null, 'created_at' => $at ) );
	}
};
$mk = static function ( $name, $type, $dlat ) use ( $lga, $lat, $lng, $owner ) {
	$id = Business::create( array( 'name' => $name, 'type' => $type, 'lga_id' => $lga->term_id, 'address' => 'SAMPLE address', 'lat' => $lat + $dlat, 'lng' => $lng, 'phone' => '+2348030000000', 'whatsapp' => '+2348030000012', 'email' => 'f@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => 'SAMPLE business for automated testing. Not a real business.' ), $owner );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	return $id;
};
Hotel::save( $main, $hotel_settings );
Rooms::save( $main, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2200000, 'weekend_price' => 0, 'units' => 3, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );
$reviews( $main, array_fill( 0, 30, 5 ), true );
$h2 = $mk( "SAMPLE Map Lodge {$stamp}", 'hotel', 0.003 );
Hotel::save( $h2, $hotel_settings );
Rooms::save( $h2, 0, array( 'name' => 'Room', 'description' => '', 'price' => 5000000, 'weekend_price' => 0, 'units' => 3, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );
$reviews( $h2, array( 4, 4, 4 ) );
$r = $mk( "SAMPLE Map Kitchen {$stamp}", 'restaurant', -0.004 );
Restaurant::save( $r, array_merge( Restaurant::settings( $r ), array( 'cuisines' => array( 'hausa' ), 'price_level' => 2 ) ) );
$a = wp_insert_post( array( 'post_type' => Attractions::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Map Attraction {$stamp}", 'post_content' => 'SAMPLE placeholder attraction for automated tests. Not a real place.' ) );
update_post_meta( $a, '_ek_lat', $lat + 0.012 );
update_post_meta( $a, '_ek_lng', $lng );
update_post_meta( $a, '_ek_entry_fee', 'SAMPLE fee' );
update_post_meta( $a, '_ek_hours_text', 'SAMPLE hours' );
update_post_meta( $a, '_ek_unverified', 1 );
wp_set_object_terms( $a, array( $lga->term_id ), Post_Types::TAX_LGA );
Ranking::run();
echo wp_json_encode( array( 'lodge' => $h2, 'kitchen' => $r, 'attraction' => $a, 'attraction_url' => get_permalink( $a ), 'lga' => $lga->slug ) );
