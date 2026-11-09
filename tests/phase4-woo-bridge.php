<?php
/**
 * WooCommerce payment bridge checks (needs WooCommerce active).
 * Uses WooCommerce's built-in offline "cheque" method as a stand-in for Paystack/Flutterwave,
 * so the booking ↔ order link can be tested without payment keys.
 * Run: wp eval-file ek-tests/phase4-woo-bridge.php
 */

use EK\Availability;
use EK\Booking;
use EK\Business;
use EK\Hotel;
use EK\Install;
use EK\Payments;
use EK\Restaurant;
use EK\Rooms;

$GLOBALS['ek_fail'] = 0;
function ekw( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
add_filter( 'pre_wp_mail', '__return_true' );
if ( ! class_exists( 'WooCommerce' ) ) {
	WP_CLI::error( 'WooCommerce is not active.' );
}
global $wpdb;
$stamp = 'w' . wp_rand( 10000, 99999 );
$prev  = get_option( 'woocommerce_cheque_settings' );
update_option( 'woocommerce_cheque_settings', array( 'enabled' => 'yes', 'title' => 'TEST offline payment', 'description' => '', 'instructions' => '' ) );
WC()->payment_gateways()->init();

WP_CLI::line( 'Set-up' );
ekw( 'woocommerce' === Payments::provider(), 'With WooCommerce active, payments go through WooCommerce (the local test screen is off)' );
ekw( Payments::online_available(), 'An enabled payment method makes online payment available' );

$uid = wp_insert_user( array( 'user_login' => "ekw_{$stamp}", 'user_email' => "ekw_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
$lga = get_term_by( 'name', 'Katsina', 'ek_lga' );
$h   = Business::create( array( 'name' => "SAMPLE Woo Hotel {$stamp}", 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.99, 'lng' => 7.60, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'h@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test. ', 10 ) ), $uid );
wp_update_post( array( 'ID' => $h, 'post_status' => 'publish' ) );
Hotel::save( $h, array( 'stars' => 0, 'amenities' => array(), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
$room = Rooms::save( $h, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2000000, 'weekend_price' => 0, 'units' => 1, 'max_guests' => 2, 'bed' => 'double', 'size' => 0, 'amenities' => array(), 'active' => true ) );
$tz  = Availability::tz();
$d   = static fn( $n ) => ( new DateTimeImmutable( 'monday next week', $tz ) )->modify( '+' . ( 35 + $n ) . ' days' )->format( 'Y-m-d' );
$mk  = static fn( $in, $out, $pay ) => Booking::create_hotel( array( 'room_id' => $room, 'checkin' => $in, 'checkout' => $out, 'guests' => 2, 'rooms' => 1, 'payment' => $pay, 'name' => 'SAMPLE Guest', 'email' => 'guest@example.test', 'phone' => '08030000009' ) );

WP_CLI::line( 'Booking → WooCommerce order' );
$b   = $mk( $d( 0 ), $d( 2 ), 'full' );
$url = Payments::start( $b );
$b   = Booking::get( $b->id );
ekw( is_string( $url ) && false !== strpos( $url, 'order-pay' ), 'Guest is sent to the WooCommerce payment page' );
$order = wc_get_order( $b->order_id );
ekw( $order && (int) $order->get_meta( '_ek_booking_id' ) === (int) $b->id, 'A WooCommerce order is linked to the booking' );
ekw( 'NGN' === $order->get_currency() && 40000.0 === (float) $order->get_total(), 'Order is in Naira for the full ₦40,000' );
ekw( 'guest@example.test' === $order->get_billing_email() && 'pending' === $order->get_status(), 'Order carries the guest’s email and waits for payment' );
ekw( $url === Payments::start( Booking::get( $b->id ) ), 'Clicking "Pay" again reuses the same order (no duplicates)' );

WP_CLI::line( 'Payment confirmed by the gateway' );
$order->payment_complete( 'TEST-TXN-' . $stamp );
$b = Booking::get( $b->id );
ekw( 'new' === $b->status && 4000000 === (int) $b->paid_kobo, 'Booking becomes "new" with ₦40,000 paid' );
ekw( 'completed' === wc_get_order( $b->order_id )->get_status(), 'The booking’s order is marked completed (nothing to ship)' );
$ledger = $wpdb->get_results( $wpdb->prepare( "SELECT entry_type, amount_kobo FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d", $b->id ) );
ekw( 2 === count( $ledger ) && -400000 === (int) $ledger[1]->amount_kobo, 'Ledger: earning ₦40,000 and 10% commission −₦4,000' );
wc_get_order( $b->order_id )->update_status( 'processing' );
wc_get_order( $b->order_id )->update_status( 'completed' );
ekw( 4000000 === (int) Booking::get( $b->id )->paid_kobo && 2 === count( $wpdb->get_results( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d", $b->id ) ) ), 'Repeated status changes don’t count the payment twice' );
ekw( Booking::link( $b ) === wc_get_order( $b->order_id )->get_checkout_order_received_url(), 'After paying, the guest lands on the Explore Katsina booking page' );

WP_CLI::line( 'Payment failed' );
$f = $mk( $d( 5 ), $d( 6 ), 'deposit' );
Payments::start( $f );
$f = Booking::get( $f->id );
ekw( 6000.0 === (float) wc_get_order( $f->order_id )->get_total(), 'Deposit order is 30% of one ₦20,000 night (₦6,000)' );
wc_get_order( $f->order_id )->update_status( 'failed' );
ekw( 'cancelled' === Booking::get( $f->id )->status, 'Failed payment cancels the booking' );
ekw( is_object( $mk( $d( 5 ), $d( 6 ), 'venue' ) ), 'and frees the room for someone else' );

WP_CLI::line( 'Restaurant deposit through WooCommerce' );
$r = Business::create( array( 'name' => "SAMPLE Woo Restaurant {$stamp}", 'type' => 'restaurant', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.99, 'lng' => 7.60, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'r@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test. ', 10 ) ), $uid );
wp_update_post( array( 'ID' => $r, 'post_status' => 'publish' ) );
Restaurant::save( $r, array_merge( Restaurant::settings( $r ), array( 'cuisines' => array( 'hausa' ), 'min_notice_hours' => 0, 'deposit_enabled' => 1, 'deposit_min_party' => 4, 'deposit_per_guest' => 100000 ) ) );
$res = Booking::create_reservation( array( 'business_id' => $r, 'date' => $d( 1 ), 'time' => '19:00', 'party' => 5, 'name' => 'SAMPLE Guest', 'email' => 'g@example.test', 'phone' => '08030000009' ) );
Payments::start( $res );
$res = Booking::get( $res->id );
$ro  = wc_get_order( $res->order_id );
ekw( $ro && 5000.0 === (float) $ro->get_total(), 'Party of 5 → ₦5,000 deposit order' );
$ro->payment_complete( 'TEST-R-' . $stamp );
ekw( 'new' === Booking::get( $res->id )->status, 'Deposit paid → reservation "new"' );

// Clean up.
foreach ( $wpdb->get_col( $wpdb->prepare( "SELECT order_id FROM {$wpdb->prefix}ek_bookings WHERE business_id IN (%d,%d) AND order_id > 0", $h, $r ) ) as $oid ) {
	$o = wc_get_order( $oid );
	if ( $o ) {
		$o->delete( true );
	}
}
foreach ( array( $h, $r ) as $bid ) {
	$wpdb->delete( $wpdb->prefix . 'ek_bookings', array( 'business_id' => $bid ) );
	$wpdb->delete( $wpdb->prefix . 'ek_ledger', array( 'business_id' => $bid ) );
	$wpdb->delete( $wpdb->prefix . 'ek_slots', array( 'business_id' => $bid ) );
	wp_delete_post( $bid, true );
}
$wpdb->delete( $wpdb->prefix . 'ek_nights', array( 'item_id' => $room ) );
wp_delete_post( $room, true );
require_once ABSPATH . 'wp-admin/includes/user.php';
wp_delete_user( $uid );
if ( $prev ) {
	update_option( 'woocommerce_cheque_settings', $prev );
} else {
	delete_option( 'woocommerce_cheque_settings' );
}

WP_CLI::line( $GLOBALS['ek_fail'] ? "\n{$GLOBALS['ek_fail']} check(s) FAILED" : "\nAll WooCommerce bridge checks passed" );
if ( $GLOBALS['ek_fail'] ) {
	exit( 1 );
}
