<?php
/**
 * WP-CLI commands: `wp ek …`
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class CLI {

	/**
	 * Create/upgrade tables, roles, LGAs, business types and pages. Safe to re-run.
	 *
	 * ## EXAMPLES
	 *     wp ek install
	 */
	public function install() {
		Install::install();
		flush_rewrite_rules( false );
		\WP_CLI::success( 'Explore Katsina installed / upgraded.' );
	}

	/**
	 * Approve a pending business.
	 *
	 * <id>
	 * : Business ID.
	 */
	public function approve( $args ) {
		$id = (int) $args[0];
		if ( ! Business::get( $id ) ) {
			\WP_CLI::error( 'Business not found.' );
		}
		Admin::set_status( $id, 'publish', 'business_approved', 'Approved from the command line', 'approved' );
		\WP_CLI::success( "Business {$id} approved." );
	}

	/**
	 * Show counts of businesses by status.
	 */
	/**
	 * Run the hourly money job now: release held money, issue last month's invoices
	 * (on/after the 1st), send invoice reminders, pause listings with overdue invoices.
	 *
	 * ## EXAMPLES
	 *     wp ek money-tick
	 *
	 * @subcommand money-tick
	 */
	public function money_tick() {
		$r = Money_Jobs::run();
		\WP_CLI::success( sprintf( 'Released money for %d business(es); created %d invoice(s).', count( $r['released'] ), count( $r['invoices'] ) ) );
	}

	/**
	 * Create commission invoices for one month (safe to repeat).
	 *
	 * <month>
	 * : Month as YYYY-MM.
	 *
	 * ## EXAMPLES
	 *     wp ek invoices 2026-10
	 */
	public function invoices( $args ) {
		if ( ! preg_match( '/^\d{4}-\d{2}$/', $args[0] ?? '' ) ) {
			\WP_CLI::error( 'Give the month as YYYY-MM.' );
		}
		$made = Invoices::generate( $args[0] );
		\WP_CLI::success( sprintf( 'Created %d invoice(s).', count( $made ) ) );
	}

	/**
	 * Recalculate today's rankings now (normally runs every night) and refresh the map.
	 *
	 * ## EXAMPLES
	 *     wp ek rank
	 */
	public function rank() {
		$n = Ranking::run();
		foreach ( $n as $type => $count ) {
			\WP_CLI::line( sprintf( '%s: %d scored', $type, $count ) );
		}
		\WP_CLI::success( 'Rankings updated.' );
	}

	/**
	 * Rebuild the map index (every pin on the Katsina Map).
	 *
	 * @subcommand map-index
	 */
	public function map_index() {
		\WP_CLI::success( sprintf( 'Map index rebuilt: %d pins.', Map_Index::rebuild() ) );
	}

	/**
	 * Import the researched guide content: attractions, festivals, "Plan your trip" pages and
	 * draft stories (from the plugin's content/guide folder), with Commons photos and credits.
	 * Re-run safe: only adds what is missing, unless --update.
	 *
	 * ## OPTIONS
	 * [--media=<dir>]
	 * : Folder with downloaded Commons photos and credits.json. Default: ek-sample-data/media in the site root.
	 *
	 * [--update]
	 * : Overwrite guide items with the text in content/guide (your wp-admin edits to them are replaced).
	 *
	 * [--yes]
	 * : Skip the confirmation question for --update.
	 *
	 * ## EXAMPLES
	 *     wp ek import-guide
	 *
	 * @subcommand import-guide
	 */
	public function import_guide( $args, $assoc ) {
		$media = $assoc['media'] ?? ABSPATH . 'ek-sample-data/media';
		if ( ! empty( $assoc['update'] ) ) {
			\WP_CLI::confirm( 'Replace the text of guide items with the versions in content/guide? Edits made in wp-admin to those items will be lost.', $assoc );
		}
		$r = ( new Guide_Import( is_dir( $media ) ? $media : '', ! empty( $assoc['update'] ) ) )->run();
		\WP_CLI::success( sprintf( 'Guide content: %d created, %d updated, %d already there, %d photos added.', $r['created'], $r['updated'], $r['skipped'], $r['photos'] ) );
	}

	/**
	 * Set up English and Hausa (Polylang): languages, Hausa copies of the main pages marked
	 * "Needs Hausa translation", and Hausa menus. Re-run safe.
	 *
	 * ## EXAMPLES
	 *     wp ek languages
	 */
	public function languages() {
		$r = Languages::setup();
		if ( is_wp_error( $r ) ) {
			\WP_CLI::error( $r->get_error_message() );
		}
		\WP_CLI::success( sprintf( 'Languages: %d added, %d Hausa pages created (marked "Needs Hausa translation"), %d Hausa menus.', $r['languages'], $r['copies'], $r['menus'] ) );
	}

	/**
	 * Set up the free helper plugins (SEO, security, backups, cache, images, WhatsApp, forms, newsletter,
	 * email). Each is set up once; changes you make later in wp-admin are kept.
	 *
	 * @subcommand plugins-setup
	 */
	public function plugins_setup() {
		foreach ( Integrations::setup() as $plugin => $what ) {
			\WP_CLI::line( str_pad( $plugin, 12 ) . $what );
		}
		\WP_CLI::success( 'Plugins set up.' );
	}

	/**
	 * Get this site ready to be exported to a real host (Phase 15). Changes THIS copy:
	 *  - creates an administrator account for the owner (a strong password is printed once) and removes
	 *    the local "admin" account;
	 *  - newsletter email goes out the normal WordPress way (not to the local test inbox);
	 *  - search engines are asked not to index the site until launch (Settings → Reading);
	 *  - local logs, caches and backups are removed.
	 *
	 * ## OPTIONS
	 * [--user=<login>]
	 * : The owner's administrator login. Default: explorekatsina_admin
	 * [--yes]
	 * : Do not ask for confirmation.
	 *
	 * @subcommand prepare-export
	 */
	public function prepare_export( $args, $assoc ) {
		\WP_CLI::confirm( 'This changes this copy of the site for export (new admin account, local admin removed). Continue?', $assoc );
		require_once ABSPATH . 'wp-admin/includes/user.php';
		$login = sanitize_user( $assoc['user'] ?? 'explorekatsina_admin', true );
		$pass  = wp_generate_password( 20, true, false );
		$uid   = username_exists( $login );
		if ( $uid ) {
			wp_set_password( $pass, $uid );
		} else {
			$uid = wp_insert_user( array( 'user_login' => $login, 'user_pass' => $pass, 'user_email' => 'info@explorekatsina.com.ng', 'display_name' => 'Explore Katsina', 'role' => 'administrator' ) );
			if ( is_wp_error( $uid ) ) {
				\WP_CLI::error( $uid->get_error_message() );
			}
		}
		foreach ( get_users( array( 'role' => 'administrator', 'fields' => 'ID' ) ) as $other ) {
			if ( (int) $other !== (int) $uid ) {
				wp_delete_user( (int) $other, (int) $uid ); // Their content is kept and given to the new account.
			}
		}
		update_option( 'admin_email', 'info@explorekatsina.com.ng' );
		Settings::update( array( 'notify_email' => 'info@explorekatsina.com.ng' ) ); // Admin notices (PLACEHOLDER until the owner sets theirs).
		if ( class_exists( '\MailPoet\Settings\SettingsController' ) ) {
			$s = \MailPoet\Settings\SettingsController::getInstance();
			$s->set( 'mta_group', 'website' );
			$s->set( 'mta', array( 'method' => 'PHPMail', 'frequency' => array( 'emails' => 25, 'interval' => 5 ) ) );
		}
		update_option( 'blog_public', 0 );
		delete_transient( 'ek_rules_checked' );
		Integrations::clear_page_cache();
		foreach ( array( WP_CONTENT_DIR . '/debug.log' ) as $f ) {
			if ( file_exists( $f ) ) {
				wp_delete_file( $f );
			}
		}
		foreach ( (array) glob( WP_CONTENT_DIR . '/updraft/backup_*' ) as $f ) {
			wp_delete_file( $f );
		}
		\WP_CLI::success( "Ready to export. Owner login: {$login}  Password: {$pass}  (shown once: keep it safe, change it after the first login)" );
	}

	/**
	 * Write the security and browser-caching rules again (.htaccess, uploads folder). Safe to re-run.
	 */
	public function security() {
		\WP_CLI::success( Security::setup() );
	}

	/**
	 * Save the sizes of existing photos as WebP (smaller files). New uploads are WebP already.
	 *
	 * ## OPTIONS
	 * [--force]
	 * : Redo photos that are WebP already (e.g. after changing the quality).
	 */
	public function webp( $args, $assoc ) {
		\WP_CLI::success( sprintf( '%d photos converted to WebP.', Integrations::convert_library( 0, ! empty( $assoc['force'] ) ) ) );
	}

	public function status() {
		$c = wp_count_posts( Post_Types::BUSINESS );
		foreach ( array( 'pending', 'publish', Post_Types::STATUS_PAUSED, Post_Types::STATUS_REJECTED ) as $s ) {
			\WP_CLI::line( str_pad( Business::status_label( $s ), 24 ) . (int) ( $c->$s ?? 0 ) );
		}
		\WP_CLI::line( 'Encryption key set: ' . ( Crypto::has_dedicated_key() ? 'yes' : 'NO' ) );
	}

	/**
	 * Create the SAMPLE demonstration data (businesses, rooms, menus, halls, reviews, bookings in every
	 * status, tours, a ticketed event, shop products and a digital guide). Remove it with delete-sample.
	 *
	 * ## OPTIONS
	 * [--media=<dir>]
	 * : Folder with the royalty-free sample photos and credits.json. Default: ek-sample-data/media in the site root.
	 *
	 * @subcommand sample-data
	 */
	public function sample_data( $args, $assoc ) {
		$media = $assoc['media'] ?? ABSPATH . 'ek-sample-data/media';
		$r     = Sample_Data::generate( is_dir( $media ) ? $media : '' );
		if ( is_wp_error( $r ) ) {
			\WP_CLI::warning( $r->get_error_message() );
			return;
		}
		foreach ( $r as $k => $n ) {
			\WP_CLI::line( str_pad( $k, 12 ) . $n );
		}
		\WP_CLI::success( 'SAMPLE data created. Delete it any time with: wp ek delete-sample --yes' );
	}

	/**
	 * Delete all SAMPLE data: businesses whose name starts with "SAMPLE", their rooms,
	 * photos, bookings, calendar, ledger and log rows, and owner accounts that only
	 * owned SAMPLE businesses; also attractions, events and stories whose name starts with "SAMPLE".
	 *
	 * ## OPTIONS
	 * [--yes]
	 * : Skip the confirmation question.
	 *
	 * ## EXAMPLES
	 *     wp ek delete-sample --yes
	 *
	 * @subcommand delete-sample
	 */
	public function delete_sample( $args, $assoc ) {
		\WP_CLI::confirm( 'Delete ALL SAMPLE data (businesses, owners, bookings, reviews, attractions/events/tours/stories named SAMPLE, shop products, the sample guide)?', $assoc );
		$n = Sample_Data::delete_all();
		\WP_CLI::success( sprintf( 'Deleted %1$d SAMPLE businesses, %2$d owner accounts, %3$d attractions/events/tours/stories, %4$d shop products.', $n['businesses'], $n['owners'], $n['content'], $n['products'] ) );
	}
}
