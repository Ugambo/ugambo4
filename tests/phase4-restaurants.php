<?php
/**
 * Phase 4 checks: menus, reservation slots, deposits, holds, statuses, ordering OFF/ON, security, search.
 * Run: wp eval-file ek-tests/phase4-restaurants.php
 */

use EK\Availability;
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Install;
use EK\Menu;
use EK\Restaurant;
use EK\Restaurant_Search;
use EK\Settings;
use EK\Slots;

$GLOBALS['ek_fail'] = 0;
function ek4( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
class EK4_Die extends Exception {}
add_filter( 'wp_die_handler', function () { return function ( $m ) { throw new EK4_Die( is_string( $m ) ? $m : 'died' ); }; } );
add_filter( 'pre_wp_mail', '__return_true' );

global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Daura', 'ek_lga' );
$tz    = Availability::tz();
$mon   = ( new DateTimeImmutable( 'monday next week', $tz ) )->modify( '+7 days' )->format( 'Y-m-d' );
$sun   = ( new DateTimeImmutable( $mon, $tz ) )->modify( '+6 days' )->format( 'Y-m-d' );
$tue   = ( new DateTimeImmutable( $mon, $tz ) )->modify( '+1 day' )->format( 'Y-m-d' );
$was_ordering = Settings::get( 'food_ordering_enabled' );
Settings::update( array( 'food_ordering_enabled' => 0 ) );

function ek4_rest( $stamp, $n, $lga, $lat, $lng ) {
	$uid   = wp_insert_user( array( 'user_login' => "ek4_{$stamp}_{$n}", 'user_email' => "ek4_{$stamp}_{$n}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
	$hours = array( 'always' => 0 );
	foreach ( Business::DAYS as $d ) {
		$hours[ $d ] = array( 'closed' => 'sun' === $d ? 1 : 0, 'open' => '08:00', 'close' => '22:00' );
	}
	$id = Business::create( array( 'name' => "SAMPLE Restaurant {$n} {$stamp}", 'type' => 'restaurant', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => $lat, 'lng' => $lng, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'r@example.test', 'website' => '', 'socials' => array(), 'hours' => $hours, 'description' => str_repeat( 'Test restaurant. ', 4 ) ), $uid );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	return array( $uid, $id );
}
function ek4_reserve( $bid, $date, $time, $party, $email = 'g@example.test' ) {
	return Booking::create_reservation( array( 'business_id' => $bid, 'date' => $date, 'time' => $time, 'party' => $party, 'name' => 'SAMPLE Guest', 'email' => $email, 'phone' => '08030000009' ) );
}

list( $o1, $r1 ) = ek4_rest( $stamp, 1, $lga, 13.0350, 8.3150 );
list( $o2, $r2 ) = ek4_rest( $stamp, 2, $lga, 13.0400, 8.3200 );
$s = Restaurant::settings( $r1 );
Restaurant::save( $r1, array_merge( $s, array( 'cuisines' => array( 'hausa', 'grills' ), 'price_level' => 2, 'capacity' => 10, 'slot_minutes' => 60, 'max_party' => 8, 'min_notice_hours' => 0, 'deposit_enabled' => 1, 'deposit_min_party' => 6, 'deposit_per_guest' => 200000 ) ) );
Restaurant::save( $r2, array_merge( Restaurant::settings( $r2 ), array( 'cuisines' => array( 'continental' ), 'price_level' => 4 ) ) );

WP_CLI::line( 'Menu builder' );
$rice  = Menu::add_category( $r1, 'Rice dishes' );
$soups = Menu::add_category( $r1, 'Soups & Swallow' );
$jollof = Menu::save_item( $r1, 0, array( 'name' => 'Jollof rice & chicken', 'description' => 'SAMPLE', 'price_kobo' => 250000, 'category_id' => $rice, 'available' => 1 ) );
$fried  = Menu::save_item( $r1, 0, array( 'name' => 'Fried rice', 'description' => '', 'price_kobo' => 220000, 'category_id' => $rice, 'available' => 1 ) );
$tuwo   = Menu::save_item( $r1, 0, array( 'name' => 'Tuwo with miyan kuka', 'description' => '', 'price_kobo' => 150000, 'category_id' => $soups, 'available' => 1 ) );
$full   = Menu::full( $r1 );
ek4( 2 === count( $full ) && 2 === count( $full[0]->items ) && 'Rice dishes' === $full[0]->name, 'Two categories with dishes, in order' );
Menu::move( 'cat', $soups, $r1, 'up' );
ek4( 'Soups & Swallow' === Menu::full( $r1 )[0]->name, 'Category moved up' );
Menu::move( 'item', $fried, $r1, 'up' );
ek4( 'Fried rice' === Menu::full( $r1 )[1]->items[0]->name, 'Dish moved up within its category' );
ek4( false === Menu::toggle( $tuwo, $r1 ) && ! Menu::item( $tuwo, $r1 )->available, 'Dish marked sold out' );
ek4( is_wp_error( Menu::delete_category( $rice, $r1 ) ), 'A category with dishes can’t be deleted' );
list( , $e ) = Menu::validate_item( array( 'item_name' => 'X', 'item_price' => '', 'category_id' => $rice ), $r1 );
ek4( isset( $e['item_name'], $e['item_price'] ), 'Dish needs a name and a price' );
list( , $e ) = Menu::validate_item( array( 'item_name' => 'Hack', 'item_price' => '100', 'category_id' => $rice ), $r2 );
ek4( isset( $e['category_id'] ), 'Restaurant 2 cannot add a dish into Restaurant 1’s category' );
ek4( list( $lo, $hi ) = Menu::price_span( $r1 ), 'Price span works' );

WP_CLI::line( 'Reservation slots' );
$slots = Slots::for_day( $r1, $mon );
ek4( 14 === count( $slots ) && '08:00' === $slots[0]['time'] && '21:00' === end( $slots )['time'], '08:00–22:00 with 60-minute slots → 14 times (08:00 … 21:00)' );
ek4( array() === Slots::for_day( $r1, $sun ), 'Closed on Sunday → no times' );
Restaurant::save( $r1, array_merge( Restaurant::settings( $r1 ), array( 'closed_dates' => array( $tue ) ) ) );
ek4( array() === Slots::for_day( $r1, $tue ), 'A date marked closed for reservations → no times' );
Restaurant::save( $r1, array_merge( Restaurant::settings( $r1 ), array( 'res_from' => '18:00', 'res_to' => '22:00', 'slot_minutes' => 90 ) ) );
ek4( array( '18:00', '19:30' ) === wp_list_pluck( Slots::for_day( $r1, $mon ), 'time' ), 'Own reservation hours 18:00–22:00 with 90 minutes → 18:00 and 19:30' );
Restaurant::save( $r1, array_merge( Restaurant::settings( $r1 ), array( 'res_from' => '', 'res_to' => '', 'slot_minutes' => 60 ) ) );
$yesterday = ( new DateTimeImmutable( 'yesterday', $tz ) )->format( 'Y-m-d' );
ek4( array() === Slots::for_day( $r1, $yesterday ), 'No times in the past' );

WP_CLI::line( 'Reservations & capacity (10 seats per slot)' );
$a = ek4_reserve( $r1, $mon, '19:00', 4 );
ek4( is_object( $a ) && 'new' === $a->status && 0 === (int) $a->total_kobo, 'Party of 4 at 19:00 → "new", nothing to pay' );
$left = array_column( Slots::for_day( $r1, $mon ), 'available', 'time' );
ek4( 6 === $left['19:00'] && 10 === $left['20:00'], '6 seats left at 19:00; 20:00 untouched' );
ek4( is_wp_error( ek4_reserve( $r1, $mon, '19:00', 9 ) ), 'Party of 9 refused (largest online group is 8)' );
ek4( 'full' === ek4_reserve( $r1, $mon, '19:00', 7 )->get_error_code(), 'Party of 7 refused: only 6 seats left' );
$d = ek4_reserve( $r1, $mon, '19:00', 6 );
ek4( 'pending_payment' === $d->status && 1200000 === (int) $d->deposit_kobo, 'Party of 6 → deposit 6 × ₦2,000 = ₦12,000, waiting for payment' );
ek4( 0 === array_column( Slots::for_day( $r1, $mon ), 'available', 'time' )['19:00'], 'The deposit hold takes the last 6 seats' );
ek4( 'full' === ek4_reserve( $r1, $mon, '19:00', 1 )->get_error_code(), 'Fully booked slot refuses even 1 more' );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $d->id ) );
Booking::expire_holds();
ek4( 6 === array_column( Slots::for_day( $r1, $mon ), 'available', 'time' )['19:00'], 'Unpaid deposit hold expires → seats come back' );
$d2 = ek4_reserve( $r1, $mon, '19:00', 6 );
$p  = Booking::mark_paid( $d2->id, 1200000, 'TEST-R1' );
ek4( 'new' === $p->status && 1200000 === (int) $p->paid_kobo, 'Deposit paid → reservation "new"' );
ek4( 0 === (int) $p->commission_kobo, 'Commission on table reservations is 0%' );

WP_CLI::line( 'Restaurant actions' );
ek4( true === Booking::transition( Booking::get( $a->id ), 'confirmed', $o1 ), 'Restaurant confirms' );
ek4( is_wp_error( Booking::transition( Booking::get( $a->id ), 'seated', $o1 ) ), 'Cannot mark seated before the reservation date' );
Booking::transition( Booking::get( $a->id ), 'cancelled', $o1 );
ek4( 4 === array_column( Slots::for_day( $r1, $mon ), 'available', 'time' )['19:00'], 'Cancelling gives the 4 seats back' );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'start_date' => Availability::today(), 'end_date' => Availability::today() ), array( 'id' => $d2->id ) );
$b = Booking::get( $d2->id );
Booking::transition( $b, 'confirmed', $o1 );
ek4( true === Booking::transition( Booking::get( $d2->id ), 'seated', $o1 ) && true === Booking::transition( Booking::get( $d2->id ), 'completed', $o1 ), 'On the day: seated → completed' );
$rel = $wpdb->get_var( $wpdb->prepare( "SELECT release_at FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d LIMIT 1", $d2->id ) );
ek4( null !== $rel, 'Completed reservation starts the deposit’s 3-day release clock' );

