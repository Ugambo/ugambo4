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
