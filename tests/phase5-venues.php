<?php
/**
 * Phase 5 checks: halls, prices, request-to-book & instant flows, deadlines, money, security, search.
 * Run: wp eval-file ek-tests/phase5-venues.php
 */

use EK\Availability;
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Halls;
use EK\Install;
use EK\Venue;
use EK\Venue_Search;

$GLOBALS['ek_fail'] = 0;
function ek5( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
class EK5_Die extends Exception {}
add_filter( 'wp_die_handler', function () { return function ( $m ) { throw new EK5_Die( is_string( $m ) ? $m : 'died' ); }; } );
add_filter( 'pre_wp_mail', '__return_true' );

global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Funtua', 'ek_lga' );
$tz    = Availability::tz();
$mon   = ( new DateTimeImmutable( 'monday next week', $tz ) )->modify( '+14 days' );
$d     = static fn( $n ) => $mon->modify( "+{$n} days" )->format( 'Y-m-d' ); // d(4)=Fri, d(5)=Sat.

function ek5_venue( $stamp, $n, $lga, $lat, $lng, $mode ) {
	$uid = wp_insert_user( array( 'user_login' => "ek5_{$stamp}_{$n}", 'user_email' => "ek5_{$stamp}_{$n}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
	$id  = Business::create( array( 'name' => "SAMPLE Venue {$n} {$stamp}", 'type' => 'event-centre', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => $lat, 'lng' => $lng, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'v@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test venue. ', 5 ) ), $uid );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	Venue::save( $id, array_merge( Venue::defaults(), array( 'booking_mode' => $mode, 'deposit_pct' => 30, 'amenities' => 1 === $n ? array( 'parking', 'power', 'ac', 'sound' ) : array( 'parking' ) ) ) );
	return array( $uid, $id );
}
function ek5_hall( $venue, $name, $price, $seated, $standing, $pricing = 'day', $weekend = 0 ) {
	return Halls::save( $venue, 0, array( 'name' => $name, 'description' => '', 'price' => $price, 'weekend_price' => $weekend, 'pricing' => $pricing, 'capacity_seated' => $seated, 'capacity_standing' => $standing, 'setting' => 'indoor', 'active' => true ) );
}
function ek5_book( $hall, $start, $guests = 200, $end = '', $layout = 'seated' ) {
	return Booking::create_event( array( 'hall_id' => $hall, 'start' => $start, 'end' => $end, 'guests' => $guests, 'layout' => $layout, 'event_type' => 'wedding', 'name' => 'SAMPLE Host', 'email' => 'host@example.test', 'phone' => '08030000009' ) );
}

list( $o1, $v1 ) = ek5_venue( $stamp, 1, $lga, 11.5230, 7.3130, 'request' );
list( $o2, $v2 ) = ek5_venue( $stamp, 2, $lga, 11.5300, 7.3200, 'instant' );
$main   = ek5_hall( $v1, 'Main Hall', 50000000, 500, 800, 'day', 70000000 ); // ₦500,000/day, ₦700,000 Fri/Sat.
$garden = ek5_hall( $v1, 'Garden', 20000000, 150, 300, 'event' );            // ₦200,000 per event.
$small  = ek5_hall( $v2, 'Hall A', 15000000, 100, 150 );                     // ₦150,000/day.

WP_CLI::line( 'Halls and prices' );
list( , $e ) = Halls::validate( array( 'hall_name' => 'X', 'price' => '100' ) );
ek5( isset( $e['hall_name'], $e['price'], $e['capacity_seated'], $e['setting'] ), 'Empty hall form: name, price, capacity and indoor/outdoor required' );
$h = Halls::data( $main );
ek5( 500 === $h['capacity_seated'] && 800 === $h['capacity_standing'] && 1 === $h['units'], 'Main Hall: 500 seated, 800 standing, one bookable unit per day' );
ek5( 50000000 === Venue::quote( $h, $d( 1 ), $d( 1 ) )['total'], 'Tuesday: ₦500,000' );
ek5( 70000000 === Venue::quote( $h, $d( 5 ), $d( 5 ) )['total'], 'Saturday: weekend price ₦700,000' );
ek5( 50000000 + 70000000 + 70000000 === Venue::quote( $h, $d( 3 ), $d( 5 ) )['total'], 'Thu–Sat (3 days): ₦500k + ₦700k + ₦700k' );
Availability::add_rule( $main, 'Sallah peak', $d( 1 ), $d( 1 ), 90000000 );
Availability::forget();
ek5( 90000000 === Venue::quote( $h, $d( 1 ), $d( 1 ) )['total'], 'Peak price rule (₦900,000) applies' );

WP_CLI::line( 'Request to book' );
$r = ek5_book( $main, $d( 2 ), 300 );
ek5( is_object( $r ) && 'requested' === $r->status && $r->hold_expires, 'Request created as "requested" with a 48-hour reply deadline' );
ek5( 15000000 === (int) $r->deposit_kobo && 1500000 === (int) $r->commission_kobo, 'Deposit 30% of ₦500,000 = ₦150,000; 10% commission on the deposit = ₦15,000' );
ek5( 'sold_out' === ek5_book( $main, $d( 2 ), 50 )->get_error_code(), 'The requested date is held: a second request for the same hall and day is refused' );
ek5( is_object( ek5_book( $garden, $d( 2 ), 100 ) ), 'A different hall on the same day is fine' );
ek5( 'capacity' === ek5_book( $main, $d( 6 ), 600 )->get_error_code(), '600 guests seated is over the 500 capacity' );
ek5( is_object( ek5_book( $main, $d( 6 ), 600, '', 'standing' ) ), '600 guests standing fits (800)' );
ek5( 'one_day' === ek5_book( $garden, $d( 8 ), 50, $d( 9 ) )->get_error_code(), 'Per-event halls are one day at a time' );
ek5( 'long' === ek5_book( $main, $d( 10 ), 50, $d( 20 ) )->get_error_code(), 'Online bookings are limited to 7 days' );

ek5( true === Booking::transition( Booking::get( $r->id ), 'confirmed', $o1 ), 'Venue accepts the request' );
$c = Booking::get( $r->id );
ek5( 'confirmed' === $c->status && strtotime( $c->hold_expires . ' UTC' ) > time() + 70 * HOUR_IN_SECONDS, 'Guest now has 72 hours to pay the deposit' );
$p = Booking::mark_paid( $r->id, 15000000, 'TEST-E1' );
ek5( 'deposit_paid' === $p->status && 15000000 === (int) $p->paid_kobo, 'Deposit paid → "deposit paid"' );
$rel = $wpdb->get_var( $wpdb->prepare( "SELECT release_at FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d LIMIT 1", $r->id ) );
$exp = ( new DateTimeImmutable( $d( 2 ) . ' 23:59:59', $tz ) )->modify( '+3 days' )->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
ek5( $rel === $exp, 'Money is released 3 days after the event date' );
ek5( is_wp_error( Booking::transition( Booking::get( $r->id ), 'completed', $o1 ) ), 'Cannot mark completed before the event date' );

WP_CLI::line( 'Deadlines' );
$late = ek5_book( $main, $d( 15 ), 100 );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $late->id ) );
Booking::expire_holds();
ek5( 'expired' === Booking::get( $late->id )->status && is_object( ek5_book( $main, $d( 15 ), 100 ) ), 'Venue didn’t reply in 48 hours → request expires and the date is free again' );
$unpaid = ek5_book( $main, $d( 16 ), 100 );
Booking::transition( $unpaid, 'confirmed', $o1 );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $unpaid->id ) );
Booking::expire_holds();
ek5( 'cancelled' === Booking::get( $unpaid->id )->status && is_object( ek5_book( $main, $d( 16 ), 100 ) ), 'Deposit not paid within 72 hours → booking cancelled, date released' );
$dec = ek5_book( $main, $d( 17 ), 100 );
Booking::transition( $dec, 'declined', $o1 );
ek5( is_object( ek5_book( $main, $d( 17 ), 100 ) ), 'Declined request frees the date' );

