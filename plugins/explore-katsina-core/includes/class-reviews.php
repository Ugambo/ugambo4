<?php
/**
 * Verified reviews (read + owner replies). Writing reviews arrives in Phase 6,
 * hiding/moderation in Phase 8.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Reviews {

	public static function for_business( $business_id, $limit = 50, $only_published = true ) {
		global $wpdb;
		$status = $only_published ? "AND status = 'published'" : '';
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_reviews WHERE business_id = %d {$status} ORDER BY id DESC LIMIT %d", $business_id, $limit ) // phpcs:ignore
		);
	}

	public static function stats( $business_id ) {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT COUNT(*) n, AVG(rating_overall) overall, AVG(rating_cleanliness) cleanliness, AVG(rating_service) service,
				        AVG(rating_value) value, AVG(rating_location) location,
				        SUM(owner_reply IS NOT NULL AND owner_reply <> '') replied
				 FROM {$wpdb->prefix}ek_reviews WHERE business_id = %d AND status = 'published'",
				$business_id
			)
		);
		return array(
			'count'       => (int) $row->n,
			'overall'     => $row->overall ? round( (float) $row->overall, 1 ) : 0,
			'cleanliness' => $row->cleanliness ? round( (float) $row->cleanliness, 1 ) : 0,
			'service'     => $row->service ? round( (float) $row->service, 1 ) : 0,
			'value'       => $row->value ? round( (float) $row->value, 1 ) : 0,
			'location'    => $row->location ? round( (float) $row->location, 1 ) : 0,
			'replied'     => (int) $row->replied,
		);
	}

	/**
	 * Owner reply. The review must belong to this business (checked here).
	 *
	 * @return true|\WP_Error
	 */
	public static function reply( $review_id, $business_id, $text ) {
		global $wpdb;
		$text = trim( sanitize_textarea_field( $text ) );
		if ( mb_strlen( $text ) < 2 || mb_strlen( $text ) > 2000 ) {
			return new \WP_Error( 'len', __( 'Replies must be 2–2,000 characters.', 'explore-katsina' ) );
		}
		$owner = (int) $wpdb->get_var( $wpdb->prepare( "SELECT business_id FROM {$wpdb->prefix}ek_reviews WHERE id = %d", $review_id ) );
		if ( $owner !== (int) $business_id ) {
			return new \WP_Error( 'forbidden', __( 'You can only reply to reviews of your own business.', 'explore-katsina' ) );
		}
		$wpdb->update(
			$wpdb->prefix . 'ek_reviews',
			array(
				'owner_reply'    => $text,
				'owner_reply_at' => current_time( 'mysql', true ),
			),
			array( 'id' => (int) $review_id )
		);
		Log::add( 'review_replied', 'business', $business_id, '', array( 'review_id' => (int) $review_id ) );
		return true;
	}
}
