<?php
/**
 * Phase 2 checks: data isolation, encryption, validation, payouts.
 * Run: wp eval-file ek-tests/phase2-security.php   (see tests/run.sh)
 * Creates its own throwaway users/businesses and deletes them at the end.
 */

use EK\Analytics;
use EK\Business;
use EK\Crypto;
use EK\Dashboard;
use EK\Money;
use EK\Photos;
use EK\Reviews;
use EK\Access;
use EK\Install;

$GLOBALS['ek_fail'] = 0;
function ek_check( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
class EK_Test_Die extends Exception {}
add_filter( 'wp_die_handler', function () { return function ( $msg ) { throw new EK_Test_Die( is_string( $msg ) ? $msg : 'died' ); }; } );

global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$lga   = get_term_by( 'name', 'Daura', 'ek_lga' );

function ek_make_owner( $stamp, $n ) {
	return wp_insert_user( array( 'user_login' => "ek_{$stamp}_{$n}", 'user_email' => "ek_{$stamp}_{$n}@example.test", 'user_pass' => 'pass-' . $stamp, 'role' => Install::ROLE_OWNER ) );
}
function ek_make_business( $owner, $lga, $name ) {
	$p = array(
		'name' => $name, 'type' => 'restaurant', 'lga_id' => $lga->term_id, 'address' => 'Test address', 'lat' => 13.03, 'lng' => 8.33,
		'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 'x@example.test', 'website' => '', 'socials' => array(),
		'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test business. ', 5 ),
	);
	$id = Business::create( $p, $owner );
	Business::save_private( $id, array( 'owner_name' => 'Owner', 'cac_number' => '', 'bank_name' => 'Test Bank', 'account_name' => 'OWNER', 'account_number' => '0123456789' ) );
	return $id;
}

$a     = ek_make_owner( $stamp, 'a' );
$b     = ek_make_owner( $stamp, 'b' );
$biz_a = ek_make_business( $a, $lga, "SAMPLE A {$stamp}" );
$biz_b = ek_make_business( $b, $lga, "SAMPLE B {$stamp}" );
$admin = get_users( array( 'role' => 'administrator', 'number' => 1 ) )[0]->ID;

WP_CLI::line( 'Ownership' );
ek_check( Business::user_can_manage( $a, $biz_a ), 'Owner A can manage business A' );
ek_check( ! Business::user_can_manage( $a, $biz_b ), 'Owner A can NOT manage business B' );
ek_check( ! Business::user_can_manage( $b, $biz_a ), 'Owner B can NOT manage business A' );
ek_check( ! Business::user_can_manage( 0, $biz_a ), 'Logged-out visitor can NOT manage anything' );
ek_check( Business::user_can_manage( $admin, $biz_b ), 'Site admin can manage any business' );
ek_check( ! Business::user_can_manage( $a, 1 ), 'Owner cannot use a non-business ID (e.g. a page)' );
ek_check( array( $biz_a ) === wp_list_pluck( Business::for_user( $a ), 'ID' ), 'Owner A\'s business list contains only business A' );

wp_set_current_user( $a );
$_GET['business'] = $biz_b;
ek_check( -1 === Dashboard::current_business(), 'Dashboard refuses ?business= of someone else' );
$_GET['business'] = $biz_a;
ek_check( $biz_a === Dashboard::current_business(), 'Dashboard opens own business' );
unset( $_GET['business'] );