WP_CLI::line( 'Instant booking' );
$i = ek5_book( $small, $d( 3 ), 80 );
ek5( 'pending_payment' === $i->status && 4500000 === (int) $i->details['pay_now'], 'Instant venue: pay ₦45,000 deposit (30% of ₦150,000) straight away' );
ek5( 'sold_out' === ek5_book( $small, $d( 3 ), 50 )->get_error_code(), 'Date held during payment' );
ek5( 'deposit_paid' === Booking::mark_paid( $i->id, 4500000, 'TEST-I1' )->status, 'Payment → deposit paid (no separate confirmation step)' );

WP_CLI::line( 'Security (owner of Venue 2 vs Venue 1)' );
wp_set_current_user( $o2 );
$cases = array(
	array( 'dash_hall', $v1, array( 'hall_id' => $main, 'hall_name' => 'HACKED', 'price' => '5000', 'capacity_seated' => 1, 'setting' => 'indoor' ) ),
	array( 'dash_hall', $v2, array( 'hall_id' => $main, 'hall_name' => 'HACKED', 'price' => '5000', 'capacity_seated' => 1, 'setting' => 'indoor' ) ),
	array( 'dash_hall_delete', $v2, array( 'hall_id' => $main ) ),
	array( 'dash_venue', $v1, array( 'booking_mode' => 'instant', 'deposit_pct' => 100, 'policy' => 'strict' ) ),
	array( 'dash_calendar', $v2, array( 'room_id' => $main, 'op' => 'close', 'from' => $d( 30 ), 'to' => $d( 31 ) ) ),
	array( 'dash_booking', $v2, array( 'booking_id' => $r->id, 'to' => 'cancelled' ) ),
);
foreach ( $cases as $cs ) {
	$_SERVER['REQUEST_METHOD'] = 'POST';
	$_POST = array_merge( $cs[2], array( 'ek_action' => $cs[0], 'business_id' => $cs[1], '_ek_nonce' => wp_create_nonce( $cs[0] . '_' . $cs[1] ) ) );
	$died  = false;
	try { Dashboard::handle(); } catch ( EK5_Die $e ) { $died = true; }
	ek5( $died, "\"{$cs[0]}\" against Venue 1’s data is refused" . ( $cs[1] === $v2 ? ' (sent via own venue)' : '' ) );
}
$_POST = array();
wp_set_current_user( 0 );
ek5( 'Main Hall' === get_the_title( $main ) && 'request' === Venue::settings( $v1 )['booking_mode'] && 'deposit_paid' === Booking::get( $r->id )->status, 'Venue 1’s hall, settings and booking unchanged' );

