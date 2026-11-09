<?php
/**
 * Phase 7 checks: commission settings and overrides, holds and releases, guest complaints,
 * payouts, monthly commission invoices (pay online / from balance / by transfer, reminders,
 * automatic pause and resume), reports.
 * Run: wp eval-file ek-tests/phase7-money.php
 */

use EK\Admin;
use EK\Availability;
use EK\Booking;
use EK\Business;
use EK\Commission;
use EK\Complaints;
use EK\Hotel;
use EK\Install;
use EK\Invoices;
use EK\Ledger;
use EK\Money;
use EK\Money_Jobs;
use EK\Payouts;
use EK\Post_Types;
use EK\Refunds;
use EK\Reports;
use EK\Rooms;
use EK\Settings;

$GLOBALS['ek_fail'] = 0;
function ek7( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
$GLOBALS['ek7_mail'] = array();
add_filter(
	'pre_wp_mail',
	function ( $r, $atts ) {
		$GLOBALS['ek7_mail'][] = array( 'to' => (array) $atts['to'], 'subject' => $atts['subject'] );
		return true;
	},
	10,
	2
);
function ek7_mailed( $needle ) {
	return (bool) array_filter( $GLOBALS['ek7_mail'], static fn( $m ) => false !== stripos( $m['subject'], $needle ) );
}

global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$tz    = Availability::tz();
$mon   = ( new DateTimeImmutable( 'monday next week', $tz ) )->modify( '+42 days' );
$d     = static fn( $n ) => $mon->modify( "+{$n} days" )->format( 'Y-m-d' );
$saved = Settings::all();
$H     = HOUR_IN_SECONDS;

function ek7_hotel( $stamp, $n, $lga ) {
	$owner = wp_insert_user( array( 'user_login' => "ek7_{$stamp}_{$n}", 'user_email' => "ek7_{$stamp}_{$n}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
	$id    = Business::create( array( 'name' => "SAMPLE Money Hotel {$n} {$stamp}", 'type' => 'hotel', 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => 12.95 + wp_rand( 0, 900 ) / 10000, 'lng' => 7.55 + wp_rand( 0, 900 ) / 10000, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => "ek7_{$stamp}_{$n}_biz@example.test", 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test hotel. ', 5 ) ), $owner );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	Business::save_private( $id, array( 'owner_name' => 'SAMPLE Owner', 'cac_number' => '', 'bank_name' => 'Test Bank', 'account_name' => 'SAMPLE HOTEL LTD', 'account_number' => '0123456789' ) );
	Hotel::save( $id, array( 'stars' => 3, 'amenities' => array(), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
	$room = Rooms::save( $id, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2000000, 'weekend_price' => 0, 'units' => 20, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array(), 'active' => true ) );
	return array( $owner, $id, $room );
}
function ek7_book( $room, $in, $out, $pay = 'full' ) {
	$b = Booking::create_hotel( array( 'room_id' => $room, 'checkin' => $in, 'checkout' => $out, 'guests' => 2, 'rooms' => 1, 'payment' => $pay, 'name' => 'SAMPLE Guest Seven', 'email' => 'guest7@example.test', 'phone' => '08030000009' ) );
	if ( is_object( $b ) && 'venue' !== $pay ) {
		Booking::mark_paid( $b->id, 'full' === $pay ? (int) $b->total_kobo : (int) $b->deposit_kobo, 'TEST-' . $b->code );
	}
	return is_object( $b ) ? Booking::get( $b->id ) : $b;
}
function ek7_stay( $b ) {
	Booking::set_status( Booking::get( $b->id ), 'checked_in', 0 );
	Booking::set_status( Booking::get( $b->id ), 'checked_out', 0 );
	return Booking::get( $b->id );
}
function ek7_net( $booking_id, $status = null ) {
	global $wpdb;
	$st = $status ? $wpdb->prepare( 'AND status = %s', $status ) : '';
	return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$wpdb->prefix}ek_ledger WHERE booking_id = %d {$st}", $booking_id ) ); // phpcs:ignore
}

list( $o1, $h1, $r1 ) = ek7_hotel( $stamp, 1, $lga );
list( $o2, $h2, $r2 ) = ek7_hotel( $stamp, 2, $lga );

/* ---------- Commission ---------- */
WP_CLI::line( 'Commission rates' );
ek7( 1250 === Admin::pct_to_bp( '12.5' ) && 5000 === Admin::pct_to_bp( '80' ) && 0 === Admin::pct_to_bp( 'abc' ), 'Rates typed as % are stored exactly and kept between 0% and 50%' );
$def = Settings::get( 'commission_bp' );
ek7( 1000 === (int) $def['hotel'] && 1000 === (int) $def['event-centre'] && 1500 === (int) $def['tour-operator'] && 0 === (int) $def['restaurant'] && 1000 === (int) $def['restaurant_orders'], 'Placeholder defaults: hotels 10%, event centres 10%, tours 15%, tables 0%, food orders 10%' );
Settings::update( array( 'commission_bp' => array_merge( $def, array( 'hotel' => 1200 ) ) ) );
$b = ek7_book( $r1, $d( 0 ), $d( 1 ) );
ek7( 1200 === (int) $b->commission_rate_bp && 240000 === (int) $b->commission_kobo, 'Changing the hotel rate to 12% applies to new bookings (₦2,400 on ₦20,000)' );
update_post_meta( $h2, '_ek_commission_bp', 500 );
$b2 = ek7_book( $r2, $d( 0 ), $d( 1 ) );
ek7( 500 === (int) $b2->commission_rate_bp && Commission::has_override( $h2 ) && ! Commission::has_override( $h1 ), 'Per-business override (5%) beats the default' );
ek7( array( 'hotel' => 500 ) === Commission::for_business( $h2 ), 'Dashboard shows the business its own rate' );
Settings::update( array( 'commission_bp' => $def ) );
delete_post_meta( $h2, '_ek_commission_bp' );
ek7( 1200 === (int) Booking::get( $b->id )->commission_rate_bp, 'Existing bookings keep the rate they were made at' );

/* ---------- Hold and release ---------- */
WP_CLI::line( 'Money on hold until 3 days after check-out' );
$p = ek7_book( $r1, $d( 2 ), $d( 4 ) ); // ₦40,000 paid online, 10% commission.
ek7( 3600000 === ek7_net( $p->id, 'on_hold' ), 'Paid ₦40,000: ₦36,000 for the hotel, on hold' );
Ledger::release_due( gmdate( 'Y-m-d H:i:s', time() + 400 * DAY_IN_SECONDS ) );
ek7( 3600000 === ek7_net( $p->id, 'on_hold' ), 'Nothing is released before check-out, however much time passes' );
$p = ek7_stay( $p );
Ledger::release_due( gmdate( 'Y-m-d H:i:s', time() + 2 * DAY_IN_SECONDS ) );
ek7( 3600000 === ek7_net( $p->id, 'on_hold' ), 'Two days after check-out: still on hold' );
$GLOBALS['ek7_mail'] = array();
$rel = Ledger::release_due( gmdate( 'Y-m-d H:i:s', time() + 3 * DAY_IN_SECONDS + $H ) );
ek7( 3600000 === ek7_net( $p->id, 'available' ) && ( $rel[ $h1 ] ?? 0 ) >= 3600000, 'Three days after check-out: ₦36,000 becomes available' );
ek7( ek7_mailed( 'available for payout' ), 'Hotel is emailed that money is available' );
ek7( 3600000 <= Money::summary( $h1 )['available'], 'Shows as available in the earnings summary' );
ek7( 'late' === Complaints::can_report( Booking::get( $p->id ) )->get_error_code(), 'Once the money is released, problems can no longer be reported through us' );

/* ---------- Complaints ---------- */
WP_CLI::line( 'Guest reports a problem → money frozen until the admin decides' );
$c = ek7_book( $r1, $d( 5 ), $d( 7 ) );
ek7( 'status' === Complaints::can_report( $c )->get_error_code(), 'Cannot report before the stay starts' );
$c = ek7_stay( $c );
ek7( true === Complaints::can_report( $c ), 'Can report after check-out' );
ek7( abs( Complaints::deadline( $c ) - ( time() + 3 * DAY_IN_SECONDS ) ) < 120, 'The reporting window closes exactly when the hotel’s money would be released (3 days after check-out)' );
ek7( 'late' === Complaints::can_report( $c, Complaints::deadline( $c ) + 60 )->get_error_code(), 'Not after that' );
ek7( 'message' === Complaints::report( $c, 'Bad' )->get_error_code(), 'A few words are not enough' );
$GLOBALS['ek7_mail'] = array();
$cid = Complaints::report( $c, 'SAMPLE: the air conditioning did not work for both nights.' );
ek7( is_int( $cid ) && 3600000 === ek7_net( $c->id, 'frozen' ), 'Report saved; the hotel’s ₦36,000 is frozen' );
ek7( ek7_mailed( 'We received your report' ) && ek7_mailed( 'reported a problem' ) && ek7_mailed( 'Complaint:' ), 'Guest, hotel and admin are emailed' );
Ledger::release_due( gmdate( 'Y-m-d H:i:s', time() + 30 * DAY_IN_SECONDS ) );
ek7( 3600000 === ek7_net( $c->id, 'frozen' ), 'Frozen money is not released by the hourly job' );
ek7( 'exists' === Complaints::can_report( Booking::get( $c->id ) )->get_error_code(), 'One report per booking' );
ek7( 'amount' === Complaints::resolve( $cid, 'refund', 5000000, '', 1 )->get_error_code(), 'Cannot refund more than the guest paid' );
$GLOBALS['ek7_mail'] = array();
ek7( true === Complaints::resolve( $cid, 'refund', 1000000, 'Partial refund for the AC problem.', 1 ), 'Admin refunds ₦10,000 of ₦40,000' );
$rf = Refunds::for_booking( $c->id );
ek7( $rf && 1000000 === (int) $rf[0]->amount_kobo, 'Refund recorded (sent automatically in test mode)' );
ek7( 2700000 === ek7_net( $c->id, 'available' ) && 0 === ek7_net( $c->id, 'frozen' ), 'Hotel keeps ₦30,000 minus 10% = ₦27,000, released at once' );
ek7( ek7_mailed( 'Update on your report' ) && ek7_mailed( 'resolved' ), 'Guest and hotel told the decision' );
ek7( 'closed' === Complaints::resolve( $cid, 'release', 0, '', 1 )->get_error_code(), 'A decision cannot be made twice' );
$c2 = ek7_stay( ek7_book( $r1, $d( 8 ), $d( 9 ) ) );
$c2id = Complaints::report( $c2, 'SAMPLE: the room was not cleaned on arrival, very dusty.' );
Complaints::resolve( $c2id, 'release', 0, 'Hotel showed photos; no refund.', 1 );
ek7( 1800000 === ek7_net( $c2->id, 'available' ), 'Complaint rejected: the hotel’s ₦18,000 is released' );
$ns = ek7_book( $r1, $d( 9 ), $d( 10 ) );
Booking::set_status( $ns, 'no_show', 0 );
ek7( true === Complaints::can_report( Booking::get( $ns->id ), time() + 5 * $H ), 'A guest marked "no-show" can dispute it' );

/* ---------- Payouts ---------- */
WP_CLI::line( 'Payouts' );
$s0 = Money::summary( $h1 );
ek7( 'min' === Money::request_payout( $h1, 100000, $o1 )->get_error_code(), 'Minimum payout ₦5,000' );
ek7( 'balance' === Money::request_payout( $h1, $s0['requestable'] + 100, $o1 )->get_error_code(), 'Cannot request more than is available' );
$GLOBALS['ek7_mail'] = array();
$po = Money::request_payout( $h1, 3000000, $o1 );
ek7( is_int( $po ) && ek7_mailed( 'Payout request' ), 'Hotel requests ₦30,000; admin is emailed' );
ek7( $s0['requestable'] - 3000000 === Money::summary( $h1 )['requestable'], 'Requested money can’t be requested twice' );
$pp   = Payouts::get( $po );
$bank = Payouts::bank( $pp );
ek7( '0123456789' === $bank['account_number'] && 'SAMPLE HOTEL LTD' === $bank['account_name'], 'Admin sees the bank account saved with the request' );
ek7( (bool) $wpdb->get_var( $wpdb->prepare( "SELECT 1 FROM {$wpdb->prefix}ek_log WHERE action = 'bank_viewed' AND object_id = %d", $h1 ) ), 'Viewing bank details is logged' );
ek7( true === Payouts::approve( $po, 1 ) && 'approved' === Payouts::get( $po )->status, 'Admin approves' );
ek7( 'reference' === Payouts::mark_paid( $po, '', 1 )->get_error_code(), 'Marking paid needs the transfer reference' );
$GLOBALS['ek7_mail'] = array();
ek7( true === Payouts::mark_paid( $po, 'TRF-7788', 1 ), 'Admin marks it paid' );
$s1 = Money::summary( $h1 );
ek7( $s0['available'] - 3000000 === $s1['available'] && $s0['paid_out'] + 3000000 === $s1['paid_out'], 'Available goes down by ₦30,000; paid out goes up by ₦30,000' );
ek7( ek7_mailed( 'sent' ), 'Hotel emailed with the reference' );
ek7( is_wp_error( Payouts::mark_paid( $po, 'TRF-AGAIN', 1 ) ) && $s1['available'] === Money::summary( $h1 )['available'], 'Cannot be paid twice' );
$po2 = Money::request_payout( $h1, 500000, $o1 );
ek7( 'reason' === Payouts::reject( $po2, '', 1 )->get_error_code(), 'Rejecting needs a reason' );
Payouts::reject( $po2, 'Account name does not match the business.', 1 );
ek7( 'rejected' === Payouts::get( $po2 )->status && $s1['requestable'] === Money::summary( $h1 )['requestable'], 'Rejected: the money is requestable again' );

/* ---------- Invoices ---------- */
WP_CLI::line( 'Monthly commission invoices (pay at hotel)' );
$now       = new DateTimeImmutable( 'now', $tz );
$last      = $now->modify( 'first day of last month' );
$month     = $last->format( 'Y-m' );
$move      = static function ( $b, $start, $end ) use ( $wpdb ) {
	$wpdb->update( $wpdb->prefix . 'ek_bookings', array( 'start_date' => $start, 'end_date' => $end ), array( 'id' => $b->id ) );
};
$v1 = ek7_stay( ek7_book( $r2, $d( 11 ), $d( 13 ), 'venue' ) );           // ₦40,000 paid at hotel → ₦4,000 owed.
$v2 = ek7_stay( ek7_book( $r2, $d( 13 ), $d( 14 ), 'venue' ) );           // ₦20,000 → ₦2,000.
$v3 = ek7_book( $r2, $d( 14 ), $d( 15 ), 'venue' );                       // No-show: nothing owed.
Booking::set_status( $v3, 'no_show', 0 );
$v4 = ek7_stay( ek7_book( $r2, $d( 15 ), $d( 16 ), 'deposit' ) );         // Commission taken from the deposit.
$v5 = ek7_stay( ek7_book( $r2, $d( 16 ), $d( 17 ), 'venue' ) );           // Stays in this month → next invoice.
$move( $v1, $last->modify( '+2 days' )->format( 'Y-m-d' ), $last->modify( '+4 days' )->format( 'Y-m-d' ) );
$move( $v2, $last->modify( '+9 days' )->format( 'Y-m-d' ), $last->modify( '+10 days' )->format( 'Y-m-d' ) );
$move( $v3, $last->modify( '+11 days' )->format( 'Y-m-d' ), $last->modify( '+12 days' )->format( 'Y-m-d' ) );
$move( $v4, $last->modify( '+12 days' )->format( 'Y-m-d' ), $last->modify( '+13 days' )->format( 'Y-m-d' ) );
$move( $v5, $now->format( 'Y-m-01' ), $now->format( 'Y-m-01' ) );
$GLOBALS['ek7_mail'] = array();
$made = Invoices::generate( $month );
$inv  = null;
foreach ( $made as $iid ) {
	$x = Invoices::get( $iid );
	if ( (int) $x->business_id === $h2 ) {
		$inv = $x;
	}
}
ek7( $inv && 600000 === (int) $inv->amount_kobo, 'Invoice for last month: ₦4,000 + ₦2,000 = ₦6,000 (no-shows and deposit bookings not charged)' );
ek7( $inv && 2 === count( Invoices::lines( $inv->id ) ), 'Lists the two bookings it covers' );
ek7( $inv && sprintf( 'INV-%s-%05d', str_replace( '-', '', $month ), $h2 ) === $inv->number, 'Numbered INV-YYYYMM-business' );
ek7( $inv && abs( strtotime( $inv->due_at . ' UTC' ) - ( time() + 30 * DAY_IN_SECONDS ) ) < 120, 'Due in 30 days' );
ek7( ek7_mailed( 'commission invoice' ), 'Hotel is emailed the invoice' );
ek7( ! array_filter( Invoices::generate( $month ), static fn( $i ) => (int) Invoices::get( $i )->business_id === $h2 ), 'Running it again does not create a second invoice' );
$still = wp_list_pluck( Invoices::owed( $now->format( 'Y-m-d' ), $h2 ), 'id' );
ek7( in_array( (string) $v5->id, array_map( 'strval', $still ), true ) && 1 === count( $still ), 'This month’s stay waits for next month’s invoice' );

WP_CLI::line( 'Paying invoices' );
ek7( 'forbidden' === Invoices::pay_from_balance( $inv->id, $h1, $o1 )->get_error_code(), 'Another business cannot pay (or see) this invoice' );
ek7( 'balance' === Invoices::pay_from_balance( $inv->id, $h2, $o2 )->get_error_code(), 'Not enough balance → asked to pay online' );
ek7( true === Invoices::pay_online( $inv->id, $h2 ) && 'paid' === Invoices::get( $inv->id )->status, 'Paid online (test mode)' );
ek7( 'invoice' === Invoices::pay_online( $inv->id, $h2 )->get_error_code(), 'Cannot pay twice' );

WP_CLI::line( 'Reminder, automatic pause, automatic resume' );
$wpdb->delete( $wpdb->prefix . 'ek_invoices', array( 'number' => sprintf( 'INV-%s-%05d', $now->format( 'Ym' ), $h2 ) ) );
$made2 = Invoices::generate( $now->format( 'Y-m' ) );
$inv2  = null;
foreach ( $made2 as $iid ) {
	if ( (int) Invoices::get( $iid )->business_id === $h2 ) {
		$inv2 = Invoices::get( $iid );
	}
}
ek7( $inv2 && 200000 === (int) $inv2->amount_kobo, 'Next invoice picks up the later stay (₦2,000)' );
$GLOBALS['ek7_mail'] = array();
Invoices::enforce( strtotime( $inv2->due_at . ' UTC' ) - 6 * DAY_IN_SECONDS );
ek7( ek7_mailed( 'due in 7 days' ) && 1 === (int) Invoices::get( $inv2->id )->reminded, 'Reminder 7 days before the due date' );
$GLOBALS['ek7_mail'] = array();
Invoices::enforce( strtotime( $inv2->due_at . ' UTC' ) - 5 * DAY_IN_SECONDS );
ek7( ! ek7_mailed( 'due in 7 days' ), 'Only one reminder' );
Invoices::enforce( strtotime( $inv2->due_at . ' UTC' ) + 60 );
ek7( Post_Types::STATUS_PAUSED === get_post_status( $h2 ) && 'invoice' === get_post_meta( $h2, Invoices::META_PAUSED, true ), 'Unpaid 30 days: listing paused automatically' );
ek7( ek7_mailed( 'paused' ), 'Hotel and admin are told' );
$wpdb->update( $wpdb->prefix . 'ek_invoices', array( 'due_at' => gmdate( 'Y-m-d H:i:s', time() - 60 ) ), array( 'id' => $inv2->id ) );
Invoices::mark_paid( $inv2->id, 'transfer', 'TRF-INV-1', 1 );
ek7( 'publish' === get_post_status( $h2 ) && ! get_post_meta( $h2, Invoices::META_PAUSED, true ), 'Paid by transfer (marked by admin): listing back on automatically' );
wp_update_post( array( 'ID' => $h2, 'post_status' => Post_Types::STATUS_PAUSED ) ); // Paused by the admin for another reason.
ek7( false === Invoices::maybe_resume( $h2 ) && Post_Types::STATUS_PAUSED === get_post_status( $h2 ), 'A listing the admin paused is not switched back on by an invoice payment' );
wp_update_post( array( 'ID' => $h2, 'post_status' => 'publish' ) );

WP_CLI::line( 'Paying from the earnings balance' );
$v6 = ek7_stay( ek7_book( $r1, $d( 18 ), $d( 19 ), 'venue' ) );
$move( $v6, $last->modify( '+20 days' )->format( 'Y-m-d' ), $last->modify( '+21 days' )->format( 'Y-m-d' ) );
$wpdb->delete( $wpdb->prefix . 'ek_invoices', array( 'number' => sprintf( 'INV-%s-%05d', str_replace( '-', '', $month ), $h1 ) ) );
$inv3 = null;
foreach ( Invoices::generate( $month ) as $iid ) {
	if ( (int) Invoices::get( $iid )->business_id === $h1 ) {
		$inv3 = Invoices::get( $iid );
	}
}
$before = Money::summary( $h1 );
ek7( $inv3 && true === Invoices::pay_from_balance( $inv3->id, $h1, $o1 ), 'Hotel One pays its invoice from its available earnings' );
ek7( $inv3 && $before['available'] - (int) $inv3->amount_kobo === Money::summary( $h1 )['available'] && 'balance' === Invoices::get( $inv3->id )->method, 'Balance reduced by the invoice amount' );

WP_CLI::line( 'Hourly job' );
update_option( 'ek_invoiced_month', $month );
$r = Money_Jobs::run();
ek7( array() === $r['invoices'], 'Last month already invoiced: the job creates nothing new' );
ek7( (bool) wp_next_scheduled( Money_Jobs::HOOK ), 'Hourly money job is scheduled' );

/* ---------- Reports ---------- */
WP_CLI::line( 'Reports' );
$pd  = Reports::period( '', '' );
$sum = Reports::summary( $pd );
ek7( $sum['commission_online'] > 0 && $sum['received_online'] > 0 && $sum['paid_out'] >= 3000000, 'Commission earned, payments received and payouts are reported' );
$per = Reports::per_business();
ek7( isset( $per[ $h1 ] ) && $per[ $h1 ]['available'] === Money::summary( $h1 )['available'], 'Amount owed per business matches its dashboard' );
list( $o3, $h3, $r3 ) = ek7_hotel( $stamp, 3, $lga );
for ( $i = 0; $i < 5; $i++ ) {
	$x = ek7_book( $r3, $d( 20 + $i ), $d( 21 + $i ), 'venue' );
	Booking::set_status( $x, $i < 2 ? 'no_show' : 'checked_out', 0 );
}
$nsr = Reports::no_shows( Reports::period( $d( 0 ), $d( 30 ) ) );
$row = array_values( array_filter( $nsr['rows'], static fn( $r ) => $r['business_id'] === $h3 ) );
ek7( $row && 2 === $row[0]['no_show'] && 5 === $row[0]['finished'] && $row[0]['flag'], 'Hotel with 2 no-shows in 5 stays (40%) is flagged' );
$csv = Reports::csv( Reports::period( $now->format( 'Y-m-d' ), $now->format( 'Y-m-d' ) ) );
ek7( 0 === strpos( $csv, 'Code,Type,Business' ) && false !== strpos( $csv, $p->code ), 'CSV download lists the bookings' );
wp_update_post( array( 'ID' => $h3, 'post_title' => '=HYPERLINK("http://x")' ) );
ek7( false === strpos( Reports::csv( Reports::period( $now->format( 'Y-m-d' ), $now->format( 'Y-m-d' ) ) ), ',=HYPERLINK' ), 'Spreadsheet formulas in names are neutralised' );
wp_update_post( array( 'ID' => $h3, 'post_title' => "SAMPLE Money Hotel 3 {$stamp}" ) );

/* ---------- WooCommerce invoice payment ---------- */
if ( class_exists( 'WooCommerce' ) ) {
	WP_CLI::line( 'WooCommerce: invoice paid through an order' );
	$v7 = ek7_stay( ek7_book( $r3, $d( 26 ), $d( 27 ), 'venue' ) );
	$move( $v7, $last->modify( '+5 days' )->format( 'Y-m-d' ), $last->modify( '+6 days' )->format( 'Y-m-d' ) );
	$wpdb->delete( $wpdb->prefix . 'ek_invoices', array( 'number' => sprintf( 'INV-%s-%05d', str_replace( '-', '', $month ), $h3 ) ) );
	$i4 = null;
	foreach ( Invoices::generate( $month ) as $iid ) {
		if ( (int) Invoices::get( $iid )->business_id === $h3 ) {
			$i4 = Invoices::get( $iid );
		}
	}
	$url   = $i4 ? EK\Payments_Woo::invoice_checkout_url( $i4 ) : '';
	$order = $i4 ? wc_get_order( Invoices::get( $i4->id )->order_id ) : null;
	ek7( $order && (int) $order->get_meta( EK\Payments_Woo::META_INVOICE ) === (int) $i4->id && abs( (float) $order->get_total() * 100 - (int) $i4->amount_kobo ) < 1, 'Checkout order created for the invoice amount' );
	if ( $order ) {
		$order->payment_complete( 'TEST-WOO-INV' );
		ek7( 'paid' === Invoices::get( $i4->id )->status && 'gateway' === Invoices::get( $i4->id )->method, 'When the order is paid, the invoice is marked paid' );
		ek7( 'completed' === wc_get_order( $order->get_id() )->get_status(), 'Invoice orders go straight to "completed" (nothing to ship)' );
	}
}

/* ---------- Clean up ---------- */
update_option( EK\Settings::OPTION, $saved );
WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 7 checks passed.' );
