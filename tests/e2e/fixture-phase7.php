<?php
/**
 * Phase 7 browser-test helpers.
 *   wp eval-file ek-tests/e2e/fixture-phase7.php setup <hotel_id>            → room (₦25,000), moderate policy
 *   wp eval-file ek-tests/e2e/fixture-phase7.php stay <booking_code>          → checked in + checked out
 *   wp eval-file ek-tests/e2e/fixture-phase7.php venue-last-month <room_id>   → a pay-at-hotel stay last month
 */
use EK\Availability;
use EK\Booking;
use EK\Hotel;
use EK\Rooms;

$mode = $args[0] ?? '';
if ( 'setup' === $mode ) {
	$hotel = (int) $args[1];
	Hotel::save( $hotel, array( 'stars' => 3, 'amenities' => array( 'wifi' ), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
	echo wp_json_encode( array( 'room' => Rooms::save( $hotel, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2500000, 'weekend_price' => 0, 'units' => 5, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) ) ) );
} elseif ( 'stay' === $mode ) {
	$b = Booking::by_code( $args[1] );
	Booking::set_status( $b, 'checked_in', 0 );
	Booking::set_status( Booking::get( $b->id ), 'checked_out', 0 );
	echo wp_json_encode( array( 'ok' => true ) );
} elseif ( 'venue-last-month' === $mode ) {
	$tz   = Availability::tz();
	$in   = ( new DateTimeImmutable( 'today', $tz ) )->modify( '+60 days' )->format( 'Y-m-d' );
	$out  = ( new DateTimeImmutable( $in, $tz ) )->modify( '+1 day' )->format( 'Y-m-d' );
	$b    = Booking::create_hotel( array( 'room_id' => (int) $args[1], 'checkin' => $in, 'checkout' => $out, 'guests' => 2, 'rooms' => 1, 'payment' => 'venue', 'name' => 'SAMPLE Walk-in Guest', 'email' => 'walkin@example.test', 'phone' => '08030000088' ) );
	Booking::set_status( $b, 'checked_in', 0 );
	Booking::set_status( Booking::get( $b->id ), 'checked_out', 0 );
	$last = ( new DateTimeImmutable( 'first day of last month', $tz ) );
	global $wpdb;
	$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'start_date' => $last->modify( '+3 days' )->format( 'Y-m-d' ), 'end_date' => $last->modify( '+4 days' )->format( 'Y-m-d' ) ), array( 'id' => $b->id ) );
	echo wp_json_encode( array( 'code' => $b->code, 'month' => $last->format( 'Y-m' ) ) );
}