// Every dashboard action, aimed at business B by owner A, must be refused before doing anything.
foreach ( array( 'dash_profile', 'dash_photos', 'dash_bank', 'dash_payout', 'dash_reply', 'dash_resubmit' ) as $action ) {
	$_SERVER['REQUEST_METHOD'] = 'POST';
	$_POST = array( 'ek_action' => $action, 'business_id' => $biz_b, '_ek_nonce' => wp_create_nonce( $action . '_' . $biz_b ), 'business_name' => 'HACKED', 'amount' => '9999' );
	$died = false;
	try {
		Dashboard::handle();
	} catch ( EK_Test_Die $e ) {
		$died = true;
	}
	ek_check( $died, "Owner A's \"{$action}\" on business B is refused" );
}
$_POST = array();
ek_check( "SAMPLE B {$stamp}" === get_the_title( $biz_b ), 'Business B unchanged after the attempts' );
ek_check( 0 === (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}ek_payouts WHERE business_id=%d", $biz_b ) ), 'No payout was created for business B' );

WP_CLI::line( 'Reviews & photos' );
$wpdb->insert( $wpdb->prefix . 'ek_reviews', array( 'business_id' => $biz_b, 'booking_id' => 900000 + wp_rand( 1, 99999 ), 'rating_overall' => 5, 'author_name' => 'SAMPLE', 'body' => 'Test', 'created_at' => current_time( 'mysql', true ) ) );
$review_b = (int) $wpdb->insert_id;
ek_check( is_wp_error( Reviews::reply( $review_b, $biz_a, 'Thanks' ) ), 'Owner A cannot reply to a review of business B' );
ek_check( true === Reviews::reply( $review_b, $biz_b, 'Thank you for visiting' ), 'Owner B can reply to their own review' );
$att = wp_insert_attachment( array( 'post_title' => 'x', 'post_mime_type' => 'image/jpeg' ), false, $biz_b );
update_post_meta( $att, '_ek_business_photo', $biz_b );
ek_check( ! Photos::owned_by( $att, $biz_a ) && Photos::owned_by( $att, $biz_b ), 'Photos belong only to their own business' );

WP_CLI::line( 'Private data' );
$profile = Business::profile( $biz_a );
ek_check( ! array_intersect( array( 'account_number', 'account_name', 'bank_name', 'cac_number', 'owner_name', 'id_doc_file' ), array_keys( $profile ) ), 'Public profile contains no private fields' );
$raw = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_business_private WHERE business_id=%d", $biz_a ) );
ek_check( false === strpos( $raw->account_number_enc, '0123456789' ) && 0 === strpos( $raw->account_number_enc, 'ek1:' ), 'Account number is stored encrypted' );
ek_check( '0123456789' === Business::private_details( $biz_a, true )['account_number'], 'Encrypted account number decrypts correctly' );
ek_check( ! isset( Business::private_details( $biz_a )['account_number'] ), 'Not decrypted unless asked' );
ek_check( '' === Crypto::decrypt( 'ek1:' . base64_encode( random_bytes( 40 ) ) ), 'Tampered ciphertext is rejected' );
ek_check( Crypto::has_dedicated_key(), 'Dedicated encryption key is configured' );
ek_check( ! isset( rest_get_server()->get_routes()['/wp/v2/ek_business'] ), 'Businesses are not exposed in the WordPress REST API' );
ek_check( Access::is_front_end_only( get_userdata( $a ) ) && ! Access::is_front_end_only( get_userdata( $admin ) ), 'Owners are front-end only; admin is not' );
ek_check( ! user_can( $a, 'upload_files' ) && ! user_can( $a, 'edit_posts' ), 'Owners have no Media Library or editing rights' );

WP_CLI::line( 'Payouts' );
$r = Money::request_payout( $biz_a, 400000, $a );
ek_check( is_wp_error( $r ) && 'min' === $r->get_error_code(), 'Payout below ₦5,000 refused' );
$r = Money::request_payout( $biz_a, 600000, $a );
ek_check( is_wp_error( $r ) && 'balance' === $r->get_error_code(), 'Payout above available balance refused' );
$wpdb->insert( $wpdb->prefix . 'ek_ledger', array( 'business_id' => $biz_a, 'entry_type' => 'earning', 'amount_kobo' => 1000000, 'status' => 'available', 'created_at' => current_time( 'mysql', true ) ) );
$r1 = Money::request_payout( $biz_a, 600000, $a );
$r2 = Money::request_payout( $biz_a, 600000, $a );
ek_check( is_int( $r1 ) && is_wp_error( $r2 ), '₦10,000 available: ₦6,000 payout OK, a second ₦6,000 refused' );
ek_check( 400000 === Money::summary( $biz_a )['requestable'], 'Remaining requestable balance is ₦4,000' );
ek_check( '₦12,500' === Money::format( 1250000 ) && 1250050 === Money::to_kobo( '12,500.50' ), 'Naira formatting and parsing' );

WP_CLI::line( 'Validation' );
ek_check( '+2348031234567' === Business::normalize_phone( '0803 123 4567' ) && '+2348031234567' === Business::normalize_phone( '+234 803 123 4567' ) && '' === Business::normalize_phone( '12345' ), 'Nigerian phone numbers normalised; junk rejected' );
list( , $e ) = Business::validate_private( array( 'owner_name' => 'Ab C', 'bank_name' => 'X Bank', 'account_name' => 'ABC', 'account_number' => '12345' ) );
ek_check( isset( $e['account_number'] ), 'Account number must be 10 digits' );
ek_check( Business::in_katsina( 12.99, 7.60 ) && ! Business::in_katsina( 6.45, 3.39 ), 'Map pin must be inside Katsina State (Lagos rejected)' );
list( , $e ) = Business::validate_profile( array( 'business_name' => 'X', 'lat' => 6.45, 'lng' => 3.39 ), true );
ek_check( isset( $e['name'], $e['type'], $e['lga_id'], $e['lat'], $e['phone'], $e['email'], $e['description'] ), 'Empty/invalid sign-up fields are all reported' );
update_post_meta( $biz_a, '_ek_hours', array( 'always' => 0, 'mon' => array( 'open' => '18:00', 'close' => '02:00' ), 'tue' => array( 'closed' => 1 ) ) );
$mon_2330 = strtotime( '2026-11-09 23:30:00 Africa/Lagos' );
$tue_0100 = strtotime( '2026-11-10 01:00:00 Africa/Lagos' );
$tue_1200 = strtotime( '2026-11-10 12:00:00 Africa/Lagos' );
ek_check( Business::is_open( $biz_a, $mon_2330 ) && Business::is_open( $biz_a, $tue_0100 ) && ! Business::is_open( $biz_a, $tue_1200 ), '"Open now" handles closing after midnight' );

WP_CLI::line( 'Analytics' );
$req = new WP_REST_Request( 'POST', '/ek/v1/track' );
$req->set_param( 'business', $biz_b );
$req->set_param( 'metric', 'view' );
wp_set_current_user( 0 );
ek_check( 404 === rest_do_request( $req )->get_status(), 'Pending (unapproved) business does not record analytics' );

// Clean up.
wp_set_current_user( $admin );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}ek_ledger WHERE business_id IN (%d,%d)", $biz_a, $biz_b ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}ek_payouts WHERE business_id IN (%d,%d)", $biz_a, $biz_b ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}ek_reviews WHERE business_id IN (%d,%d)", $biz_a, $biz_b ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}ek_business_private WHERE business_id IN (%d,%d)", $biz_a, $biz_b ) );
$wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}ek_log WHERE object_type='business' AND object_id IN (%d,%d)", $biz_a, $biz_b ) );
wp_delete_attachment( $att, true );
wp_delete_post( $biz_a, true );
wp_delete_post( $biz_b, true );
require_once ABSPATH . 'wp-admin/includes/user.php';
wp_delete_user( $a );
wp_delete_user( $b );

WP_CLI::line( $GLOBALS['ek_fail'] ? "\n{$GLOBALS['ek_fail']} check(s) FAILED" : "\nAll security checks passed" );
if ( $GLOBALS['ek_fail'] ) {
	exit( 1 );
}