WP_CLI::line( 'Tables mode' );
Restaurant::save( $r2, array_merge( Restaurant::settings( $r2 ), array( 'capacity_mode' => 'tables', 'capacity' => 2, 'max_party' => 10, 'min_notice_hours' => 0 ) ) );
ek4( is_object( ek4_reserve( $r2, $mon, '13:00', 8 ) ) && is_object( ek4_reserve( $r2, $mon, '13:00', 2 ) ), '2 tables: a party of 8 and a party of 2 each take one table' );
ek4( 'full' === ek4_reserve( $r2, $mon, '13:00', 2 )->get_error_code(), 'Third party at 13:00 refused (no tables left)' );

WP_CLI::line( 'Online ordering OFF (default)' );
ek4( ! Restaurant::ordering_on_sitewide() && ! Restaurant::ordering_open( $r1 ), 'Ordering is off site-wide' );
Restaurant::save( $r1, array_merge( Restaurant::settings( $r1 ), array( 'order_enabled' => 1, 'order_pickup' => 1, 'order_pay_cash' => 1 ) ) );
ek4( ! Restaurant::ordering_open( $r1 ), 'Still off even if a restaurant switches it on for itself' );
ek4( is_wp_error( Booking::create_order( array( 'business_id' => $r1, 'items' => array( $jollof => 1 ), 'fulfilment' => 'pickup', 'pay' => 'cash', 'name' => 'X Y', 'email' => 'x@example.test', 'phone' => '08030000001' ) ) ), 'Orders are refused while ordering is off' );
ek4( ! isset( Dashboard::sections( 'restaurant' )['orders'] ), 'No "Online orders" section in the dashboard' );
$GLOBALS['post'] = get_post( $r1 );
setup_postdata( $GLOBALS['post'] );
$b   = Business::profile( $r1 );
ob_start();
include EK_DIR . 'templates/public/restaurant.php';
$html = ob_get_clean();
ek4( false === strpos( $html, 'data-ek-order-form' ) && false === strpos( $html, 'name="items[' ), 'Restaurant page shows the menu with no ordering buttons' );
ek4( false !== strpos( $html, 'Jollof rice' ) && false !== strpos( $html, 'Sold out' ), 'Menu shows dishes and a "Sold out" label' );

