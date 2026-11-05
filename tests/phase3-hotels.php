<?php
/**
 * Phase 3 checks: prices, availability, no double booking, holds, payments, statuses, security, search.
 * Run: wp eval-file ek-tests/phase3-hotels.php
 */

use EK\Availability;
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Hotel;
use EK\Hotel_Search;
use EK\Install;
use EK\Money;
use EK\Rooms;

$GLOBALS['ek_fail'] = 0;
function ek3( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
class EK3_Die extends Exception {}
add_filter( 'wp_die_handler', function () { return function ( $m ) { throw new EK3_Die( is_string( $m ) ? $m : 'died' ); }; } );
add_filter( 'pre_wp_mail', '__return_true' ); // Don't send test emails.

global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$tz    = Availability::tz();
$mon   = ( new DateTimeImmutable( 'monday next week', $tz ) )->modify( '+7 days' ); // A Monday 1–2 weeks ahead.
$d     = static fn( $n ) => $mon->modify( "+{$n} days" )->format( 'Y-m-d' ); // d(0)=Mon … d(4)=Fri, d(5)=Sat.

function ek3_owner( $stamp, $n ) {
	return wp_insert_user( array( 'user_login' => "ek3_{$stamp}_{$n}", 'user_email' => "ek3_{$stamp}_{$n}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
}
function ek3_hotel( $owner, $lga, $name, $lat, $lng ) {
	$id = Business::create(
		array( 'name' => $name, 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => $lat, 'lng' => $lng, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'h@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test hotel. ', 5 ) ),
		$owner
	);
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	Hotel::save( $id, array( 'stars' => 3, 'amenities' => array( 'wifi', 'parking' ), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
	return $id;
}
function ek3_room( $hotel, $name, $price, $units, $weekend = 0, $guests = 2 ) {
	return Rooms::save( $hotel, 0, array( 'name' => $name, 'description' => '', 'price' => $price, 'weekend_price' => $weekend, 'units' => $units, 'max_guests' => $guests, 'bed' => 'double', 'size' => 20, 'amenities' => array( 'ac' ), 'active' => true ) );
}
function ek3_book( $room, $in, $out, $pay = 'venue', $rooms = 1, $guests = 2 ) {
	return Booking::create_hotel( array( 'room_id' => $room, 'checkin' => $in, 'checkout' => $out, 'guests' => $guests, 'rooms' => $rooms, 'payment' => $pay, 'name' => 'SAMPLE Guest', 'email' => 'guest@example.test', 'phone' => '08030000009' ) );
}

$o1    = ek3_owner( $stamp, 1 );
$o2    = ek3_owner( $stamp, 2 );
$h1    = ek3_hotel( $o1, $lga, "SAMPLE Hotel One {$stamp}", 12.9908, 7.6018 );
$h2    = ek3_hotel( $o2, $lga, "SAMPLE Hotel Two {$stamp}", 13.0500, 7.6600 );
$std   = ek3_room( $h1, 'Standard', 2000000, 1, 2500000 );   // ₦20,000, weekends ₦25,000, ONE room.
$dlx   = ek3_room( $h1, 'Deluxe', 3500000, 3 );              // ₦35,000, three rooms.
$other = ek3_room( $h2, 'Suite', 6000000, 2, 0, 4 );         // Hotel Two.

WP_CLI::line( 'Prices' );
$room = Rooms::data( $std );
$q    = Availability::quote( $room, $d( 0 ), $d( 1 ) );
ek3( 2000000 === $q['total'], 'Weekday night uses the normal price (₦20,000)' );
$q = Availability::quote( $room, $d( 4 ), $d( 6 ) );
ek3( 5000000 === $q['total'], 'Friday + Saturday nights use the weekend price (2 × ₦25,000)' );
Availability::add_rule( $std, 'Sallah peak', $d( 5 ), $d( 6 ), 4000000 );
Availability::forget();
$q = Availability::quote( $room, $d( 4 ), $d( 7 ) );
ek3( 2500000 + 4000000 + 4000000 === $q['total'], 'Seasonal price beats the weekend price (Fri ₦25k + Sat ₦40k + Sun ₦40k)' );
Availability::set_range( $std, $d( 6 ), $d( 6 ), 'price', 1500000 );
Availability::forget();
$q = Availability::quote( $room, $d( 6 ), $d( 7 ) );
ek3( 1500000 === $q['total'], 'A one-off price on a date beats everything (₦15,000)' );
ek3( 7 === count( Availability::nights( $d( 0 ), $d( 7 ) ) ), 'Mon→next Mon is 7 nights' );

WP_CLI::line( 'Availability' );
Availability::set_range( $dlx, $d( 2 ), $d( 2 ), 'block', 2 );
Availability::forget();
$dl = Rooms::data( $dlx );
ek3( 1 === Availability::quote( $dl, $d( 2 ), $d( 3 ) )['available'], '3 Deluxe rooms, 2 marked unavailable → 1 left' );
ek3( ! Availability::quote( $dl, $d( 2 ), $d( 3 ), 2 )['ok'], 'Cannot get 2 Deluxe rooms that night' );
Availability::set_range( $dlx, $d( 3 ), $d( 3 ), 'close' );
Availability::forget();
ek3( ! Availability::quote( $dl, $d( 2 ), $d( 5 ) )['ok'], 'A closed date inside the stay makes it unavailable' );
Availability::set_range( $dlx, $d( 3 ), $d( 3 ), 'open' );
Availability::forget();
ek3( Availability::quote( $dl, $d( 3 ), $d( 4 ) )['ok'], 'Re-opened date is bookable again' );

WP_CLI::line( 'No double booking' );
$b1 = ek3_book( $std, $d( 0 ), $d( 2 ) );
ek3( is_object( $b1 ) && 'new' === $b1->status, 'Pay-at-hotel booking for the only Standard room (Mon–Wed) is created as "new"' );
ek3( preg_match( '/^EK-[A-Z2-9]{6}$/', $b1->code ) === 1, "Booking code looks right ({$b1->code})" );
$b2 = ek3_book( $std, $d( 1 ), $d( 3 ) );
ek3( is_wp_error( $b2 ) && 'sold_out' === $b2->get_error_code(), 'Overlapping booking (Tue–Thu) for the same last room is refused' );
$b3 = ek3_book( $std, $d( 2 ), $d( 3 ) );
ek3( is_object( $b3 ), 'Back-to-back booking (check-in on the check-out day) is allowed' );
$booked = (int) $wpdb->get_var( $wpdb->prepare( "SELECT MAX(booked) FROM {$wpdb->prefix}ek_nights WHERE item_id = %d", $std ) );
ek3( 1 === $booked, 'Calendar never shows more than 1 of 1 room booked' );

WP_CLI::line( 'Booking rules' );
ek3( is_wp_error( ek3_book( $dlx, $d( 4 ), $d( 5 ), 'venue', 1, 3 ) ), '3 guests can’t fit in one 2-person room' );
ek3( is_object( ek3_book( $dlx, $d( 4 ), $d( 5 ), 'venue', 2, 3 ) ), '3 guests in 2 rooms is fine' );
$yesterday = ( new DateTimeImmutable( 'yesterday', $tz ) )->format( 'Y-m-d' );
ek3( is_wp_error( ek3_book( $dlx, $yesterday, $d( 0 ) ) ), 'Check-in in the past is refused' );
ek3( is_wp_error( ek3_book( $dlx, $d( 2 ), $d( 2 ) ) ), 'Check-out must be after check-in' );
update_post_meta( $h1, '_ek_pay_at_venue', 0 );
ek3( is_wp_error( ek3_book( $dlx, $d( 5 ), $d( 6 ), 'venue' ) ), 'Pay-at-hotel refused when the hotel switched it off' );
update_post_meta( $h1, '_ek_pay_at_venue', 1 );

WP_CLI::line( 'Online payment, holds and money' );
$p1 = ek3_book( $dlx, $d( 8 ), $d( 10 ), 'full' );
ek3( 'pending_payment' === $p1->status && $p1->hold_expires, 'Online booking waits for payment with a 15-minute hold' );
ek3( 7000000 === (int) $p1->total_kobo && 700000 === (int) $p1->commission_kobo, 'Total ₦70,000 and 10% commission ₦7,000 recorded' );
$paid = Booking::mark_paid( $p1->id, 7000000, 'TEST-1' );
ek3( 'new' === $paid->status && 7000000 === (int) $paid->paid_kobo, 'Payment received → booking becomes "new" for the hotel' );
Booking::mark_paid( $p1->id, 7000000, 'TEST-1' );
ek3( 7000000 === (int) Booking::get( $p1->id )->paid_kobo, 'The same payment notice twice is only counted once' );
$ledger = $wpdb->get_results( $wpdb->prepare( "SELECT entry_type, amount_kobo, status FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d ORDER BY id", $p1->id ) );
ek3( 2 === count( $ledger ) && 7000000 === (int) $ledger[0]->amount_kobo && -700000 === (int) $ledger[1]->amount_kobo && 'on_hold' === $ledger[0]->status, 'Ledger: ₦70,000 earning and −₦7,000 commission, both on hold' );

$dep = ek3_book( $dlx, $d( 11 ), $d( 12 ), 'deposit' );
ek3( 1050000 === (int) $dep->details['pay_now'] && 2450000 === (int) $dep->details['pay_later'], 'Deposit option: 30% now (₦10,500), rest at hotel (₦24,500)' );

$hold = ek3_book( $std, $d( 14 ), $d( 15 ), 'full' );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $hold->id ) );
Booking::expire_holds();
ek3( 'expired' === Booking::get( $hold->id )->status, 'Unpaid hold expires after 15 minutes' );
$after = ek3_book( $std, $d( 14 ), $d( 15 ), 'venue' );
ek3( is_object( $after ), 'The expired hold’s room can be booked by someone else' );
$late = Booking::mark_paid( $hold->id, (int) $hold->details['pay_now'], 'TEST-LATE' );
ek3( 'payment_conflict' === $late->status, 'Late payment for a room now taken → flagged for the admin, no double booking' );

$fail = ek3_book( $std, $d( 16 ), $d( 17 ), 'full' );
Booking::payment_failed( $fail->id );
ek3( 'cancelled' === Booking::get( $fail->id )->status && is_object( ek3_book( $std, $d( 16 ), $d( 17 ) ) ), 'Failed payment frees the room immediately' );

WP_CLI::line( 'Hotel actions' );
$c = Booking::get( $b1->id );
ek3( true === Booking::hotel_transition( $c, 'confirmed', $o1 ), 'Hotel confirms a new booking' );
ek3( is_wp_error( Booking::hotel_transition( Booking::get( $b1->id ), 'checked_in', $o1 ) ), 'Cannot check in before the check-in date' );
ek3( is_wp_error( Booking::hotel_transition( Booking::get( $b1->id ), 'checked_out', $o1 ) ), 'Cannot check out without checking in' );
$dec = ek3_book( $dlx, $d( 20 ), $d( 22 ), 'venue', 3 );
Booking::hotel_transition( $dec, 'declined', $o1 );
Availability::forget();
ek3( 3 === Availability::quote( Rooms::data( $dlx ), $d( 20 ), $d( 22 ) )['available'], 'Declining gives the 3 rooms back to the calendar' );
Booking::hotel_transition( Booking::get( $p1->id ), 'declined', $o1 );
$frozen = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT status FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d", $p1->id ) );
ek3( array( 'frozen' ) === $frozen, 'Declining a paid booking freezes its money for a refund decision' );

WP_CLI::line( 'Security (owner of Hotel Two vs Hotel One)' );
wp_set_current_user( $o2 );
$attempts = array(
	'dash_booking'     => array( 'booking_id' => $b3->id, 'to' => 'declined' ),
	'dash_room'        => array( 'room_id' => $std, 'room_name' => 'HACKED', 'price' => '1000', 'units' => 1, 'max_guests' => 1, 'bed' => 'single' ),
	'dash_room_delete' => array( 'room_id' => $std ),
	'dash_calendar'    => array( 'room_id' => $std, 'op' => 'close', 'from' => $d( 30 ), 'to' => $d( 31 ) ),
	'dash_hotel'       => array( 'policy' => 'flexible', 'pay_full' => 1 ),
);
foreach ( $attempts as $action => $fields ) {
	// Attack 1: send it against Hotel One directly (not my business).
	$_SERVER['REQUEST_METHOD'] = 'POST';
	$_POST = array_merge( $fields, array( 'ek_action' => $action, 'business_id' => $h1, '_ek_nonce' => wp_create_nonce( $action . '_' . $h1 ) ) );
	$died  = false;
	try { Dashboard::handle(); } catch ( EK3_Die $e ) { $died = true; }
	// Attack 2: claim it's for my own Hotel Two, but point at Hotel One's room/booking.
	$died2 = true;
	if ( 'dash_hotel' !== $action ) {
		$_POST = array_merge( $fields, array( 'ek_action' => $action, 'business_id' => $h2, '_ek_nonce' => wp_create_nonce( $action . '_' . $h2 ) ) );
		$died2 = false;
		try { Dashboard::handle(); } catch ( EK3_Die $e ) { $died2 = true; }
	}
	ek3( $died && $died2, "\"{$action}\" on Hotel One’s data is refused (both ways)" );
}
$_POST = array();
ek3( 'Standard' === get_the_title( $std ) && 'publish' === get_post_status( $std ), 'Hotel One’s room unchanged' );
ek3( 'new' === Booking::get( $b3->id )->status, 'Hotel One’s booking unchanged' );
Availability::forget();
ek3( ! Availability::month( Rooms::data( $std ), (int) substr( $d( 30 ), 0, 4 ), (int) substr( $d( 30 ), 5, 2 ) )[ $d( 30 ) ]['closed'], 'Hotel One’s calendar unchanged' );
ek3( 'moderate' === Hotel::settings( $h1 )['policy'], 'Hotel One’s settings unchanged' );
ek3( null === Booking::by_code( $b1->code, 'wrong-key' ), 'A booking page cannot be opened with a wrong key' );

WP_CLI::line( 'Search' );
$p   = Hotel_Search::params( array( 'checkin' => $d( 0 ), 'checkout' => $d( 1 ), 'guests' => '2', 'sort' => 'price' ) );
$ids = wp_list_pluck( Hotel_Search::search( $p )['all'], 'id' );
ek3( in_array( $h1, $ids, true ) && in_array( $h2, $ids, true ), 'Both hotels found for available dates' );
$res = array_values( array_filter( Hotel_Search::search( $p )['all'], static fn( $i ) => in_array( $i['id'], array( $h1, $h2 ), true ) ) );
ek3( $res[0]['id'] === $h1 && 3500000 === $res[0]['night'], 'Price sort: Hotel One first, cheapest free room is Deluxe ₦35,000 (Standard is booked)' );
$p   = Hotel_Search::params( array( 'guests' => '4' ) );
$ids = wp_list_pluck( Hotel_Search::search( $p )['all'], 'id' );
ek3( in_array( $h2, $ids, true ) && ! in_array( $h1, $ids, true ), '4 guests in 1 room: only the hotel with a 4-person suite' );
$p   = Hotel_Search::params( array( 'lat' => '13.05', 'lng' => '7.66' ) );
$all = array_values( array_filter( Hotel_Search::search( $p )['all'], static fn( $i ) => in_array( $i['id'], array( $h1, $h2 ), true ) ) );
ek3( 'distance' === $p['sort'] && $all[0]['id'] === $h2 && $all[0]['distance'] < 0.1, '"Near me" sorts by distance (Hotel Two is right here)' );
ek3( '9.2 km away' === Hotel_Search::format_distance( 9.21 ) && '350 m away' === Hotel_Search::format_distance( 0.348 ), 'Distances read like "9.2 km away" / "350 m away"' );
$p   = Hotel_Search::params( array( 'price_max' => '30000' ) );
$ids = wp_list_pluck( Hotel_Search::search( $p )['all'], 'id' );
ek3( in_array( $h1, $ids, true ) && ! in_array( $h2, $ids, true ), 'Max price ₦30,000 keeps Hotel One (₦20k room) and drops Hotel Two (₦60k)' );

// Clean up.
wp_set_current_user( 0 );
foreach ( array( $h1, $h2 ) as $h ) {
	$bids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d", $h ) );
	if ( $bids ) {
		$wpdb->query( "DELETE FROM {$wpdb->prefix}ek_log WHERE object_type='booking' AND object_id IN (" . implode( ',', array_map( 'intval', $bids ) ) . ')' ); // phpcs:ignore
	}
	$wpdb->delete( $wpdb->prefix . 'ek_bookings', array( 'business_id' => $h ) );
	$wpdb->delete( $wpdb->prefix . 'ek_ledger', array( 'business_id' => $h ) );
}
foreach ( array( $std, $dlx, $other ) as $r ) {
	$wpdb->delete( $wpdb->prefix . 'ek_nights', array( 'item_id' => $r ) );
	$wpdb->delete( $wpdb->prefix . 'ek_rate_rules', array( 'item_id' => $r ) );
	wp_delete_post( $r, true );
}
wp_delete_post( $h1, true );
wp_delete_post( $h2, true );
require_once ABSPATH . 'wp-admin/includes/user.php';
wp_delete_user( $o1 );
wp_delete_user( $o2 );

WP_CLI::line( $GLOBALS['ek_fail'] ? "\n{$GLOBALS['ek_fail']} check(s) FAILED" : "\nAll hotel checks passed" );
if ( $GLOBALS['ek_fail'] ) {
	exit( 1 );
}
