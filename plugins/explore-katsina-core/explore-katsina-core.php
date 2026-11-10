<?php
/**
 * Plugin Name:       Explore Katsina Core
 * Description:       Listings, business accounts, dashboards, bookings, map, rankings and money for Explore Katsina.
 * Version:           0.6.0
 * Requires at least: 6.4
 * Requires PHP:      8.1
 * Author:            Explore Katsina
 * Text Domain:       explore-katsina
 * Domain Path:       /languages
 * License:           GPL-2.0-or-later
 */

defined( 'ABSPATH' ) || exit;

define( 'EK_VERSION', '0.10.0' );
define( 'EK_DB_VERSION', '9' );
define( 'EK_FILE', __FILE__ );
define( 'EK_DIR', plugin_dir_path( __FILE__ ) );
define( 'EK_URL', plugin_dir_url( __FILE__ ) );

spl_autoload_register(
	static function ( $class ) {
		if ( 0 !== strpos( $class, 'EK\\' ) ) {
			return;
		}
		$name = strtolower( str_replace( array( 'EK\\', '_' ), array( '', '-' ), $class ) );
		$file = EK_DIR . 'includes/class-' . $name . '.php';
		if ( is_readable( $file ) ) {
			require $file;
		}
	}
);

register_activation_hook( __FILE__, array( 'EK\\Install', 'activate' ) );

add_action( 'plugins_loaded', array( 'EK\\Plugin', 'boot' ) );
