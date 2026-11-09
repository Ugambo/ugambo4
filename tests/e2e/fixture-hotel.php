<?php
/**
 * Creates an approved SAMPLE business (hotel by default) + owner for the browser tests, and prints JSON.
 * Run: wp eval-file ek-tests/e2e/fixture-hotel.php <stamp> [lat] [lng] [type]
 */
use EK\Business;
use EK\Install;

$stamp = $args[0] ?? (string) time();
$lat   = (float) ( $args[1] ?? 12.9930 );
$lng   = (float) ( $args[2] ?? 7.6050 );
$type  = sanitize_key( $args[3] ?? 'hotel' );
$names = array( 'hotel' => 'SAMPLE Durbar View Hotel', 'restaurant' => 'SAMPLE Test Kitchen', 'event-centre' => 'SAMPLE Test Event Hall' );
$pass  = 'Owner-pass-' . $stamp;
$uid   = wp_insert_user( array( 'user_login' => "hotelowner_{$stamp}", 'user_email' => "hotelowner_{$stamp}@example.test", 'user_pass' => $pass, 'role' => Install::ROLE_OWNER, 'display_name' => 'SAMPLE Hotel Owner' ) );
$lga   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$id    = Business::create(
	array(
		'name' => ( $names[ $type ] ?? 'SAMPLE Business' ) . " {$stamp}", 'type' => $type, 'lga_id' => $lga->term_id,
		'address' => 'SAMPLE address, Katsina', 'lat' => $lat, 'lng' => $lng, 'phone' => '+2348030000011', 'whatsapp' => '+2348030000011',
		'email' => "biz_{$stamp}@example.test", 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ),
		'description' => 'SAMPLE business created for automated testing. Placeholder description only, not a real business.',
	),
	$uid
);
Business::save_private( $id, array( 'owner_name' => 'SAMPLE Owner', 'cac_number' => '', 'bank_name' => 'Test Bank', 'account_name' => 'SAMPLE', 'account_number' => '0123456789' ) );
require_once ABSPATH . 'wp-admin/includes/media.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/image.php';
$photos = array();
foreach ( array( 'photo-2.jpg', 'photo-1.jpg', 'photo-3.jpg' ) as $f ) {
	$tmp = wp_tempnam( $f );
	copy( ABSPATH . 'ek-tests/e2e/fixtures/' . $f, $tmp );
	$pid = media_handle_sideload( array( 'name' => $f, 'tmp_name' => $tmp ), $id );
	if ( ! is_wp_error( $pid ) ) {
		update_post_meta( $pid, '_ek_business_photo', $id );
		$photos[] = $pid;
	}
}
Business::set_photos( $id, $photos );
wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
echo wp_json_encode( array( 'id' => $id, 'user' => "hotelowner_{$stamp}", 'pass' => $pass, 'url' => get_permalink( $id ) ) );