WP_CLI::line( 'Find an event centre' );
$ids = wp_list_pluck( Venue_Search::search( Venue_Search::params( array( 'guests' => '400' ) ) )['all'], 'id' );
ek5( in_array( $v1, $ids, true ) && ! in_array( $v2, $ids, true ), '400 guests seated: only the venue with a big enough hall' );
$ids = wp_list_pluck( Venue_Search::search( Venue_Search::params( array( 'date' => $d( 3 ) ) ) )['all'], 'id' );
ek5( in_array( $v1, $ids, true ) && ! in_array( $v2, $ids, true ), 'On a date when Venue 2’s only hall is booked, only Venue 1 shows' );
$ids = wp_list_pluck( Venue_Search::search( Venue_Search::params( array( 'amenities' => array( 'sound', 'ac' ) ) ) )['all'], 'id' );
ek5( in_array( $v1, $ids, true ) && ! in_array( $v2, $ids, true ), 'Amenities filter (sound system + AC)' );
$res = array_values( array_filter( Venue_Search::search( Venue_Search::params( array( 'sort' => 'price' ) ) )['all'], static fn( $x ) => in_array( $x['id'], array( $v1, $v2 ), true ) ) );
ek5( $res[0]['id'] === $v2 && 15000000 === $res[0]['price'], 'Price sort: the ₦150,000 hall first' );
$res = array_values( array_filter( Venue_Search::search( Venue_Search::params( array( 'lat' => '11.5301', 'lng' => '7.3201' ) ) )['all'], static fn( $x ) => in_array( $x['id'], array( $v1, $v2 ), true ) ) );
ek5( 'distance' === Venue_Search::params( array( 'lat' => '11.5', 'lng' => '7.3' ) )['sort'] && $res[0]['id'] === $v2, '"Near me" sorts by distance' );

// Clean up.
foreach ( array( $v1, $v2 ) as $vid ) {
	$bids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d", $vid ) );
	if ( $bids ) {
		$wpdb->query( "DELETE FROM {$wpdb->prefix}ek_log WHERE object_type='booking' AND object_id IN (" . implode( ',', array_map( 'intval', $bids ) ) . ')' ); // phpcs:ignore
	}
	$wpdb->delete( $wpdb->prefix . 'ek_bookings', array( 'business_id' => $vid ) );
	$wpdb->delete( $wpdb->prefix . 'ek_ledger', array( 'business_id' => $vid ) );
	wp_delete_post( $vid, true );
}
foreach ( array( $main, $garden, $small ) as $hid ) {
	$wpdb->delete( $wpdb->prefix . 'ek_nights', array( 'item_id' => $hid ) );
	$wpdb->delete( $wpdb->prefix . 'ek_rate_rules', array( 'item_id' => $hid ) );
	wp_delete_post( $hid, true );
}
require_once ABSPATH . 'wp-admin/includes/user.php';
wp_delete_user( $o1 );
wp_delete_user( $o2 );

WP_CLI::line( $GLOBALS['ek_fail'] ? "\n{$GLOBALS['ek_fail']} check(s) FAILED" : "\nAll event centre checks passed" );
if ( $GLOBALS['ek_fail'] ) {
	exit( 1 );
}