WP_CLI::line( 'Online ordering ON (temporarily, to test the built feature)' );
Settings::update( array( 'food_ordering_enabled' => 1 ) );
$h = array( 'always' => 1 );
update_post_meta( $r1, '_ek_hours', $h ); // Open now, whatever time the test runs.
ek4( Restaurant::ordering_open( $r1 ) && isset( Dashboard::sections( 'restaurant' )['orders'] ), 'Switching it on shows ordering and the "Online orders" section' );
$o = Booking::create_order( array( 'business_id' => $r1, 'items' => array( $jollof => 2, $fried => 1, $tuwo => 0 ), 'fulfilment' => 'pickup', 'pay' => 'cash', 'name' => 'SAMPLE Buyer', 'email' => 'b@example.test', 'phone' => '08030000002' ) );
ek4( is_object( $o ) && 'new' === $o->status && 720000 === (int) $o->total_kobo, 'Cash pickup order: 2 × ₦2,500 + ₦2,200 = ₦7,200, "new"' );
ek4( 72000 === (int) $o->commission_kobo, '10% food-order commission recorded (₦720)' );
ek4( is_wp_error( Booking::create_order( array( 'business_id' => $r1, 'items' => array( $tuwo => 1 ), 'fulfilment' => 'pickup', 'pay' => 'cash', 'name' => 'X Y', 'email' => 'x@example.test', 'phone' => '08030000001' ) ) ), 'Sold-out dish can’t be ordered' );
ek4( is_wp_error( Booking::create_order( array( 'business_id' => $r1, 'items' => array( $jollof => 1 ), 'fulfilment' => 'delivery', 'pay' => 'cash', 'name' => 'X Y', 'email' => 'x@example.test', 'phone' => '08030000001' ) ) ), 'Delivery refused when the restaurant only does pickup' );
$on = Booking::create_order( array( 'business_id' => $r1, 'items' => array( $jollof => 1 ), 'fulfilment' => 'pickup', 'pay' => 'online', 'name' => 'X Y', 'email' => 'x@example.test', 'phone' => '08030000001' ) );
ek4( 'pending_payment' === $on->status && 250000 === (int) $on->details['pay_now'], 'Online-paid order waits for payment of ₦2,500' );
foreach ( array( 'accepted', 'preparing', 'ready', 'completed' ) as $to ) {
	$ok = Booking::transition( Booking::get( $o->id ), $to, $o1 );
}
ek4( 'completed' === Booking::get( $o->id )->status, 'Order flow: accepted → preparing → ready → picked up' );
Settings::update( array( 'food_ordering_enabled' => 0 ) );
ek4( ! Restaurant::ordering_open( $r1 ), 'Switched back OFF' );

