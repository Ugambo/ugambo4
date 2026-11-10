<?php
/**
 * Phase 8 checks: honest rankings (Bayesian average, recency, bookings, response, badges, statewide
 * and LGA ranks, paid plans never change rank, hidden reviews), the map index and its data endpoint
 * (visible area, filters, distance, radius, no stored location), attractions, nearby, Top 10.
 * Run: wp eval-file ek-tests/phase8-rank-map.php
 *
 * Tour operators are used for the ranking maths: no other test creates them, so the numbers are exact.
 */

use EK\Attractions;
use EK\Business;
use EK\Favourites;
use EK\Hotel;
use EK\Install;
use EK\Map_Index;
use EK\Post_Types;
use EK\Ranking;
use EK\Restaurant;
use EK\Reviews;
use EK\Rooms;
use EK\Settings;
use EK\View;

$GLOBALS['ek_fail'] = 0;
function ek8( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
add_filter( 'pre_wp_mail', '__return_true' );
global $wpdb;
$x     = $wpdb->prefix;
$stamp = 't' . wp_rand( 10000, 99999 );
$kat   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$dau   = get_term_by( 'name', 'Daura', 'ek_lga' );
$saved = Settings::all();
Settings::update( array( 'min_reviews_for_rank' => 3, 'rank_prior_reviews' => 10, 'rank_half_life_months' => 12, 'rank_weight_rating' => 70, 'rank_weight_bookings' => 15, 'rank_weight_response' => 15, 'rank_top_percent' => 10, 'rank_rising_points' => 5 ) );

// Remove tour operators left by an earlier, interrupted run.
foreach ( get_posts( array( 'post_type' => Post_Types::BUSINESS, 'post_status' => 'any', 'posts_per_page' => -1, 's' => 'SAMPLE Rank Tours', 'fields' => 'ids' ) ) as $old ) {
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_reviews WHERE business_id = %d", $old ) );
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_bookings WHERE business_id = %d", $old ) );
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_rankings WHERE business_id = %d", $old ) );
	wp_delete_post( $old, true );
}

$owner = wp_insert_user( array( 'user_login' => "ek8_{$stamp}", 'user_email' => "ek8_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
$made  = array();
function ek8_biz( $name, $type, $lga, $lat, $lng, $owner ) {
	global $made;
	$id = Business::create( array( 'name' => $name, 'type' => $type, 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => $lat, 'lng' => $lng, 'phone' => '+2348030000000', 'whatsapp' => '+2348030000001', 'email' => 't@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test business. ', 5 ) ), $owner );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	$made[] = $id;
	return $id;
}
/** Verified reviews need completed bookings: add both directly. */
function ek8_reviews( $biz, array $ratings, $days_ago = 0, $replied = false ) {
	global $wpdb;
	$at = gmdate( 'Y-m-d H:i:s', time() - $days_ago * DAY_IN_SECONDS );
	foreach ( $ratings as $r ) {
		$wpdb->insert( $wpdb->prefix . 'ek_bookings', array( 'code' => 'T' . strtoupper( wp_generate_password( 9, false ) ), 'kind' => 'tour', 'business_id' => $biz, 'status' => 'completed', 'start_date' => gmdate( 'Y-m-d', strtotime( $at ) ), 'created_at' => $at, 'updated_at' => $at ) );
		$wpdb->insert( $wpdb->prefix . 'ek_reviews', array( 'business_id' => $biz, 'booking_id' => $wpdb->insert_id, 'author_name' => 'SAMPLE', 'rating_overall' => $r, 'title' => '', 'body' => 'SAMPLE review text for ranking checks.', 'status' => 'published', 'owner_reply' => $replied ? 'Thanks!' : null, 'created_at' => $at ) );
	}
}
function ek8_row( $id ) {
	return Ranking::current( $id );
}
$base = 12.90 + wp_rand( 0, 500 ) / 10000;

/* ---------- Ranking maths ---------- */
WP_CLI::line( 'Weighted rating (Bayesian average): many good reviews beat a few perfect ones' );
$t1 = ek8_biz( "SAMPLE Rank Tours One {$stamp}", 'tour-operator', $kat, $base, 7.60, $owner );        // 1 × 5★.
$t2 = ek8_biz( "SAMPLE Rank Tours Fifty {$stamp}", 'tour-operator', $dau, 13.03, 8.32, $owner );       // 50 reviews averaging 4.6★.
$t3 = ek8_biz( "SAMPLE Rank Tours Three {$stamp}", 'tour-operator', $kat, $base + 0.01, 7.61, $owner ); // 3 × 5★.
$t4 = ek8_biz( "SAMPLE Rank Tours Low {$stamp}", 'tour-operator', $kat, $base + 0.02, 7.62, $owner );   // 20 × 3★.
ek8_reviews( $t1, array( 5 ) );
ek8_reviews( $t2, array_merge( array_fill( 0, 30, 5 ), array_fill( 0, 20, 4 ) ) );
ek8_reviews( $t3, array( 5, 5, 5 ) );
ek8_reviews( $t4, array_fill( 0, 20, 3 ) );
$n = Ranking::run();
ek8( 4 === ( $n['tour-operator'] ?? 0 ), 'All 4 tour operators scored' );
$r1 = ek8_row( $t1 );
$r2 = ek8_row( $t2 );
$r3 = ek8_row( $t3 );
$r4 = ek8_row( $t4 );
$c  = ( 5 + 230 + 15 + 60 ) / 74; // Average rating across the type ≈ 4.19.
ek8( abs( (float) $r2->weighted_rating - ( 230 + 10 * $c ) / 60 ) < 0.001, sprintf( 'Fifty 4.6★ reviews → fair average %.2f★ (50×4.6 + 10×%.2f) ÷ 60', $r2->weighted_rating, $c ) );
ek8( abs( (float) $r3->weighted_rating - ( 15 + 10 * $c ) / 13 ) < 0.001, sprintf( 'Three 5★ reviews → fair average %.2f★', $r3->weighted_rating ) );
ek8( 1 === (int) $r2->rank_state && 2 === (int) $r3->rank_state && 3 === (int) $r4->rank_state, 'Order: fifty 4.6★ (#1), three 5★ (#2), twenty 3★ (#3)' );
ek8( null === $r1->rank_state && 3 === (int) $r1->total_state, 'One review is not enough for a rank number ("New, not yet ranked")' );
ek8( 1 === (int) $r2->rank_lga && 1 === (int) $r2->total_lga && 1 === (int) $r3->rank_lga && 2 === (int) $r4->rank_lga && 2 === (int) $r4->total_lga, 'Separate ranks per LGA (Daura #1 of 1; Katsina #1 and #2 of 2)' );
ek8( in_array( 'top', Ranking::badges( $r2 ), true ) && ! in_array( 'top', Ranking::badges( $r3 ), true ), 'Top Rated badge: only the top 10% (here, the #1)' );
ek8( '#1 of 3 tour operators in Katsina' === Ranking::label( $r2, 'tour-operator' ) && '#1 tour operator in Daura' === Ranking::label( $r2, 'tour-operator', 'lga', 'Daura' ), 'Labels: "#1 of 3 tour operators in Katsina", "#1 tour operator in Daura"' );
ek8( array( $t2, $t3, $t4 ) === array_map( 'intval', wp_list_pluck( Ranking::top( 'tour-operator' ), 'business_id' ) ) && array( $t3, $t4 ) === array_map( 'intval', wp_list_pluck( Ranking::top( 'tour-operator', $kat->term_id ), 'business_id' ) ), 'Top 10 lists: statewide and per LGA' );

WP_CLI::line( 'Recent reviews count more' );
$t6 = ek8_biz( "SAMPLE Rank Tours Improved {$stamp}", 'tour-operator', $kat, $base + 0.03, 7.63, $owner );
$t7 = ek8_biz( "SAMPLE Rank Tours Declined {$stamp}", 'tour-operator', $kat, $base + 0.04, 7.64, $owner );
ek8_reviews( $t6, array( 2, 2, 2 ), 730 );
ek8_reviews( $t6, array( 5, 5, 5 ) );
ek8_reviews( $t7, array( 5, 5, 5 ), 730 );
ek8_reviews( $t7, array( 2, 2, 2 ) );
Ranking::run();
ek8( (float) ek8_row( $t6 )->weighted_rating > (float) ek8_row( $t7 )->weighted_rating + 0.3, 'Same reviews, but the place whose good reviews are recent ranks higher' );

WP_CLI::line( 'Completed bookings and response rate' );
$t8  = ek8_biz( "SAMPLE Rank Tours Replies {$stamp}", 'tour-operator', $kat, $base + 0.05, 7.65, $owner );
$t9  = ek8_biz( "SAMPLE Rank Tours Silent {$stamp}", 'tour-operator', $kat, $base + 0.06, 7.66, $owner );
$t10 = ek8_biz( "SAMPLE Rank Tours Busy {$stamp}", 'tour-operator', $kat, $base + 0.07, 7.67, $owner );
$t12 = ek8_biz( "SAMPLE Rank Tours Slow {$stamp}", 'tour-operator', $kat, $base + 0.08, 7.68, $owner );
ek8_reviews( $t8, array( 4, 4, 4 ), 0, true );
ek8_reviews( $t9, array( 4, 4, 4 ) );
ek8_reviews( $t10, array( 4, 4, 4 ) );
ek8_reviews( $t12, array( 4, 4, 4 ), 0, true );
for ( $i = 0; $i < 20; $i++ ) {
	$wpdb->insert( $x . 'ek_bookings', array( 'code' => 'B' . strtoupper( wp_generate_password( 9, false ) ), 'kind' => 'tour', 'business_id' => $t10, 'status' => 'completed', 'start_date' => gmdate( 'Y-m-d', time() - 20 * DAY_IN_SECONDS ), 'created_at' => gmdate( 'Y-m-d H:i:s', time() - 30 * DAY_IN_SECONDS ), 'updated_at' => current_time( 'mysql', true ) ) );
}
$wpdb->insert( $x . 'ek_bookings', array( 'code' => 'N' . strtoupper( wp_generate_password( 9, false ) ), 'kind' => 'hotel', 'business_id' => $t12, 'status' => 'new', 'start_date' => gmdate( 'Y-m-d', time() + 9 * DAY_IN_SECONDS ), 'created_at' => gmdate( 'Y-m-d H:i:s', time() - 3 * DAY_IN_SECONDS ), 'updated_at' => current_time( 'mysql', true ) ) );
Ranking::run();
ek8( 1.0 === (float) ek8_row( $t8 )->response_part && 0.0 === (float) ek8_row( $t9 )->response_part && (float) ek8_row( $t8 )->score > (float) ek8_row( $t9 )->score, 'Replying to reviews raises the score' );
ek8( 0.5 === (float) ek8_row( $t12 )->response_part, 'A booking left unanswered for 3 days lowers the response rate (100% replies + 0% bookings = 50%)' );
ek8( 23 === (int) ek8_row( $t10 )->completed_bookings && (float) ek8_row( $t10 )->score > (float) ek8_row( $t9 )->score, 'More completed bookings raise the score' );
$b20 = (float) ek8_row( $t10 )->bookings_part;
ek8( abs( $b20 - log( 24 ) / log( 51 ) ) < 0.001, sprintf( 'Bookings use a sliding scale: 23 bookings = %d%% of the bookings part', round( $b20 * 100 ) ) );

WP_CLI::line( 'Paid plans never change the rank number' );
$before = ek8_row( $t4 );
update_post_meta( $t4, '_ek_featured_until', time() + 30 * DAY_IN_SECONDS );
Ranking::run();
$after = ek8_row( $t4 );
ek8( (float) $before->score === (float) $after->score && (int) $before->rank_state === (int) $after->rank_state, 'Featured: same score and same rank number' );
ek8( 1 === (int) $wpdb->get_var( $wpdb->prepare( "SELECT featured FROM {$x}ek_map_index WHERE object_id = %d", $t4 ) ), 'Featured shows separately (highlighted pin on the map)' );

WP_CLI::line( 'Rising and Verified badges' );
$wpdb->replace( $x . 'ek_rankings', array( 'business_id' => $t7, 'day' => gmdate( 'Y-m-d', time() - 100 * DAY_IN_SECONDS ), 'business_type' => 'tour-operator', 'score' => (float) ek8_row( $t7 )->score - 10 ) );
update_post_meta( $t3, '_ek_verified', 1 );
Ranking::run();
ek8( in_array( 'rising', Ranking::badges( ek8_row( $t7 ) ), true ), 'Rising: score up 10 points in 90 days' );
ek8( in_array( 'verified', Ranking::badges( ek8_row( $t3 ) ), true ) && ! in_array( 'verified', Ranking::badges( ek8_row( $t9 ) ), true ), 'Verified badge follows the admin’s Verified decision' );

WP_CLI::line( 'Hiding fake or abusive reviews' );
$rid = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$x}ek_reviews WHERE business_id = %d LIMIT 1", $t3 ) );
ek8( 'reason' === Reviews::hide( $rid, '', 1 )->get_error_code(), 'A reason is required' );
ek8( true === Reviews::hide( $rid, 'Fake or written by the business/competitor', 1 ), 'Admin hides a review' );
ek8( (bool) $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM {$x}ek_log WHERE action = 'review_hidden' AND object_id = %d AND reason LIKE %s", $t3, '%Fake%' ) ), 'Moderation log records what was hidden and why' );
ek8( 2 === Reviews::stats( $t3 )['count'], 'Hidden reviews stop counting in ratings' );
Ranking::run();
ek8( null === ek8_row( $t3 )->rank_state, 'With only 2 verified reviews left, the place loses its rank number' );
Reviews::restore( $rid, 1 );
Ranking::run();
ek8( null !== ek8_row( $t3 )->rank_state, 'Shown again: rank number comes back' );

/* ---------- Map index ---------- */
WP_CLI::line( 'Map index and data endpoint' );
$lat0  = 12.70 + wp_rand( 0, 2000 ) / 100000;
$lng0  = 7.30 + wp_rand( 0, 2000 ) / 100000;
$hotel = ek8_biz( "SAMPLE Map Hotel {$stamp}", 'hotel', $kat, $lat0, $lng0, $owner );
Hotel::save( $hotel, array( 'stars' => 3, 'amenities' => array( 'wifi', 'parking' ), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
$room = Rooms::save( $hotel, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2500000, 'weekend_price' => 0, 'units' => 2, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );
$rest  = ek8_biz( "SAMPLE Map Kitchen {$stamp}", 'restaurant', $kat, $lat0 + 0.004, $lng0, $owner ); // ~440 m north.
Restaurant::save( $rest, array_merge( Restaurant::settings( $rest ), array( 'cuisines' => array( 'hausa' ), 'price_level' => 3 ) ) );
$attr = wp_insert_post( array( 'post_type' => Attractions::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Attraction {$stamp}", 'post_content' => 'SAMPLE placeholder attraction for tests.' ) );
update_post_meta( $attr, '_ek_lat', $lat0 + 0.02 ); // ~2.2 km north.
update_post_meta( $attr, '_ek_lng', $lng0 );
update_post_meta( $attr, '_ek_entry_fee', 'Free' );
update_post_meta( $attr, '_ek_unverified', 1 );
wp_set_object_terms( $attr, array( $kat->term_id ), Post_Types::TAX_LGA );
$draft = Business::create( array( 'name' => "SAMPLE Map Draft {$stamp}", 'type' => 'hotel', 'lga_id' => $kat->term_id, 'address' => 'Test', 'lat' => $lat0 + 0.001, 'lng' => $lng0, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'd@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test. ', 5 ) ), $owner );
$made[] = $draft;
Map_Index::flush();
$api = static function ( array $q ) {
	$req = new WP_REST_Request( 'GET', '/ek/v1/map' );
	foreach ( $q as $k => $v ) {
		$req->set_param( $k, $v );
	}
	return rest_do_request( $req );
};
$bbox  = implode( ',', array( $lat0 - 0.01, $lng0 - 0.01, $lat0 + 0.03, $lng0 + 0.01 ) );
$ids   = static fn( $resp ) => array_map( static fn( $p ) => $p['id'], $resp->get_data()['pins'] );
$res   = $api( array( 'bbox' => $bbox ) );
$found = $ids( $res );
ek8( in_array( $hotel, $found, true ) && in_array( $rest, $found, true ) && in_array( $attr, $found, true ), 'Visible area returns the hotel, restaurant and attraction' );
ek8( ! in_array( $draft, $found, true ), 'Businesses not yet approved are not on the map' );
ek8( ! in_array( $t2, $found, true ), 'Places outside the visible area are not sent (fast on mobile data)' );
$pins = array_column( $res->get_data()['pins'], null, 'id' );
ek8( 'From ₦25,000 / night' === $pins[ $hotel ]['price'] && 0 === strpos( $pins[ $rest ]['price'], '₦₦₦' ) && 'Entry: Free' === $pins[ $attr ]['price'], 'Cards show price: from ₦X/night, price range, entry fee' );
ek8( $pins[ $hotel ]['book'] && false !== strpos( $pins[ $hotel ]['book']['url'], '#rooms' ) && 'Reserve' === $pins[ $rest ]['book']['label'] && null === $pins[ $attr ]['book'], 'Book / Reserve buttons go to the right place' );
ek8( 0 === strpos( $pins[ $hotel ]['whatsapp'], 'https://wa.me/234' ) && false !== strpos( $pins[ $hotel ]['directions'], 'google.com/maps/dir' ) && false !== strpos( $pins[ $hotel ]['appleMaps'], 'maps.apple.com' ), 'WhatsApp and directions (Google Maps / Apple Maps) links' );
ek8( array( $hotel ) === array_values( array_intersect( $ids( $api( array( 'bbox' => $bbox, 'types' => 'hotel' ) ) ), array( $hotel, $rest, $attr ) ) ), 'Type switch: hotels only' );
ek8( array() === $ids( $api( array( 'bbox' => $bbox, 'types' => '' ) ) ), 'All types switched off: nothing' );
ek8( array( $hotel ) === array_values( array_intersect( $ids( $api( array( 'bbox' => $bbox, 'price' => '2' ) ) ), array( $hotel, $rest, $attr ) ) ), 'Price ₦₦: the ₦25,000 hotel only' );
ek8( array( $hotel ) === array_values( array_intersect( $ids( $api( array( 'bbox' => $bbox, 'amenity' => 'wifi' ) ) ), array( $hotel, $rest, $attr ) ) ), 'Must have WiFi: the hotel only' );
ek8( ! array_intersect( $ids( $api( array( 'bbox' => $bbox, 'min_rating' => 4 ) ) ), array( $hotel, $rest ) ), 'Minimum rating hides places without reviews' );
ek8( ! in_array( $attr, $ids( $api( array( 'bbox' => $bbox, 'open' => 1 ) ) ), true ) && in_array( $hotel, $ids( $api( array( 'bbox' => $bbox, 'open' => 1 ) ) ), true ), 'Open now: open businesses only' );
ek8( ! array_intersect( $ids( $api( array( 'bbox' => $bbox, 'lga' => $dau->term_id ) ) ), array( $hotel, $rest, $attr ) ), 'LGA filter' );
$near = $api( array( 'bbox' => $bbox, 'lat' => $lat0, 'lng' => $lng0, 'radius' => 1 ) );
$npins = array_column( $near->get_data()['pins'], null, 'id' );
ek8( isset( $npins[ $hotel ], $npins[ $rest ] ) && ! isset( $npins[ $attr ] ), 'Within 1 km of the visitor: hotel and restaurant, not the attraction 2 km away' );
ek8( isset( $npins[ $rest ] ) && abs( $npins[ $rest ]['distance'] - 445 ) < 15, sprintf( 'Distance worked out: %d m to the restaurant', $npins[ $rest ]['distance'] ?? -1 ) );
ek8( 'no-store' === ( $near->get_headers()['Cache-Control'] ?? '' ) && 'public, max-age=60' === ( $res->get_headers()['Cache-Control'] ?? '' ), 'Requests with a location are never cached' );
ek8( 0 === (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$x}ek_log WHERE action LIKE '%location%'" ), 'Visitor locations are not stored' );
Rooms::save( $hotel, $room, array( 'name' => 'Standard', 'description' => '', 'price' => 1800000, 'weekend_price' => 0, 'units' => 2, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );
Map_Index::flush();
ek8( 1800000 === (int) $wpdb->get_var( $wpdb->prepare( "SELECT price_from FROM {$x}ek_map_index WHERE object_id = %d", $hotel ) ), 'Changing a room price updates the map straight away' );
wp_update_post( array( 'ID' => $rest, 'post_status' => Post_Types::STATUS_PAUSED ) );
Map_Index::flush();
ek8( ! in_array( $rest, $ids( $api( array( 'bbox' => $bbox ) ) ), true ), 'Paused businesses disappear from the map' );
wp_update_post( array( 'ID' => $rest, 'post_status' => 'publish' ) );
Map_Index::flush();

WP_CLI::line( 'Nearby, attractions, favourites' );
$nb = Map_Index::near( $lat0, $lng0, 5, 12, $hotel );
ek8( $nb && $rest === $nb[0]['id'] && in_array( $attr, wp_list_pluck( $nb, 'id' ), true ) && ! in_array( $hotel, wp_list_pluck( $nb, 'id' ), true ), 'Nearby on the hotel page: closest first, includes the attraction, not itself' );
$html = View::render( 'public/attraction', array( 'id' => $attr, 'a' => Attractions::data( $attr ) ) );
ek8( false !== strpos( $html, 'not yet been checked' ) && false !== strpos( $html, 'Free' ) && false !== strpos( $html, 'focus=' . $attr ), 'Attraction page: details, "not verified" notice, link to its pin on the Katsina Map' );
$cust = wp_insert_user( array( 'user_login' => "ek8c_{$stamp}", 'user_email' => "ek8c_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => 'subscriber' ) );
ek8( true === Favourites::toggle( $cust, $attr ), 'Attractions can be saved to Favourites' );
ek8( (bool) term_exists( 'historic', Attractions::TAX ), 'Attraction categories created' );

WP_CLI::line( 'Pages' );
foreach ( array( 'map', 'top_hotels', 'top_restaurants', 'top_event_centres' ) as $k ) {
	ek8( (bool) Install::page_id( $k ), "Page exists: {$k}" );
}
ek8( (bool) wp_next_scheduled( Ranking::HOOK ), 'Rankings scheduled every night' );

/* ---------- Clean up ---------- */
foreach ( $made as $id ) {
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_reviews WHERE business_id = %d", $id ) );
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_bookings WHERE business_id = %d", $id ) );
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_rankings WHERE business_id = %d", $id ) );
	$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_map_index WHERE object_id = %d", $id ) );
	foreach ( get_children( array( 'post_parent' => $id, 'fields' => 'ids' ) ) as $child ) {
		wp_delete_post( $child, true );
	}
	wp_delete_post( $id, true );
}
$wpdb->delete( $x . 'ek_favourites', array( 'user_id' => $cust ) );
wp_delete_post( $attr, true );
wp_delete_user( $cust );
wp_delete_user( $owner );
update_option( Settings::OPTION, $saved );
Map_Index::flush();
WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 8 checks passed.' );
