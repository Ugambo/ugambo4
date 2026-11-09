<?php
/**
 * Gives the Phase 6 browser-test businesses their settings: a hotel room (moderate policy, online payment)
 * and restaurant opening times. Run: wp eval-file ek-tests/e2e/fixture-phase6.php <hotel_id> <restaurant_id>
 */
use EK\Hotel;
use EK\Restaurant;
use EK\Rooms;

$hotel = (int) ( $args[0] ?? 0 );
$rest  = (int) ( $args[1] ?? 0 );
Hotel::save( $hotel, array( 'stars' => 3, 'amenities' => array( 'wifi', 'parking' ), 'checkin' => '14:00', 'checkout' => '12:00', 'house_rules' => '', 'policy' => 'moderate', 'policy_note' => '', 'pay_full' => true, 'pay_deposit' => true, 'deposit_pct' => 30, 'pay_at_venue' => true ) );
$room = Rooms::save( $hotel, 0, array( 'name' => 'Standard', 'description' => '', 'price' => 2500000, 'weekend_price' => 0, 'units' => 3, 'max_guests' => 2, 'bed' => 'double', 'size' => 20, 'amenities' => array( 'ac' ), 'active' => true ) );
Restaurant::save( $rest, array_merge( Restaurant::settings( $rest ), array( 'cuisines' => array( 'hausa' ), 'price_level' => 2, 'capacity' => 20, 'slot_minutes' => 60, 'max_party' => 8, 'min_notice_hours' => 0 ) ) );
echo wp_json_encode( array( 'room' => $room ) );
