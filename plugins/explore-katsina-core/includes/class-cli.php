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
		global $wpdb;
		$ids   = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s AND post_title LIKE %s", Post_Types::BUSINESS, 'SAMPLE%' ) );
		$other = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type IN (%s, %s, %s, 'post') AND post_title LIKE %s", Attractions::CPT, Events::CPT, Tours::CPT, 'SAMPLE%' ) );
		if ( $other ) {
			\WP_CLI::confirm( sprintf( 'Delete %d SAMPLE attractions, events and stories?', count( $other ) ), $assoc );
			foreach ( $other as $id ) {
				$wpdb->delete( $wpdb->prefix . 'ek_favourites', array( 'object_id' => $id ) );
				$wpdb->delete( $wpdb->prefix . 'ek_map_index', array( 'object_id' => $id ) );
				foreach ( Tickets::types( $id ) as $t ) {
					if ( ! (int) $t->sold ) {
						$wpdb->delete( $wpdb->prefix . 'ek_ticket_types', array( 'id' => $t->id ) );
					}
				}
				wp_delete_post( $id, true );
			}
			\WP_CLI::success( sprintf( 'Deleted %d SAMPLE attractions, events and stories.', count( $other ) ) );
		}
		if ( ! $ids ) {
			\WP_CLI::success( 'No SAMPLE businesses found.' );
			return;
		}
		\WP_CLI::confirm( sprintf( 'Delete %d SAMPLE businesses and everything linked to them?', count( $ids ) ), $assoc );
		require_once ABSPATH . 'wp-admin/includes/user.php';
		$owners = array();
		foreach ( $ids as $id ) {
			$owners[] = (int) get_post_field( 'post_author', $id );
			$rooms    = get_posts( array( 'post_type' => Rooms::CPT, 'post_parent' => $id, 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1 ) );
			foreach ( $rooms as $r ) {
				$wpdb->delete( $wpdb->prefix . 'ek_nights', array( 'item_id' => $r ) );
				$wpdb->delete( $wpdb->prefix . 'ek_rate_rules', array( 'item_id' => $r ) );
				wp_delete_post( $r, true );
			}
			$bookings = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d", $id ) );
			foreach ( $bookings as $bid ) {
				$wpdb->delete( $wpdb->prefix . 'ek_log', array( 'object_type' => 'booking', 'object_id' => $bid ) );
			}
			foreach ( Menu::items( $id ) as $it ) {
				Menu::delete_item( $it->id, $id );
			}
			$wpdb->query( $wpdb->prepare( "DELETE l FROM {$wpdb->prefix}ek_invoice_lines l JOIN {$wpdb->prefix}ek_invoices i ON i.id = l.invoice_id WHERE i.business_id = %d", $id ) );
			foreach ( array( 'ek_menu_categories', 'ek_slots', 'ek_bookings', 'ek_ledger', 'ek_payouts', 'ek_invoices', 'ek_reviews', 'ek_rankings', 'ek_analytics_daily', 'ek_refunds', 'ek_complaints' ) as $t ) {
				$wpdb->delete( $wpdb->prefix . $t, array( 'business_id' => $id ) );
			}
			$wpdb->delete( $wpdb->prefix . 'ek_favourites', array( 'object_id' => $id ) );
			$wpdb->delete( $wpdb->prefix . 'ek_map_index', array( 'object_id' => $id ) );
			$priv = Business::private_details( $id );
			if ( ! empty( $priv['id_doc_file'] ) ) {
				Private_Files::delete( $priv['id_doc_file'] );
			}
			$wpdb->delete( $wpdb->prefix . 'ek_business_private', array( 'business_id' => $id ) );
			$wpdb->delete( $wpdb->prefix . 'ek_log', array( 'object_type' => 'business', 'object_id' => $id ) );
			foreach ( get_posts( array( 'post_type' => 'attachment', 'post_parent' => $id, 'fields' => 'ids', 'posts_per_page' => -1 ) ) as $att ) {
				wp_delete_attachment( $att, true );
			}
			wp_delete_post( $id, true );
		}
		$removed = 0;
		foreach ( array_unique( $owners ) as $uid ) {
			$user = get_userdata( $uid );
			if ( $user && ! user_can( $user, 'edit_posts' ) && ! Business::for_user( $uid ) ) {
				wp_delete_user( $uid );
				$removed++;
			}
		}
		\WP_CLI::success( sprintf( 'Deleted %d SAMPLE businesses and %d owner accounts.', count( $ids ), $removed ) );
	}
}