WP_CLI::line( 'Security (owner of Restaurant 2 vs Restaurant 1)' );
wp_set_current_user( $o2 );
$cases = array(
	array( 'dash_menu', $r1, array( 'op' => 'delete_item', 'id' => $jollof ) ),
	array( 'dash_restaurant', $r1, array( 'group' => 'tables', 'capacity' => 1, 'max_party' => 1 ) ),
	array( 'dash_booking', $r1, array( 'booking_id' => $d2->id, 'to' => 'cancelled' ) ),
	array( 'dash_booking', $r2, array( 'booking_id' => $d2->id, 'to' => 'cancelled' ) ),
);
foreach ( $cases as $c ) {
	$_SERVER['REQUEST_METHOD'] = 'POST';
	$_POST = array_merge( $c[2], array( 'ek_action' => $c[0], 'business_id' => $c[1], '_ek_nonce' => wp_create_nonce( $c[0] . '_' . $c[1] ) ) );
	$died  = false;
	try { Dashboard::handle(); } catch ( EK4_Die $e ) { $died = true; }
	ek4( $died, "\"{$c[0]}\" against Restaurant 1’s data is refused" . ( $c[1] === $r2 ? ' (sent via own restaurant)' : '' ) );
}
ek4( is_wp_error( Menu::delete_item( $jollof, $r2 ) ) && is_wp_error( Menu::toggle( $jollof, $r2 ) ) && is_wp_error( Menu::move( 'item', $jollof, $r2, 'up' ) ), 'Menu changes using another restaurant’s dish ID are refused' );
ek4( Menu::item( $jollof, $r1 ) && 10 === (int) Restaurant::settings( $r1 )['capacity'], 'Restaurant 1’s menu and settings unchanged' );
$_POST = array();
wp_set_current_user( 0 );

