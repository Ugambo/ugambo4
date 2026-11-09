<?php
/**
 * Site-wide settings controlled by the site owner (wp-admin → Explore Katsina → Settings).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Settings {

	const OPTION = 'ek_settings';

	public static function defaults() {
		return array(
			'notify_email'          => get_option( 'admin_email' ),
			'agreement_version'     => '2026-11-draft-1',
			'min_payout_kobo'       => 500000, // ₦5,000.
			'min_reviews_for_rank'  => 3,
			'max_photos_basic'      => 8,
			'max_photo_mb'          => 5,
			'food_ordering_enabled' => 0, // Phase 4: built but OFF.
			'invoice_due_days'      => 30,
			// Phase 8 ranking settings (explained in plain language on the Settings screen).
			'rank_prior_reviews'    => 10,  // "Pretend average reviews" every business starts with.
			'rank_half_life_months' => 12,  // A review counts half as much after this many months.
			'rank_weight_rating'    => 70,
			'rank_weight_bookings'  => 15,
			'rank_weight_response'  => 15,
			'rank_bookings_full'    => 50,  // Completed bookings a year that earn full marks for activity.
			'rank_top_percent'      => 10,  // "Top Rated" badge: top 10% of its type.
			'rank_rising_points'    => 5,
			// Phase 9 prices (kobo). ALL PLACEHOLDERS: set real prices before launch.
			'price_featured_month'  => 1000000,  // ₦10,000.
			'price_featured_year'   => 10000000, // ₦100,000.
			'price_premium_month'   => 2500000,  // ₦25,000.
			'price_premium_year'    => 25000000, // ₦250,000.
			'price_verified'        => 500000,   // ₦5,000 one-time application.
			'price_setup_basic'     => 1500000,  // ₦15,000 listing setup from your information.
			'price_setup_photos'    => 3000000,  // ₦30,000 with a photo visit.
			'price_promo_7'         => 1500000,  // ₦15,000 event promotion, 7 days.
			'price_promo_30'        => 4000000,  // ₦40,000 event promotion, 30 days.
			'max_photos_featured'   => 20,
			'max_photos_premium'    => 40,
			'tour_cancel_hours'     => 48,       // Own tours: full refund until this many hours before departure.
			'adsense_enabled'       => 0,        // Google AdSense: OFF until you add your code.
			'adsense_client'        => '',
			'adsense_slots'         => array(),
			'shop_external_url'     => '',       // Send shop buyers to an external store instead (empty = sell here).
			'media_kit_id'          => 0,   // "Rising": score up at least this many points (of 100) in 90 days. // Phase 7: unpaid invoices pause the listing after this many days.
			// Commission placeholders (Phase 7). Basis points: 1000 = 10%.
			'commission_bp'         => array(
				'hotel'             => 1000,
				'event-centre'      => 1000,
				'tour-operator'     => 1500,
				'restaurant'        => 0,
				'restaurant_orders' => 1000,
			),
			'messaging_whatsapp'    => 0, // Hooks ready, OFF by default.
			'messaging_sms'         => 0,
		);
	}

	public static function ensure_defaults() {
		$current = get_option( self::OPTION );
		if ( ! is_array( $current ) ) {
			add_option( self::OPTION, self::defaults(), '', true );
			return;
		}
		update_option( self::OPTION, array_merge( self::defaults(), $current ) );
	}

	public static function all() {
		$value = get_option( self::OPTION );
		return array_merge( self::defaults(), is_array( $value ) ? $value : array() );
	}

	public static function get( $key ) {
		$all = self::all();
		return $all[ $key ] ?? null;
	}

	public static function update( array $changes ) {
		update_option( self::OPTION, array_merge( self::all(), $changes ) );
	}
}
