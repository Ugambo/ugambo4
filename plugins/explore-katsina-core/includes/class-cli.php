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
	 * owned SAMPLE businesses.
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
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT ID FROM {$wpdb->posts} WHERE post_type = %s AND post_title LIKE %s", Post_Types::BUSINESS, 'SAMPLE%' ) );
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
			foreach ( array( 'ek_menu_categories', 'ek_slots', 'ek_bookings', 'ek_ledger', 'ek_payouts', 'ek_invoices', 'ek_reviews', 'ek_rankings', 'ek_analytics_daily', 'ek_refunds' ) as $t ) {
				$wpdb->delete( $wpdb->prefix . $t, array( 'business_id' => $id ) );
			}
			$wpdb->delete( $wpdb->prefix . 'ek_favourites', array( 'object_id' => $id ) );
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