WP_CLI::line( 'Find a restaurant' );
$ids = wp_list_pluck( Restaurant_Search::search( Restaurant_Search::params( array( 'cuisine' => 'grills' ) ) )['all'], 'id' );
ek4( in_array( $r1, $ids, true ) && ! in_array( $r2, $ids, true ), 'Cuisine filter "Grills / Suya"' );
$ids = wp_list_pluck( Restaurant_Search::search( Restaurant_Search::params( array( 'price' => '2' ) ) )['all'], 'id' );
ek4( in_array( $r1, $ids, true ) && ! in_array( $r2, $ids, true ), 'Price filter "up to ₦₦" drops the ₦₦₦₦ restaurant' );
$all = array( 'always' => 0 );
foreach ( Business::DAYS as $dd ) {
	$all[ $dd ] = array( 'closed' => 1, 'open' => '08:00', 'close' => '09:00' );
}
update_post_meta( $r2, '_ek_hours', $all );
$ids = wp_list_pluck( Restaurant_Search::search( Restaurant_Search::params( array( 'open_now' => '1' ) ) )['all'], 'id' );
ek4( in_array( $r1, $ids, true ) && ! in_array( $r2, $ids, true ), '"Open now" keeps the 24-hour restaurant and drops the closed one' );
$res = array_values( array_filter( Restaurant_Search::search( Restaurant_Search::params( array( 'lat' => '13.0401', 'lng' => '8.3201' ) ) )['all'], static fn( $i ) => in_array( $i['id'], array( $r1, $r2 ), true ) ) );
ek4( $res[0]['id'] === $r2, '"Near me" sorts the nearest restaurant first' );

// Clean up.
Settings::update( array( 'food_ordering_enabled' => $was_ordering ) );
foreach ( array( $r1, $r2 ) as $rid ) {
	foreach ( Menu::items( $rid ) as $it ) {
		Menu::delete_item( $it->id, $rid );
	}
	$wpdb->delete( $wpdb->prefix . 'ek_menu_categories', array( 'business_id' => $rid ) );
	$wpdb->delete( $wpdb->prefix . 'ek_slots', array( 'business_id' => $rid ) );
	$bids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d", $rid ) );
	if ( $bids ) {
		$wpdb->query( "DELETE FROM {$wpdb->prefix}ek_log WHERE object_type='booking' AND object_id IN (" . implode( ',', array_map( 'intval', $bids ) ) . ')' ); // phpcs:ignore
	}
	$wpdb->delete( $wpdb->prefix . 'ek_bookings', array( 'business_id' => $rid ) );
	$wpdb->delete( $wpdb->prefix . 'ek_ledger', array( 'business_id' => $rid ) );
	wp_delete_post( $rid, true );
}
require_once ABSPATH . 'wp-admin/includes/user.php';
wp_delete_user( $o1 );
wp_delete_user( $o2 );

WP_CLI::line( $GLOBALS['ek_fail'] ? "\n{$GLOBALS['ek_fail']} check(s) FAILED" : "\nAll restaurant checks passed" );
if ( $GLOBALS['ek_fail'] ) {
	exit( 1 );
}
