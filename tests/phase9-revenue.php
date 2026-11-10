<?php
/**
 * Phase 9 checks: direct sales and payments, Featured/Premium plans (placement, pins, photos,
 * expiry and reminders), Verified applications, listing setup, event promotion, tickets with
 * QR codes and check-in, own tours, banner ads, AdSense switch, sponsored posts, shop and digital
 * guides, partner links, revenue dashboard.
 * Run: wp eval-file ek-tests/phase9-revenue.php
 */

use EK\Ads;
use EK\Business;
use EK\Events;
use EK\Hotel;
use EK\Install;
use EK\Map_Index;
use EK\Partners;
use EK\Plans;
use EK\Revenue;
use EK\Rooms;
use EK\Sales;
use EK\Services;
use EK\Settings;
use EK\Shop;
use EK\Tickets;
use EK\Tours;

$GLOBALS['ek_fail'] = 0;
function ek9( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
$GLOBALS['ek9_mail'] = array();
add_filter( 'pre_wp_mail', function ( $r, $a ) { $GLOBALS['ek9_mail'][] = $a['subject']; return true; }, 10, 2 );
function ek9_mailed( $s ) {
	return (bool) array_filter( $GLOBALS['ek9_mail'], static fn( $m ) => false !== stripos( $m, $s ) );
}
global $wpdb;
$x     = $wpdb->prefix;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$tz    = EK\Availability::tz();
$saved = Settings::all();
$made  = array();

$owner = wp_insert_user( array( 'user_login' => "ek9_{$stamp}", 'user_email' => "ek9_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
$hotel = function ( $n, $publish = true ) use ( $owner, $lga, $stamp, &$made ) {
	$id = Business::create( array( 'name' => "SAMPLE Plan Hotel {$n} {$stamp}", 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.95 + wp_rand( 0, 900 ) / 10000, 'lng' => 7.55 + wp_rand( 0, 900 ) / 10000, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => "ek9b_{$stamp}@example.test", 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test hotel. ', 5 ) ), $owner );
	if ( $publish ) {
		wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	}
	$made[] = $id;
	return $id;
};

/* ---------- Plans ---------- */
WP_CLI::line( 'Featured / Premium plans' );
$h1 = $hotel( 1 );
$h2 = $hotel( 2 );
$hd = $hotel( 'draft', false );
ek9( 1000000 === (int) Settings::get( 'price_featured_month' ) && 25000000 === (int) Settings::get( 'price_premium_year' ), 'Placeholder prices: Featured ₦10,000/month, Premium ₦250,000/year' );
ek9( 'status' === Plans::buy( $hd, 'featured', 'month', $owner )->get_error_code(), 'Listings not yet approved cannot buy a plan' );
ek9( 'basic' === Plans::current( $h1 )['plan'] && 8 === Business::max_photos( $h1 ), 'Everyone starts on Basic (free, 8 photos)' );
$s = Plans::buy( $h1, 'featured', 'month', $owner );
ek9( is_object( $s ) && 'pending_payment' === $s->status && 1000000 === (int) $s->amount_kobo && 0 === strpos( Sales::pay_url( $s ), Install::page_url( 'book' ) ), 'Buying Featured (1 month) creates a ₦10,000 order and sends the owner to pay' );
$GLOBALS['ek9_mail'] = array();
$s = Sales::mark_paid( $s->id, 1000000, 'TEST-P1' );
$c = Plans::current( $h1 );
ek9( 'paid' === $s->status && 'featured' === $c['plan'] && abs( $c['until'] - strtotime( '+1 month' ) ) < 120, 'Paid: Featured until one month from today' );
ek9( ek9_mailed( 'Receipt' ) && ek9_mailed( 'New sale' ), 'Receipt to the owner, notice to the admin' );
ek9( 'paid' === Sales::mark_paid( $s->id, 1000000, 'TEST-P1' )->status && 1 === (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$x}ek_log WHERE action = 'plan_started' AND object_id = %d", $h1 ) ), 'The same payment arriving twice is applied once' );
Map_Index::flush();
ek9( Map_Index::is_featured( $h1 ) && 1 === (int) $wpdb->get_var( $wpdb->prepare( "SELECT featured FROM {$x}ek_map_index WHERE object_id = %d", $h1 ) ), 'Highlighted map pin' );
ek9( 20 === Business::max_photos( $h1 ), 'Featured allows 20 photos' );
$s2 = Sales::mark_paid( Plans::buy( $h1, 'featured', 'month', $owner )->id, 1000000, 'TEST-P2' );
ek9( abs( Plans::current( $h1 )['until'] - strtotime( '+2 months' ) ) < 3 * DAY_IN_SECONDS, 'Renewing early adds another month on top' );
$items  = array( array( 'id' => $h2, 'rank' => 1 ), array( 'id' => 999999991, 'rank' => 2 ), array( 'id' => $h1, 'rank' => 7 ) );
$sorted = Plans::promote( $items );
ek9( $h1 === $sorted[0]['id'] && $sorted[0]['featured'] && 7 === $sorted[0]['rank'], 'Search: the Featured hotel goes to the top, marked Featured, keeping its own rank number (#7)' );
Sales::mark_paid( Plans::buy( $h2, 'premium', 'year', $owner )->id, 25000000, 'TEST-P3' );
ek9( 'premium' === Plans::current( $h2 )['plan'] && 40 === Business::max_photos( $h2 ), 'Premium (1 year): 40 photos' );
ek9( false !== strpos( do_shortcode( '[ek_premium_spotlight]' ), "SAMPLE Plan Hotel 2 {$stamp}" ), 'Premium businesses appear in the homepage spot' );
ek9( $h2 === Plans::promote( array( array( 'id' => $h1, 'rank' => 1 ), array( 'id' => $h2, 'rank' => 2 ) ) )[0]['id'], 'Premium shows before Featured at the top' );
ek9( 999999991 === Plans::promote( array( array( 'id' => 999999991, 'distance' => 0.4 ), array( 'id' => $h2, 'distance' => 80.0 ) ) )[0]['id'], 'Near-me searches: a Featured place 80 km away does not jump above one 400 m away' );

WP_CLI::line( 'Plan reminders and expiry' );
update_post_meta( $h1, '_ek_plan_until', time() + 6 * DAY_IN_SECONDS );
$GLOBALS['ek9_mail'] = array();
Plans::tick();
ek9( ek9_mailed( 'ends in 7 days' ), 'Reminder 7 days before' );
$GLOBALS['ek9_mail'] = array();
Plans::tick();
ek9( ! ek9_mailed( 'ends' ), 'Only once' );
update_post_meta( $h1, '_ek_plan_until', time() + 20 * HOUR_IN_SECONDS );
Plans::tick();
ek9( ek9_mailed( 'ends tomorrow' ), 'Reminder 1 day before' );
update_post_meta( $h1, '_ek_plan_until', time() - 60 );
$GLOBALS['ek9_mail'] = array();
Plans::tick();
Map_Index::flush();
ek9( 'basic' === Plans::current( $h1 )['plan'] && ! Map_Index::is_featured( $h1 ) && ek9_mailed( 'has ended' ), 'Plan ends automatically: back to Basic, pin no longer highlighted, owner told' );

/* ---------- Verified ---------- */
WP_CLI::line( 'Verified badge application' );
$v = Services::apply_verified( $h1, $owner );
ek9( is_object( $v ) && 500000 === (int) $v->amount_kobo, 'Apply for Verified: ₦5,000 one-time' );
Sales::mark_paid( $v->id, 500000, 'TEST-V1' );
ek9( 'submitted' === Sales::get( $v->id )->stage, 'Paid: waiting for the admin' );
ek9( 'pending' === Services::apply_verified( $h1, $owner )->get_error_code(), 'Cannot apply twice while waiting' );
ek9( 'reason' === Services::decide_verified( $v->id, false, '', 1 )->get_error_code(), 'Rejecting needs a reason' );
ek9( true === Services::decide_verified( $v->id, true, 'Visited 10 Nov', 1 ) && get_post_meta( $h1, '_ek_verified', true ), 'Admin approves: Verified badge given' );
ek9( 'done' === Services::apply_verified( $h1, $owner )->get_error_code(), 'Already Verified: no new application' );
$v2 = Sales::mark_paid( Services::apply_verified( $h2, $owner )->id, 500000, 'TEST-V2' );
Services::decide_verified( $v2->id, false, 'Address does not match the pin', 1, true );
$v2 = Sales::get( $v2->id );
ek9( 'rejected' === $v2->stage && 'refunded' === $v2->status && ! get_post_meta( $h2, '_ek_verified', true ), 'Rejected with refund: no badge, fee refunded' );

/* ---------- Listing setup ---------- */
WP_CLI::line( 'Listing setup service' );
$su = Sales::create( array( 'kind' => 'setup', 'amount_kobo' => Services::setup_packages()['photos'][1], 'name' => 'SAMPLE Owner', 'email' => 'su@example.test', 'phone' => '+2348030000004', 'details' => array( 'title' => 'SAMPLE setup', 'business' => 'SAMPLE Shop' ) ) );
Sales::mark_paid( $su->id, $su->amount_kobo, 'TEST-S1' );
ek9( 3000000 === (int) $su->amount_kobo && 'new' === Sales::get( $su->id )->stage, 'Setup + photo visit ₦30,000: order appears as "New" for the admin' );

/* ---------- Events, tickets, check-in ---------- */
WP_CLI::line( 'Event tickets' );
$ev = wp_insert_post( array( 'post_type' => Events::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Concert {$stamp}", 'post_content' => 'SAMPLE event for tests.' ) );
$ev2 = wp_insert_post( array( 'post_type' => Events::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Other Event {$stamp}" ) );
$start = ( new DateTimeImmutable( '+30 days', $tz ) )->format( 'Y-m-d' );
foreach ( array( $ev, $ev2 ) as $e ) {
	update_post_meta( $e, '_ek_start', $start . ' 16:00' );
	update_post_meta( $e, '_ek_venue', 'SAMPLE venue' );
}
Tickets::save_types( $ev, array( array( 'name' => 'Regular', 'price' => '2,000', 'quantity' => 3 ), array( 'name' => 'VIP', 'price' => '10000', 'quantity' => 1 ) ) );
Tickets::save_types( $ev2, array( array( 'name' => 'Free entry', 'price' => '0', 'quantity' => 50 ) ) );
$types = Tickets::types( $ev );
$reg   = $types[0];
$vip   = $types[1];
ek9( 2 === count( $types ) && 200000 === (int) $reg->price_kobo && 3 === (int) $reg->quantity, 'Ticket types: Regular ₦2,000 × 3, VIP ₦10,000 × 1' );
ek9( 'max' === Tickets::buy( $ev, array( $reg->id => 11 ), 'A B', 'a@example.test', '08030000001' )->get_error_code(), 'At most 10 tickets per order' );
$t1 = Tickets::buy( $ev, array( $reg->id => 2, $vip->id => 1 ), 'SAMPLE Fan', 'fan@example.test', '08030000001' );
ek9( is_object( $t1 ) && 1400000 === (int) $t1->amount_kobo && 'pending_payment' === $t1->status && $t1->hold_expires, '2 Regular + 1 VIP = ₦14,000, held for 15 minutes' );
ek9( 'sold_out' === Tickets::buy( $ev, array( $reg->id => 2 ), 'X Y', 'x@example.test', '08030000002' )->get_error_code(), 'Held tickets cannot be sold twice (only 1 Regular left)' );
$wpdb->update( $x . 'ek_sales', array( 'hold_expires' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $t1->id ) );
Sales::expire_holds();
ek9( 'expired' === Sales::get( $t1->id )->status && 0 === (int) Tickets::types( $ev )[0]->sold, 'Unpaid after 15 minutes: tickets go back on sale' );
$late = Sales::mark_paid( $t1->id, 1400000, 'TEST-LATE' );
ek9( 'paid' === $late->status && 3 === count( Tickets::for_sale( $t1->id ) ), 'Payment arriving late still works if tickets are left (taken again)' );
$k     = Tickets::for_sale( $t1->id );
$codes = array_unique( wp_list_pluck( $k, 'code' ) );
ek9( 3 === count( $codes ) && preg_match( '/^[A-Z2-9]{16}$/', $k[0]->code ), 'Three tickets, each with its own 16-character secret code (shown as a QR code)' );
$html = EK\View::render( 'sale/receipt', array( 's' => Sales::get( $t1->id ) ) );
ek9( false !== strpos( $html, 'data-ek-qr="' . $k[0]->code . '"' ) && false !== strpos( $html, 'Ticket 1 of 3' ), 'Receipt page shows each ticket with its QR code' );
$staff = wp_insert_user( array( 'user_login' => "ek9s_{$stamp}", 'user_email' => "ek9s_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Tickets::ROLE ) );
ek9( user_can( $staff, Tickets::CAP ) && ! user_can( $owner, Tickets::CAP ) && ! user_can( $staff, 'edit_posts' ), 'Check-in staff role: can check tickets, nothing else' );
ek9( 'ok' === Tickets::check_in( $k[0]->code, $ev, $staff )['result'], 'Scan: valid ticket checked in' );
ek9( 'already' === Tickets::check_in( $k[0]->code, $ev, $staff )['result'], 'Scanning the same ticket again: "Already used"' );
ek9( 'wrong_event' === Tickets::check_in( $k[1]->code, $ev2, $staff )['result'], 'Ticket for another event is refused' );
ek9( 'invalid' === Tickets::check_in( 'NOTAREALCODE1234', $ev, $staff )['result'], 'Made-up code is refused' );
ek9( 'ok' === Tickets::check_in( strtolower( implode( ' ', str_split( $k[1]->code, 4 ) ) ), $ev, $staff )['result'], 'Typed code with spaces/lower case works' );
$rq = new WP_REST_Request( 'POST', '/ek/v1/checkin' );
$rq->set_param( 'code', $k[2]->code );
$rq->set_param( 'event', $ev );
wp_set_current_user( 0 );
ek9( 401 === rest_do_request( $rq )->get_status(), 'Check-in endpoint refuses visitors who are not staff' );
wp_set_current_user( $staff );
ek9( 'ok' === rest_do_request( $rq )->get_data()['result'], 'Staff can check in through the scanner page' );
wp_set_current_user( 0 );
Sales::cancel( Sales::get( $t1->id ), null, 'Event moved', 1 );
ek9( 'void' === Tickets::check_in( $k[0]->code, $ev, $staff )['result'] || 'already' === Tickets::check_in( $k[0]->code, $ev, $staff )['result'], 'Cancelled order: its tickets stop working' );
ek9( 0 === (int) Tickets::types( $ev )[0]->sold && 'refunded' === Sales::get( $t1->id )->status, 'Cancelled and refunded; tickets back on sale' );
$free = Tickets::buy( $ev2, array( Tickets::types( $ev2 )[0]->id => 2 ), 'SAMPLE Guest', 'g@example.test', '08030000003' );
ek9( 'paid' === $free->status && 2 === count( Tickets::for_sale( $free->id ) ), 'Free tickets are issued at once (no payment step)' );
update_post_meta( $ev2, '_ek_start', ( new DateTimeImmutable( '-3 days', $tz ) )->format( 'Y-m-d' ) . ' 10:00' );
ek9( ! Tickets::on_sale( Tickets::types( $ev2 )[0], $ev2 ), 'Past events stop selling tickets' );

WP_CLI::line( 'Event promotion' );
$pr = Sales::create( array( 'kind' => 'promotion', 'amount_kobo' => Events::packages()['7'][1], 'name' => 'SAMPLE Organiser', 'email' => 'org@example.test', 'phone' => '+2348030000005', 'details' => array( 'title' => 'SAMPLE Fair (7 days)', 'days' => 7, 'new' => array( 'title' => "SAMPLE Fair {$stamp}", 'date' => $start, 'tbc' => 0, 'venue' => 'SAMPLE ground', 'about' => 'SAMPLE fair for testing the promotion flow.' ) ) ) );
Sales::mark_paid( $pr->id, $pr->amount_kobo, 'TEST-PR' );
ek9( 'submitted' === Sales::get( $pr->id )->stage, 'Paid promotion waits for admin approval' );
$newev = Events::approve_promotion( $pr->id, 1 );
ek9( is_int( $newev ) && 'publish' === get_post_status( $newev ) && Events::is_promoted( $newev ), 'Approved: the event is created and promoted' );
ek9( abs( (int) get_post_meta( $newev, '_ek_promoted_until', true ) - ( time() + 7 * DAY_IN_SECONDS ) ) < 120, 'Promoted for exactly 7 days from approval' );
ek9( $newev === Events::upcoming( 5 )[0], 'Promoted events appear first on the Events page' );
ek9( false !== strpos( do_shortcode( '[ek_promoted_events]' ), "SAMPLE Fair {$stamp}" ), 'And in the homepage block' );
ek9( is_wp_error( Events::approve_promotion( $pr->id, 1 ) ), 'Cannot be approved twice' );
$made = array_merge( $made, array( $ev, $ev2, $newev ) );

/* ---------- Tours ---------- */
WP_CLI::line( 'Own tours' );
$tour = wp_insert_post( array( 'post_type' => Tours::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE City Tour {$stamp}", 'post_content' => 'SAMPLE tour.' ) );
update_post_meta( $tour, '_ek_price_kobo', 1500000 );
update_post_meta( $tour, '_ek_group_size', 4 );
update_post_meta( $tour, '_ek_pickup', 'SAMPLE pickup point' );
$d10 = ( new DateTimeImmutable( '+10 days', $tz ) )->format( 'Y-m-d' );
$d1  = ( new DateTimeImmutable( '+1 day', $tz ) )->format( 'Y-m-d' );
Tours::save_departures( $tour, array( array( 'date' => $d10, 'time' => '08:00' ), array( 'date' => $d1, 'time' => '09:00' ), array( 'date' => $d10, 'time' => '14:00', 'status' => 'closed' ) ) );
$deps = Tours::departures( $tour );
$far  = current( array_filter( $deps, static fn( $r ) => $r->depart_date === $d10 && 'open' === $r->status ) );
$near = current( array_filter( $deps, static fn( $r ) => $r->depart_date === $d1 ) );
$shut = current( array_filter( $deps, static fn( $r ) => 'closed' === $r->status ) );
ek9( 3 === count( $deps ) && 4 === (int) $far->seats, 'Dates added; seats default to the group size (4)' );
$tb = Tours::book( $far->id, 3, 'SAMPLE Tourist', 'tour@example.test', '08030000006' );
ek9( is_object( $tb ) && 4500000 === (int) $tb->amount_kobo && 3 === (int) Tours::departure( $far->id )->taken, '3 people × ₦15,000 = ₦45,000; 3 seats held' );
ek9( 'full' === Tours::book( $far->id, 2, 'X Y', 'x@example.test', '08030000007' )->get_error_code(), 'Cannot book more seats than are left' );
ek9( 'closed' === Tours::book( $shut->id, 1, 'X Y', 'x@example.test', '08030000007' )->get_error_code(), 'Closed dates cannot be booked' );
$tb = Sales::mark_paid( $tb->id, 4500000, 'TEST-T1' );
ek9( true === apply_filters( 'ek_sale_guest_can_cancel', null, $tb ), 'Guest can cancel online more than 48 hours before' );
Sales::cancel( $tb, null, 'Guest', 0 );
ek9( 'refunded' === Sales::get( $tb->id )->status && 0 === (int) Tours::departure( $far->id )->taken, 'Cancelled: full refund, seats free again' );
$tn = Sales::mark_paid( Tours::book( $near->id, 1, 'SAMPLE Tourist', 'tour@example.test', '08030000006' )->id, 1500000, 'TEST-T2' );
ek9( 'late' === apply_filters( 'ek_sale_guest_can_cancel', null, $tn )->get_error_code(), 'Less than 48 hours before: online cancellation closed' );
$made[] = $tour;

/* ---------- Ads, AdSense, sponsored ---------- */
WP_CLI::line( 'Banner ads, AdSense, sponsored posts' );
$img = (int) $wpdb->get_var( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_mime_type LIKE 'image/%' ORDER BY ID DESC LIMIT 1" );
ek9( 'fields' === Ads::save( array( 'title' => 'X', 'zone' => 'search', 'image_id' => $img, 'link_url' => 'not a url' ) )->get_error_code(), 'An ad needs a valid link' );
$a1 = Ads::save( array( 'title' => "SAMPLE Ad {$stamp}", 'zone' => 'sidebar', 'image_id' => $img, 'link_url' => 'https://example.com/ad', 'active' => 1 ) );
$a2 = Ads::save( array( 'title' => "SAMPLE Old Ad {$stamp}", 'zone' => 'sidebar', 'image_id' => $img, 'link_url' => 'https://example.com/old', 'ends_on' => ( new DateTimeImmutable( '-1 day', $tz ) )->format( 'Y-m-d' ), 'active' => 1 ) );
ek9( in_array( $a1, array_map( 'intval', wp_list_pluck( Ads::live( 'sidebar' ), 'id' ) ), true ) && ! in_array( $a2, array_map( 'intval', wp_list_pluck( Ads::live( 'sidebar' ), 'id' ) ), true ), 'Only ads within their dates show' );
foreach ( Ads::live( 'sidebar' ) as $other ) {
	if ( (int) $other->id !== $a1 ) {
		$wpdb->update( $x . 'ek_ads', array( 'active' => 0 ), array( 'id' => $other->id ) );
	}
}
$before = (int) Ads::stats( $a1 )->views;
$zone   = Ads::zone( 'sidebar' );
ek9( false !== strpos( $zone, 'Advertisement' ) && false !== strpos( $zone, '?ek_ad=' . $a1 ) && false !== strpos( $zone, 'rel="sponsored nofollow noopener"' ), 'Banner is labelled "Advertisement", links are marked sponsored and go through a click counter' );
ek9( $before + 1 === (int) Ads::stats( $a1 )->views, 'Views are counted' );
ek9( '' === Ads::zone( 'home' ), 'Zone with no booked ad and AdSense off: nothing shown' );
Settings::update( array( 'adsense_enabled' => 1, 'adsense_client' => 'ca-pub-1234567890123456', 'adsense_slots' => array( 'home' => '1234567890' ) ) );
ek9( false !== strpos( Ads::zone( 'home' ), 'adsbygoogle' ), 'AdSense switched on: its unit fills empty zones' );
Settings::update( array( 'adsense_client' => 'nonsense' ) );
ek9( '' === Ads::zone( 'home' ), 'An invalid AdSense code keeps it off' );
Settings::update( array( 'adsense_enabled' => 0, 'adsense_client' => '', 'adsense_slots' => array() ) );
$post = wp_insert_post( array( 'post_type' => 'post', 'post_status' => 'draft', 'post_title' => "SAMPLE Sponsored {$stamp}", 'post_content' => '<p>Visit <a href="https://example.com/x">our partner</a>.</p>' ) );
update_post_meta( $post, '_ek_sponsored', 1 );
update_post_meta( $post, '_ek_sponsor', 'SAMPLE Sponsor' );
$GLOBALS['post'] = get_post( $post );
setup_postdata( $GLOBALS['post'] );
$out = Ads::sponsored_label( '<p>Visit <a href="https://example.com/x">our partner</a>.</p>' );
wp_reset_postdata();
ek9( false !== strpos( $out, '>Sponsored<' ) && false !== strpos( $out, 'Paid for by SAMPLE Sponsor' ) && false !== strpos( $out, 'rel="sponsored"' ), 'Sponsored article: clear label, sponsor name, links marked rel="sponsored"' );
$made[] = $post;

/* ---------- Shop and guides ---------- */
if ( class_exists( 'WooCommerce' ) ) {
	WP_CLI::line( 'Shop and digital guides (WooCommerce)' );
	ek9( (bool) term_exists( 'leatherwork', 'product_cat' ) && (bool) term_exists( 'guides', 'product_cat' ), 'Shop categories: Leatherwork, Fabrics, Crafts, Guides & maps' );
	$zones = wp_list_pluck( WC_Shipping_Zones::get_zones(), 'zone_name' );
	ek9( in_array( 'Katsina State', $zones, true ) && in_array( 'Rest of Nigeria', $zones, true ), 'Delivery fees by state (Katsina, nearby states, rest of Nigeria)' );
	$pkg  = array( 'destination' => array( 'country' => 'NG', 'state' => 'KN', 'postcode' => '' ) );
	ek9( 'Nearby states (Kano, Jigawa, Kaduna, Zamfara)' === WC_Shipping_Zones::get_zone_matching_package( $pkg )->get_zone_name(), 'A Kano address gets the "nearby states" fee' );
	$prod = new WC_Product_Simple();
	$prod->set_name( "SAMPLE Leather bag {$stamp}" );
	$prod->set_regular_price( '12000' );
	$prod->save();
	ek9( $prod->is_purchasable(), 'Products can be bought here by default' );
	Settings::update( array( 'shop_external_url' => 'https://example.com/store' ) );
	ek9( ! wc_get_product( $prod->get_id() )->is_purchasable(), 'With an external store link set, products send buyers there instead' );
	Settings::update( array( 'shop_external_url' => '' ) );
	$guide = new WC_Product_Simple();
	$guide->set_name( "SAMPLE Pocket Guide {$stamp}" );
	$guide->set_regular_price( '2000' );
	$guide->set_virtual( true );
	$guide->set_downloadable( true );
	$up = wp_upload_dir();
	wp_mkdir_p( $up['basedir'] . '/woocommerce_uploads' );
	file_put_contents( $up['basedir'] . '/woocommerce_uploads/sample-guide.pdf', "%PDF-1.4\n% SAMPLE placeholder guide for tests\n" );
	$file = new WC_Product_Download();
	$file->set_name( 'SAMPLE guide (PDF)' );
	$file->set_file( $up['baseurl'] . '/woocommerce_uploads/sample-guide.pdf' );
	$file->set_id( md5( 'sample-guide' ) );
	$guide->set_downloads( array( $file ) );
	$guide->save();
	$cust  = wp_insert_user( array( 'user_login' => "ek9c_{$stamp}", 'user_email' => "ek9c_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => 'customer' ) );
	$order = wc_create_order( array( 'customer_id' => $cust ) );
	$order->add_product( $guide, 1 );
	$order->add_product( $prod, 1 );
	$order->set_billing_email( "ek9c_{$stamp}@example.test" );
	$order->calculate_totals();
	$order->payment_complete( 'TEST-SHOP' );
	$dls = wc_get_customer_available_downloads( $cust );
	ek9( 1 === count( $dls ) && false !== strpos( $dls[0]['download_name'], 'SAMPLE guide' ), 'Digital guide: instant download for the buyer after payment' );
	$inc = Shop::income( wp_date( 'Y-m-01' ), wp_date( 'Y-m-d' ) )[ wp_date( 'Y-m' ) ] ?? array();
	ek9( ( $inc['guides'] ?? 0 ) >= 200000 && ( $inc['shop'] ?? 0 ) >= 1200000, 'Revenue splits guides and craft sales' );
	wp_delete_post( $prod->get_id(), true );
	wp_delete_post( $guide->get_id(), true );
	$order->delete( true );
	wp_delete_user( $cust );
}

/* ---------- Partners ---------- */
WP_CLI::line( 'Partner referral links' );
ek9( 'fields' === Partners::save( array( 'name' => 'X', 'url' => 'nope' ) )->get_error_code(), 'A partner needs a valid link' );
$pid = Partners::save( array( 'name' => "SAMPLE Bus Co {$stamp}", 'slug' => "sample-bus-{$stamp}", 'category' => 'bus', 'url' => 'https://example.com/?ref=ek', 'active' => 1 ) );
ek9( is_int( $pid ) && 'slug' === Partners::save( array( 'name' => 'Y', 'slug' => "sample-bus-{$stamp}", 'url' => 'https://example.com' ) )->get_error_code(), 'Short names are unique' );
ek9( home_url( "/go/sample-bus-{$stamp}/" ) === Partners::link( "sample-bus-{$stamp}" ) && false !== strpos( do_shortcode( "[ek_partner slug=\"sample-bus-{$stamp}\" label=\"Book a bus\"]" ), 'rel="sponsored nofollow noopener"' ), 'Links go through /go/… and are marked sponsored' );
$wpdb->insert( $x . 'ek_partner_clicks', array( 'partner_id' => $pid, 'source_url' => '/tours/', 'created_at' => current_time( 'mysql', true ) ) );
ek9( 1 === ( Partners::clicks_by_month()[ $pid ][ gmdate( 'Y-m' ) ] ?? 0 ) && false !== strpos( Partners::csv( gmdate( 'Y-m' ) ), "SAMPLE Bus Co {$stamp}" ), 'Clicks are counted per month and exported for commission claims' );

/* ---------- Revenue ---------- */
WP_CLI::line( 'Revenue dashboard' );
ek9( 'fields' === Revenue::record( 'ads', 0, wp_date( 'Y-m-d' ), '' )->get_error_code(), 'Recording income needs an amount' );
Revenue::record( 'ads', 5000000, wp_date( 'Y-m-d' ), "SAMPLE banner {$stamp}" );
Revenue::record( 'partner', 300000, wp_date( 'Y-m-d' ), "SAMPLE Bus Co {$stamp}" );
$rev = Revenue::by_month( 12 );
$now = $rev[ wp_date( 'Y-m' ) ];
ek9( 12 === count( $rev ) && count( Revenue::sources() ) === count( $now ), '12 months × every source' );
ek9( $now['plan'] >= 1000000 + 1000000 + 25000000 && $now['verified'] >= 500000 && $now['setup'] >= 3000000, 'Plans, Verified fees and setup orders are counted' );
ek9( $now['ads'] >= 5000000 && $now['partner'] >= 300000 && $now['promotion'] >= 1500000, 'Ads, partner commissions and promotions are counted' );
ek9( $now['tour'] >= 1500000, 'Tour income counted net of refunds' );

/* ---------- WooCommerce payment of a sale ---------- */
if ( class_exists( 'WooCommerce' ) ) {
	WP_CLI::line( 'Paying a sale through WooCommerce (Paystack/Flutterwave on the live site)' );
	$ws  = Plans::buy( $h1, 'featured', 'month', $owner );
	$url = EK\Payments_Woo::sale_checkout_url( $ws );
	$ord = wc_get_order( Sales::get( $ws->id )->order_id );
	ek9( $ord && (int) $ord->get_meta( EK\Payments_Woo::META_SALE ) === (int) $ws->id && 10000.0 === (float) $ord->get_total(), 'Checkout order for ₦10,000 linked to the sale' );
	$ord->payment_complete( 'TEST-WOO-SALE' );
	ek9( 'paid' === Sales::get( $ws->id )->status && 'featured' === Plans::current( $h1 )['plan'], 'Order paid: plan activated' );
	ek9( false !== strpos( apply_filters( 'woocommerce_get_checkout_order_received_url', '', $ord ), 'section=plan' ), 'After paying, the owner returns to their Plan page' );
}

/* ---------- Clean up ---------- */
foreach ( $made as $id ) {
	wp_delete_post( $id, true );
}
$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_ads WHERE title LIKE %s", '%' . $stamp ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_partners WHERE id = %d", $pid ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_partner_clicks WHERE partner_id = %d", $pid ) );
wp_delete_user( $staff );
update_option( Settings::OPTION, $saved );
Map_Index::flush();
WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 9 checks passed.' );
