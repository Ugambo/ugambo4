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
			'invoice_due_days'      => 30, // Phase 7: unpaid invoices pause the listing after this many days.
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
