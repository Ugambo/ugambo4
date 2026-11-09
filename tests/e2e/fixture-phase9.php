<?php
/**
 * Phase 9 browser-test data: a SAMPLE event with tickets, a SAMPLE tour with a date, a SAMPLE banner ad,
 * a SAMPLE partner and a check-in staff account.
 * Run: wp eval-file ek-tests/e2e/fixture-phase9.php <stamp>
 */
use EK\Ads;
use EK\Events;
use EK\Partners;
use EK\Tickets;
use EK\Tours;

$stamp = $args[0];
$tz    = EK\Availability::tz();
$ev    = wp_insert_post( array( 'post_type' => Events::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Music Night {$stamp}", 'post_content' => 'SAMPLE event created for automated testing. Not a real event.' ) );
update_post_meta( $ev, '_ek_start', ( new DateTimeImmutable( '+20 days', $tz ) )->format( 'Y-m-d' ) . ' 18:00' );
update_post_meta( $ev, '_ek_venue', 'SAMPLE Hall' );
Tickets::save_types( $ev, array( array( 'name' => 'Regular', 'price' => '3000', 'quantity' => 50 ), array( 'name' => 'VIP', 'price' => '15000', 'quantity' => 5 ) ) );
$tour = wp_insert_post( array( 'post_type' => Tours::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Old City Walk {$stamp}", 'post_content' => 'SAMPLE tour created for automated testing. Not a real tour description.' ) );
update_post_meta( $tour, '_ek_price_kobo', 1200000 );
update_post_meta( $tour, '_ek_group_size', 8 );
update_post_meta( $tour, '_ek_pickup', 'SAMPLE pickup point' );
update_post_meta( $tour, '_ek_duration', 'SAMPLE 4 hours' );
Tours::save_departures( $tour, array( array( 'date' => ( new DateTimeImmutable( '+12 days', $tz ) )->format( 'Y-m-d' ), 'time' => '08:00' ) ) );
global $wpdb;
$img = (int) $wpdb->get_var( "SELECT ID FROM {$wpdb->posts} WHERE post_type = 'attachment' AND post_mime_type LIKE 'image/%' ORDER BY ID DESC LIMIT 1" );
$wpdb->query( "UPDATE {$wpdb->prefix}ek_ads SET active = 0 WHERE title LIKE 'SAMPLE%'" );
$ad = Ads::save( array( 'title' => "SAMPLE Banner {$stamp}", 'advertiser' => 'SAMPLE Advertiser', 'zone' => 'search', 'image_id' => $img, 'alt_text' => 'SAMPLE advert', 'link_url' => 'https://example.com/sample-ad', 'active' => 1 ) );
$pa = Partners::save( array( 'name' => "SAMPLE Car Hire {$stamp}", 'slug' => "sample-car-{$stamp}", 'category' => 'car_hire', 'url' => 'https://example.com/?ref=explorekatsina', 'active' => 1 ) );
$pass  = 'Staff-pass-' . $stamp;
$staff = wp_insert_user( array( 'user_login' => "staff_{$stamp}", 'user_email' => "staff_{$stamp}@example.test", 'user_pass' => $pass, 'role' => Tickets::ROLE ) );
echo wp_json_encode( array( 'event' => $ev, 'event_url' => get_permalink( $ev ), 'tour' => $tour, 'tour_url' => get_permalink( $tour ), 'ad' => $ad, 'partner' => "sample-car-{$stamp}", 'staff' => "staff_{$stamp}", 'staff_pass' => $pass ) );
