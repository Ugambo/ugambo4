<?php
/**
 * Ranking display + improvement tips. The daily ranking calculation
 * (Bayesian average, recency, bookings, response rate) arrives in Phase 8.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Ranking {

	/** Latest ranking row for a business, or null. */
	public static function current( $business_id ) {
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_rankings WHERE business_id = %d ORDER BY day DESC LIMIT 1", $business_id )
		);
	}

	/**
	 * Practical tips with done/not-done state.
	 *
	 * @return array<int, array{label:string, done:bool, why:string}>
	 */
	public static function tips( $business_id ) {
		$p       = Business::profile( $business_id );
		$reviews = Reviews::stats( $business_id );
		$desc    = mb_strlen( trim( wp_strip_all_tags( $p['description'] ?? '' ) ) );
		$min     = (int) Settings::get( 'min_reviews_for_rank' );

		return array(
			array(
				'label' => __( 'Add at least 5 good photos', 'explore-katsina' ),
				'done'  => count( $p['photos'] ) >= 5,
				'why'   => __( 'Listings with more photos get more clicks and bookings.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Write a full description (150+ characters)', 'explore-katsina' ),
				'done'  => $desc >= 150,
				'why'   => __( 'Tell visitors what you offer, prices and what is nearby.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Add a WhatsApp number', 'explore-katsina' ),
				'done'  => ! empty( $p['whatsapp'] ),
				'why'   => __( 'Most visitors prefer to message first.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Add a website or social media page', 'explore-katsina' ),
				'done'  => ! empty( $p['website'] ) || array_filter( $p['socials'] ),
				'why'   => __( 'It builds trust.', 'explore-katsina' ),
			),
			array(
				/* translators: %d: minimum reviews */
				'label' => sprintf( __( 'Get at least %d verified reviews', 'explore-katsina' ), $min ),
				'done'  => $reviews['count'] >= $min,
				'why'   => __( 'You need this to receive a rank number. Only guests with a completed booking can review.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Reply to every review', 'explore-katsina' ),
				'done'  => $reviews['count'] > 0 && $reviews['replied'] >= $reviews['count'],
				'why'   => __( 'Your response rate is part of your ranking score.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Get the Verified badge', 'explore-katsina' ),
				'done'  => ! empty( $p['verified'] ),
				'why'   => __( 'Verified businesses are checked by our team.', 'explore-katsina' ),
			),
		);
	}
}
