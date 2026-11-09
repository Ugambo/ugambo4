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

	/** Rating parts asked for each kind of business. */
	public static function parts( $kind ) {
		return array(
			'cleanliness' => __( 'Cleanliness', 'explore-katsina' ),
			'service'     => __( 'Service', 'explore-katsina' ),
			'value'       => __( 'Value for money', 'explore-katsina' ),
			'location'    => 'event' === $kind ? __( 'Location & access', 'explore-katsina' ) : __( 'Location', 'explore-katsina' ),
		);
	}

	public static function for_booking( $booking_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_reviews WHERE booking_id = %d", $booking_id ) );
	}

	/**
	 * Verified reviews only: a hotel after check-out, a restaurant after a completed reservation,
	 * an event centre after a completed event (tours in Phase 9). One review per booking, within 180 days.
	 *
	 * @return true|\WP_Error
	 */
	public static function can_review( $b ) {
		$done = array( 'hotel' => 'checked_out', 'restaurant' => 'completed', 'event' => 'completed', 'tour' => 'completed' );
		if ( ! isset( $done[ $b->kind ] ) || $done[ $b->kind ] !== $b->status ) {
			return new \WP_Error( 'not_yet', __( 'You can review once your stay, meal or event is completed.', 'explore-katsina' ) );
		}
		if ( self::for_booking( $b->id ) ) {
			return new \WP_Error( 'done', __( 'You have already reviewed this booking. Thank you!', 'explore-katsina' ) );
		}
		if ( strtotime( $b->updated_at . ' UTC' ) < time() - 180 * DAY_IN_SECONDS ) {
			return new \WP_Error( 'old', __( 'Reviews can be written up to 180 days after a visit.', 'explore-katsina' ) );
		}
		return true;
	}

	/** @return object|\WP_Error The saved review. */
	public static function submit( $b, array $in ) {
		global $wpdb;
		$ok = self::can_review( $b );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$overall = absint( $in['rating_overall'] ?? 0 );
		if ( $overall < 1 || $overall > 5 ) {
			return new \WP_Error( 'rating', __( 'Choose an overall rating from 1 to 5 stars.', 'explore-katsina' ) );
		}
		$title = mb_substr( sanitize_text_field( $in['review_title'] ?? '' ), 0, 120 );
		$body  = mb_substr( sanitize_textarea_field( $in['review_body'] ?? '' ), 0, 3000 );
		if ( mb_strlen( trim( $body ) ) < 20 ) {
			return new \WP_Error( 'body', __( 'Please write at least a sentence or two (20 characters or more).', 'explore-katsina' ) );
		}
		$name = mb_substr( sanitize_text_field( $in['review_name'] ?? '' ), 0, 60 );
		if ( '' === $name ) {
			$parts = preg_split( '/\s+/', trim( $b->customer_name ) );
			$name  = $parts[0] . ( isset( $parts[1] ) ? ' ' . mb_substr( $parts[1], 0, 1 ) . '.' : '' );
		}
		$row = array(
			'business_id'    => (int) $b->business_id,
			'booking_id'     => (int) $b->id,
			'user_id'        => (int) $b->customer_id,
			'author_name'    => $name,
			'rating_overall' => $overall,
			'title'          => $title,
			'body'           => $body,
			'lang'           => 'ha' === ( $in['lang'] ?? '' ) ? 'ha' : 'en',
			'status'         => 'published',
			'created_at'     => current_time( 'mysql', true ),
		);
		foreach ( array_keys( self::parts( $b->kind ) ) as $k ) {
			$v                     = absint( $in[ 'rating_' . $k ] ?? 0 );
			$row[ 'rating_' . $k ] = ( $v >= 1 && $v <= 5 ) ? $v : null;
		}
		if ( false === $wpdb->insert( $wpdb->prefix . 'ek_reviews', $row ) ) {
			return new \WP_Error( 'db', __( 'Your review could not be saved. Please try again.', 'explore-katsina' ) );
		}
		$review = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_reviews WHERE id = %d", $wpdb->insert_id ) );
		Log::add( 'review_posted', 'business', $b->business_id, '', array( 'review_id' => (int) $review->id, 'booking' => $b->code ) );
		Emails::review_received( $review, $b );
		return $review;
	}
}
