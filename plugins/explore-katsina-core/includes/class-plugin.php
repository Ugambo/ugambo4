<?php
/**
 * Boots every module of the plugin.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Plugin {

	public static function boot() {
		load_plugin_textdomain( 'explore-katsina', false, dirname( plugin_basename( EK_FILE ) ) . '/languages' );

		Install::maybe_upgrade();
		Post_Types::init();
		Rooms::init();
		Booking::init();
		Payments::init();
		Hotel_Dashboard::init();
		Restaurant_Dashboard::init();
		Halls::init();
		Venue_Dashboard::init();
		Venue_Search::init();
		Restaurant_Search::init();
		Hotel_Search::init();
		Booking_Page::init();
		Calendar::init();
		Account::init();
		Favourites::init();
		Nav::init();
		Money_Jobs::init();
		Ranking::init();
		Attractions::init();
		Stories::init();
		Gallery::init();
		Map_Index::init();
		Map_Page::init();
		Top::init();
		Sales::init();
		Plans::init();
		Services::init();
		Events::init();
		Tickets::init();
		Tours::init();
		Ads::init();
		Shop::init();
		Partners::init();
		Advertise::init();
		Access::init();
		Assets::init();
		Signup::init();
		Dashboard::init();
		Public_Profile::init();
		Analytics::init();
		Private_Files::init();
		Emails::init();

		if ( is_admin() ) {
			Admin::init();
		}

		if ( defined( 'WP_CLI' ) && WP_CLI ) {
			\WP_CLI::add_command( 'ek', CLI::class );
		}
	}
}
