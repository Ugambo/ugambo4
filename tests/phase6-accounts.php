<?php
/**
 * Phase 6 checks: cancellations & refunds by policy, money ledger after refunds, verified reviews,
 * favourites, linking earlier bookings to an account, add-to-calendar files, emails.
 * Run: wp eval-file ek-tests/phase6-accounts.php
 */

use EK\Access;
use EK\Account;
use EK\Availability;
use EK\Booking;
use EK\Business;
use EK\Calendar;
use EK\Favourites;
use EK\Hotel;
use EK\Install;
use EK\Refunds;
use EK\Restaurant;
use EK\Reviews;
use EK\Rooms;

$GLOBALS['ek_fail'] = 0;
function ek6( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
class EK6_Die extends Exception {}
add_filter( 'wp_die_handler', function () { return function ( $m ) { throw new EK6_Die( is_string( $m ) ? $m : 'died' ); }; } );
$GLOBALS['ek6_mail'] = array();
add_filter(
	'pre_wp_mail',
	function ( $r, $atts ) {
		$GLOBALS['ek6_mail'][] = array( 'to' => (array) $atts['to'], 'subject' => $atts['subject'] );
		return true;
	},
	10,
	2
);
function ek6_mail_to( $email ) {
	return array_values( array_filter( $GLOBALS['ek6_mail'], static fn( $m ) => in_array( $email, $m['to'], true ) ) );
}

global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$tz    = Availability::tz();
$mon   = ( new DateTimeImmutable( 'monday next week', $tz ) )->modify( '+21 days' );
$d     = static fn( $n ) => $mon->modify( "+{$n} days" )->format( 'Y-m-d' );
$admin = get_option( 'admin_email' );

/* ---------- Fixtures ---------- */
$owner = wp_insert_user( array( 'user_login' => "ek6_{$stamp}_o", 'user_email' => "ek6_{$stamp}_o@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
$hotel = Business::create( array( 'name' => "SAMPLE Refund Hotel {$stamp}", 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.95 + wp_rand( 0, 900 ) / 10000, 'lng' => 7.55 + wp_rand( 0, 900 ) / 10000, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => "ek6_{$stamp}_biz@example.test", 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test hotel. ', 5 ) ), $owner );
wp_update_post( array( 'ID' => $hotel, 'post_status' => 'publish' ) );
Hotel::save( $hotel, array( 'stars' => 3, 'amenities' => array( 'wifi' ), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
$room = Rooms::save( $hotel, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2000000, 'weekend_price' => 0, 'units' => 2, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );

$guest_email = "ek6_{$stamp}_g@example.test";
function ek6_book( $room, $in, $out, $email, $pay = 'full' ) {
	$b = Booking::create_hotel( array( 'room_id' => $room, 'checkin' => $in, 'checkout' => $out, 'guests' => 2, 'rooms' => 1, 'payment' => $pay, 'name' => 'SAMPLE Guest Six', 'email' => $email, 'phone' => '08030000009' ) );
	if ( is_object( $b ) && 'venue' !== $pay ) {
		Booking::mark_paid( $b->id, 'full' === $pay ? (int) $b->total_kobo : (int) $b->deposit_kobo, 'TEST-' . $b->code );
	}
	return is_object( $b ) ? Booking::get( $b->id ) : $b;
}
function ek6_ledger( $booking_id ) {
	global $wpdb;
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d", $booking_id ) );
}

/* ---------- Refund maths ---------- */
WP_CLI::line( 'Refund maths for each cancellation policy' );
$b     = ek6_book( $room, $d( 1 ), $d( 3 ), $guest_email ); // 2 nights × ₦20,000 = ₦40,000 paid in full.
$start = Refunds::starts_at( $b );
ek6( is_object( $b ) && 4000000 === (int) $b->paid_kobo && 'moderate' === ( $b->policy['key'] ?? '' ), 'Booking paid in full: ₦40,000, moderate policy saved on the booking' );
ek6( ( new DateTimeImmutable( $d( 1 ) . ' 14:00', $tz ) )->getTimestamp() === $start, 'A stay "starts" at the hotel’s check-in time (14:00 Lagos time)' );
$at = static fn( $hours ) => $start - (int) ( $hours * HOUR_IN_SECONDS );
$q  = static function ( $key, $hours ) use ( $b, $at ) {
	$c         = clone $b;
	$c->policy = array( 'key' => $key );
	return Refunds::quote( $c, $at( $hours ) )['refund'];
};
ek6( 4000000 === $q( 'flexible', 25 ), 'Flexible, 25 hours before: full ₦40,000 back' );
ek6( 2000000 === $q( 'flexible', 10 ), 'Flexible, 10 hours before: everything except the first night (₦20,000 back)' );
ek6( 4000000 === $q( 'moderate', 121 ), 'Moderate, 5 days + 1 hour before: full refund' );
ek6( 2000000 === $q( 'moderate', 48 ), 'Moderate, 2 days before: 50% (₦20,000)' );
ek6( 2000000 === $q( 'strict', 170 ), 'Strict, 7 days + before: 50%' );
ek6( 0 === $q( 'strict', 100 ), 'Strict, under 7 days: nothing back' );
ek6( 0 === $q( 'non_refundable', 500 ), 'Non-refundable: nothing back' );
$unpaid            = clone $b;
$unpaid->paid_kobo = 0;
ek6( 0 === Refunds::quote( $unpaid, $at( 500 ) )['refund'], 'Pay-at-hotel booking: nothing to refund' );
$r              = clone $b;
$r->kind        = 'restaurant';
$r->start_time  = '19:00:00';
$r->paid_kobo   = 1600000;
$rs             = Refunds::starts_at( $r );
ek6( 1600000 === Refunds::quote( $r, $rs - 25 * HOUR_IN_SECONDS )['refund'] && 0 === Refunds::quote( $r, $rs - 5 * HOUR_IN_SECONDS )['refund'], 'Restaurant deposit: full back 24h+ before, nothing after' );

WP_CLI::line( 'When guests can cancel online' );
ek6( true === Refunds::can_cancel( $b, $at( 48 ) ), 'Confirmed future stay can be cancelled' );
ek6( 'started' === Refunds::can_cancel( $b, $start + 60 )->get_error_code(), 'Not after check-in time has passed' );
$ci         = clone $b;
$ci->status = 'checked_in';
ek6( 'status' === Refunds::can_cancel( $ci, $at( 48 ) )->get_error_code(), 'Not once checked in' );
$o         = clone $b;
$o->kind   = 'order';
$o->status = 'accepted';
ek6( 'status' === Refunds::can_cancel( $o )->get_error_code(), 'Food orders: not after the restaurant accepts' );

/* ---------- Real cancellations ---------- */
WP_CLI::line( 'Guest cancels in time → full refund, room freed, money ledger back to zero' );
$GLOBALS['ek6_mail'] = array();
$avail_before        = Availability::quote( Rooms::data( $room ), $d( 1 ), $d( 3 ) )['available'];
$res                 = Refunds::guest_cancel( $b, 0 );
$c                   = Booking::get( $b->id );
$refunds             = Refunds::for_booking( $b->id );
ek6( is_array( $res ) && 'cancelled' === $c->status && 4000000 === $res['refund'], 'Cancelled 3 weeks ahead under moderate policy: ₦40,000 refunded' );
ek6( 1 === count( $refunds ) && 'refunded' === $refunds[0]->status && 'test' === $refunds[0]->method, 'Refund recorded and (test mode) sent back automatically' );
Availability::forget();
ek6( $avail_before + 1 === Availability::quote( Rooms::data( $room ), $d( 1 ), $d( 3 ) )['available'], 'The room is available again for those nights' );
ek6( 0 === ek6_ledger( $b->id ), 'Business earnings for this booking net to ₦0 (earning, commission, refund and commission returned)' );
ek6( count( ek6_mail_to( $guest_email ) ) >= 2, 'Guest gets the cancellation email and the refund-sent email' );
ek6( (bool) ek6_mail_to( "ek6_{$stamp}_biz@example.test" ) && (bool) ek6_mail_to( $admin ), 'Business and site admin are told about the cancellation' );
ek6( is_wp_error( Refunds::guest_cancel( Booking::get( $b->id ), 0 ) ), 'Cannot cancel the same booking twice' );

WP_CLI::line( 'Late cancellation → partial refund; business keeps its share minus commission' );
$b2  = ek6_book( $room, $d( 1 ), $d( 3 ), $guest_email );
$res = Refunds::guest_cancel( $b2, 0, Refunds::starts_at( $b2 ) - 48 * HOUR_IN_SECONDS );
ek6( 2000000 === $res['refund'], 'Moderate policy, 2 days before: ₦20,000 of ₦40,000 back' );
$rate = (int) $b2->commission_rate_bp;
ek6( ek6_ledger( $b2->id ) === 2000000 - (int) round( 2000000 * $rate / 10000 ), 'Business keeps ₦20,000 minus commission on ₦20,000 only' );
$held = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d AND status = 'on_hold' AND release_at IS NOT NULL", $b2->id ) );
ek6( $held > 0, 'The kept share gets a release date (3 days)' );

WP_CLI::line( 'Business cancels a paid booking → guest always gets everything back' );
$b3 = ek6_book( $room, $d( 4 ), $d( 5 ), $guest_email );
$to = isset( Booking::actions( $b3 )['cancelled'] ) ? 'cancelled' : 'declined';
ek6( true === Booking::transition( $b3, $to, $owner, 'Water problem' ), "Hotel {$to} a paid booking (status was {$b3->status})" );
$rf = Refunds::for_booking( $b3->id );
ek6( $rf && 2000000 === (int) $rf[0]->amount_kobo, 'Full ₦20,000 refunded when the hotel cancels or declines' );

WP_CLI::line( 'Automatic refund not possible → waits for the admin' );
$b4 = ek6_book( $room, $d( 6 ), $d( 7 ), $guest_email );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'order_id' => 999999991 ), array( 'id' => $b4->id ) );
$GLOBALS['ek6_mail'] = array();
Refunds::guest_cancel( Booking::get( $b4->id ), 0 );
$rf = Refunds::for_booking( $b4->id );
ek6( $rf && 'pending' === $rf[0]->status && 'manual' === $rf[0]->method, 'Refund waits in the admin Refunds list' );
ek6( (bool) array_filter( ek6_mail_to( $admin ), static fn( $m ) => false !== stripos( $m['subject'], 'refund' ) ), 'Admin is emailed to pay it by transfer' );
ek6( in_array( (int) $rf[0]->id, array_map( static fn( $x ) => (int) $x->id, Refunds::pending() ), true ), 'Listed under "Waiting to be paid"' );
Refunds::mark_done( $rf[0]->id, 'manual', 'TRF-123', 1 );
$rf = Refunds::for_booking( $b4->id );
ek6( 'refunded' === $rf[0]->status && 'TRF-123' === $rf[0]->reference, 'Admin marks it refunded with the transfer reference' );

/* ---------- Reviews ---------- */
WP_CLI::line( 'Verified reviews' );
$b5 = ek6_book( $room, $d( 8 ), $d( 9 ), $guest_email, 'venue' );
ek6( 'not_yet' === Reviews::can_review( $b5 )->get_error_code(), 'No review before the stay' );
Booking::set_status( Booking::get( $b5->id ), 'checked_in', $owner );
ek6( 'not_yet' === Reviews::can_review( Booking::get( $b5->id ) )->get_error_code(), 'No review while still checked in' );
$GLOBALS['ek6_mail'] = array();
Booking::set_status( Booking::get( $b5->id ), 'checked_out', $owner );
$b5 = Booking::get( $b5->id );
ek6( true === Reviews::can_review( $b5 ), 'After check-out the guest can review' );
ek6( (bool) array_filter( ek6_mail_to( $guest_email ), static fn( $m ) => false !== stripos( $m['subject'], 'review' ) || false !== stripos( $m['subject'], 'stay' ) ), 'Guest gets a "how was your stay?" email' );
ek6( 'rating' === Reviews::submit( $b5, array( 'rating_overall' => 0, 'review_body' => str_repeat( 'Good. ', 6 ) ) )->get_error_code(), 'Overall star rating is required' );
ek6( 'body' === Reviews::submit( $b5, array( 'rating_overall' => 4, 'review_body' => 'Nice' ) )->get_error_code(), 'A few words are not enough (20 characters minimum)' );
$GLOBALS['ek6_mail'] = array();
$rev = Reviews::submit( $b5, array( 'rating_overall' => 4, 'rating_cleanliness' => 5, 'rating_service' => 4, 'rating_value' => 3, 'rating_location' => 4, 'review_title' => 'Quiet and clean', 'review_body' => 'Clean room, friendly staff, good breakfast. <script>x</script>', 'lang' => 'en' ) );
ek6( is_object( $rev ) && 'published' === $rev->status && 'SAMPLE G.' === $rev->author_name, 'Review saved and published; name shown as first name + initial' );
ek6( is_object( $rev ) && false === strpos( $rev->body, '<script>' ), 'HTML is stripped from review text' );
ek6( 'done' === Reviews::can_review( $b5 )->get_error_code(), 'One review per booking' );
$st = Reviews::stats( $hotel );
ek6( 1 === $st['count'] && 4.0 === (float) $st['overall'] && 5.0 === (float) $st['cleanliness'], 'Business scores updated (overall 4, cleanliness 5)' );
ek6( (bool) ek6_mail_to( "ek6_{$stamp}_biz@example.test" ) && (bool) ek6_mail_to( $admin ), 'Business and admin are told about the new review' );
ek6( true === Reviews::reply( $rev->id, $hotel, 'Thank you for staying with us!' ), 'Owner can reply' );
$old = Booking::get( $b2->id );
ek6( is_wp_error( Reviews::can_review( $old ) ), 'A cancelled booking cannot be reviewed' );
$b6 = ek6_book( $room, $d( 10 ), $d( 11 ), $guest_email, 'venue' );
Booking::set_status( Booking::get( $b6->id ), 'checked_out', $owner );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'updated_at' => gmdate( 'Y-m-d H:i:s', time() - 200 * DAY_IN_SECONDS ) ), array( 'id' => $b6->id ) );
ek6( 'old' === Reviews::can_review( Booking::get( $b6->id ) )->get_error_code(), 'Reviews close 180 days after the visit' );

WP_CLI::line( 'Restaurant reservation → review after it is completed' );
$ro    = wp_insert_user( array( 'user_login' => "ek6_{$stamp}_r", 'user_email' => "ek6_{$stamp}_r@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
$hours = array( 'always' => 1 );
$rest  = Business::create( array( 'name' => "SAMPLE Review Kitchen {$stamp}", 'type' => 'restaurant', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.98, 'lng' => 7.62, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'r6@example.test', 'website' => '', 'socials' => array(), 'hours' => $hours, 'description' => str_repeat( 'Test restaurant. ', 4 ) ), $ro );
wp_update_post( array( 'ID' => $rest, 'post_status' => 'publish' ) );
Restaurant::save( $rest, array_merge( Restaurant::settings( $rest ), array( 'capacity' => 20, 'slot_minutes' => 60, 'max_party' => 8, 'min_notice_hours' => 0 ) ) );
$rv = Booking::create_reservation( array( 'business_id' => $rest, 'date' => $d( 2 ), 'time' => '19:00', 'party' => 2, 'name' => 'SAMPLE Diner', 'email' => $guest_email, 'phone' => '08030000009' ) );
ek6( is_object( $rv ), 'Reservation made' );
ek6( is_object( $rv ) && is_wp_error( Reviews::can_review( $rv ) ), 'No review before the meal' );
if ( is_object( $rv ) ) {
	Booking::set_status( Booking::get( $rv->id ), 'completed', $ro );
	$rr = Reviews::submit( Booking::get( $rv->id ), array( 'rating_overall' => 5, 'review_body' => 'Lovely tuwo and very friendly service.', 'lang' => 'ha' ) );
	ek6( is_object( $rr ) && 'ha' === $rr->lang && (int) $rr->business_id === $rest, 'Completed reservation reviewed (in Hausa) and shown on the restaurant' );
	$ics = Calendar::ics( Booking::get( $rv->id ) );
	ek6( false !== strpos( $ics, 'DTSTART:' ) && preg_match( '/DTSTART:\d{8}T180000Z/', $ics ), 'Reservation calendar file: 19:00 Lagos = 18:00 UTC' );
}

/* ---------- Calendar ---------- */
WP_CLI::line( 'Add to calendar' );
$ics = Calendar::ics( $b5 );
ek6( 0 === strpos( $ics, "BEGIN:VCALENDAR\r\n" ) && false !== strpos( $ics, 'END:VCALENDAR' ), 'Valid calendar file' );
ek6( false !== strpos( $ics, 'DTSTART;VALUE=DATE:' . str_replace( '-', '', $d( 8 ) ) ) && false !== strpos( $ics, 'DTEND;VALUE=DATE:' . str_replace( '-', '', $d( 9 ) ) ), 'Hotel stay: check-in to check-out dates' );
ek6( false !== strpos( str_replace( "\r\n ", '', $ics ), $b5->code ), 'Includes the booking code' );
ek6( max( array_map( 'strlen', explode( "\r\n", $ics ) ) ) <= 75, 'Long lines are wrapped (works in all calendar apps)' );
$g = Calendar::google_url( $b5 );
ek6( 0 === strpos( $g, 'https://calendar.google.com/calendar/render?' ) && false !== strpos( $g, 'dates=' . str_replace( '-', '', $d( 8 ) ) ), 'Google Calendar link with the right dates' );
ek6( null === Booking::by_code( $b5->code, 'wrong-key' ), 'Wrong secret key: booking (and its calendar file) not found' );

/* ---------- Favourites ---------- */
WP_CLI::line( 'Favourites' );
$cust = wp_insert_user( array( 'user_login' => "ek6_{$stamp}_c", 'user_email' => $guest_email, 'user_pass' => 'x' . $stamp, 'role' => Account::customer_role() ) );
ek6( true === Favourites::toggle( $cust, $hotel ) && Favourites::has( $cust, $hotel ), 'Save a hotel' );
ek6( 1 === count( Favourites::for_user( $cust ) ), 'It appears in the Favourites list' );
ek6( false === Favourites::toggle( $cust, $hotel ) && ! Favourites::has( $cust, $hotel ), 'Tap again to remove it' );
$draft = Business::create( array( 'name' => "SAMPLE Draft {$stamp}", 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.9, 'lng' => 7.6, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'd@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test. ', 5 ) ), $owner );
ek6( is_wp_error( Favourites::toggle( $cust, $draft ) ), 'Cannot save a business that is not yet approved' );
ek6( is_wp_error( Favourites::toggle( $cust, (int) get_option( 'page_on_front' ) ?: 1 ) ), 'Cannot save things that are not places' );
ek6( is_wp_error( Favourites::toggle( 0, $hotel ) ), 'Logged-out visitors are asked to log in first' );

/* ---------- Accounts ---------- */
WP_CLI::line( 'Accounts and earlier bookings' );
ek6( Install::page_url( 'account' ) === Access::home_for( get_userdata( $cust ) ), 'Customers land on My Account after logging in' );
ek6( Install::page_url( 'dashboard' ) === Access::home_for( get_userdata( $owner ) ), 'Business owners still land on their dashboard' );
ek6( ! user_can( $cust, 'edit_posts' ) && Access::is_front_end_only( get_userdata( $cust ) ), 'Customers are kept out of wp-admin' );
$other_email = "ek6_{$stamp}_x@example.test";
$bx          = ek6_book( $room, $d( 12 ), $d( 13 ), $other_email, 'venue' );
$theirs      = ek6_book( $room, $d( 14 ), $d( 15 ), $guest_email, 'venue' );
$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'customer_id' => $owner ), array( 'id' => $theirs->id ) );
$url   = Account::send_link_email( $cust );
$token = wp_parse_args( wp_parse_url( $url, PHP_URL_QUERY ) )['ek_link'];
$other = wp_insert_user( array( 'user_login' => "ek6_{$stamp}_y", 'user_email' => $other_email, 'user_pass' => 'x' . $stamp, 'role' => Account::customer_role() ) );
ek6( 0 === Account::link_bookings( $token, $other ), 'Someone else cannot use your link' );
ek6( 0 === Account::link_bookings( str_replace( '.', '.9', $token ), $cust ), 'A tampered link is refused' );
$m       = new ReflectionMethod( Account::class, 'token' );
$m->setAccessible( true );
ek6( 0 === Account::link_bookings( $m->invoke( null, $cust, time() - 60 ), $cust ), 'An expired link is refused' );
$n     = Account::link_bookings( $token, $cust );
$mine  = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE customer_id = %d", $cust ) );
ek6( $n >= 6 && in_array( (string) $b5->id, $mine, true ), 'Valid link adds every booking made with that email' );
ek6( ! in_array( (string) $bx->id, $mine, true ), 'Bookings under other emails are not added' );
ek6( ! in_array( (string) $theirs->id, $mine, true ), 'Bookings already in another account are not taken over' );
$stays = Account::bookings( $cust, array( 'hotel', 'event' ) );
$tables = Account::bookings( $cust, array( 'restaurant' ) );
ek6( $stays && ! array_filter( $stays, static fn( $x ) => ! in_array( $x->kind, array( 'hotel', 'event' ), true ) ), 'My Bookings shows hotels and event centres only' );
ek6( 1 === count( $tables ) && 'restaurant' === $tables[0]->kind, 'My Reservations shows the table booking' );

WP_CLI::line( 'WhatsApp/SMS hook (off by default)' );
$msgs = array();
add_action( 'ek_send_message', function ( $ctx ) use ( &$msgs ) { $msgs[] = $ctx; } );
$was_sms = EK\Settings::get( 'messaging_sms' );
$b7      = ek6_book( $room, $d( 16 ), $d( 17 ), $guest_email );
Refunds::guest_cancel( $b7, 0 );
ek6( ! $was_sms ? 0 === count( $msgs ) : true, 'Switched off: no WhatsApp/SMS messages are sent' );
EK\Settings::update( array( 'messaging_sms' => 1 ) );
$msgs = array();
$b8   = ek6_book( $room, $d( 18 ), $d( 19 ), $guest_email );
Refunds::guest_cancel( $b8, 0 );
EK\Settings::update( array( 'messaging_sms' => $was_sms ? 1 : 0 ) );
$evs = array_column( $msgs, 'phone', 'event' );
ek6( ! empty( $evs['guest_cancelled'] ) && ! empty( $evs['business_guest_cancelled'] ), 'Switched on: guest and business messages carry their phone numbers' );

WP_CLI::line( 'Emails' );
$GLOBALS['ek6_mail'] = array();
EK\Emails::welcome( $cust );
ek6( 1 === count( ek6_mail_to( $guest_email ) ), 'Welcome email on sign-up' );

/* ---------- Clean up ---------- */
foreach ( array( $cust, $other ) as $u ) {
	$wpdb->delete( $wpdb->prefix . 'ek_favourites', array( 'user_id' => $u ) );
	wp_delete_user( $u );
}
wp_delete_post( $draft, true );
WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 6 checks passed.' );
