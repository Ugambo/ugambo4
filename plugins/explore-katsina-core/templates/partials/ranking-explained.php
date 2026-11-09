<?php
/**
 * Plain-language explanation of the ranking formula (uses the live settings).
 */
use EK\Settings;

defined( 'ABSPATH' ) || exit;
$s = Settings::all();
?>
<ul class="ek-small" style="margin:8px 0 0;padding-left:1.1em;display:grid;gap:6px">
	<li><?php /* translators: 1: percent, 2: pretend reviews */ printf( esc_html__( '%1$s%% is the rating from verified reviews, using a fair average: every place starts as if it already had %2$d average reviews, so one 5-star review cannot beat a long record of good ones.', 'explore-katsina' ), (int) $s['rank_weight_rating'], (int) $s['rank_prior_reviews'] ); ?></li>
	<li><?php /* translators: %d: months */ printf( esc_html__( 'Recent reviews count more: a review counts half as much after %d months.', 'explore-katsina' ), (int) $s['rank_half_life_months'] ); ?></li>
	<li><?php /* translators: %d: percent */ printf( esc_html__( '%d%% is completed bookings in the last 12 months, on a sliding scale.', 'explore-katsina' ), (int) $s['rank_weight_bookings'] ); ?></li>
	<li><?php /* translators: %d: percent */ printf( esc_html__( '%d%% is response: answering bookings within 48 hours and replying to reviews.', 'explore-katsina' ), (int) $s['rank_weight_response'] ); ?></li>
	<li><?php /* translators: %d: reviews */ printf( esc_html__( 'Only reviews from completed bookings count. A place needs %d of them to get a rank number.', 'explore-katsina' ), (int) $s['min_reviews_for_rank'] ); ?></li>
	<li><?php /* translators: 1: percent, 2: points */ printf( esc_html__( 'Badges: Top Rated is the top %1$d%% of its type; Rising means its score went up %2$d+ points in 90 days; Verified means our team checked it.', 'explore-katsina' ), (int) $s['rank_top_percent'], (int) $s['rank_rising_points'] ); ?></li>
	<li><strong><?php esc_html_e( 'Paying for Featured never changes a rank number.', 'explore-katsina' ); ?></strong> <?php esc_html_e( 'Rankings update every night.', 'explore-katsina' ); ?></li>
</ul>
