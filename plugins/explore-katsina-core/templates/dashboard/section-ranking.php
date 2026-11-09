<?php
/**
 * Ranking + tips.
 *
 * @var array $b
 */
use EK\Business;
use EK\Ranking;
use EK\Settings;

defined( 'ABSPATH' ) || exit;

$rank = Ranking::current( $b['id'] );
$tips = Ranking::tips( $b['id'] );
$type = Business::types()[ $b['type'] ]['label'] ?? '';
$min  = (int) Settings::get( 'min_reviews_for_rank' );
?>
<div class="ek-grid ek-grid--2">
	<section class="ek-card" aria-labelledby="rk-h">
		<h2 id="rk-h"><?php esc_html_e( 'Your current ranking', 'explore-katsina' ); ?></h2>
		<?php if ( $rank && $rank->rank_state ) : ?>
			<div class="ek-stats" style="grid-template-columns:1fr 1fr">
				<div class="ek-stat ek-stat--accent"><small><?php esc_html_e( 'In Katsina State', 'explore-katsina' ); ?></small><b>#<?php echo (int) $rank->rank_state; ?> <span style="font-size:.8em;color:#C9CDE0">/ <?php echo (int) $rank->total_state; ?></span></b></div>
				<div class="ek-stat"><small><?php /* translators: %s: LGA */ printf( esc_html__( 'In %s', 'explore-katsina' ), esc_html( $b['lga'] ) ); ?></small><b>#<?php echo (int) $rank->rank_lga; ?> <span style="font-size:.8em" class="ek-muted">/ <?php echo (int) $rank->total_lga; ?></span></b></div>
			</div>
			<?php if ( Ranking::badges( $rank ) ) : ?><p class="ek-rankline"><?php foreach ( Ranking::badges( $rank ) as $bd ) : ?><span class="ek-badge ek-badge--<?php echo esc_attr( $bd ); ?>"><?php echo esc_html( Ranking::badge_labels()[ $bd ] ?? $bd ); ?></span><?php endforeach; ?></p><?php endif; ?>
		<?php else : ?>
			<p class="ek-display" style="font-size:1.25rem"><?php esc_html_e( 'New: not yet ranked', 'explore-katsina' ); ?></p>
			<p>
				<?php
				/* translators: %d: minimum number of reviews */
				printf( esc_html__( 'Businesses get a rank number after %d verified reviews.', 'explore-katsina' ), (int) $min );
				?>
			</p>
		<?php endif; ?>
	</section>
	<?php if ( $rank ) : $sset = \EK\Settings::all(); ?>
	<section class="ek-card" aria-labelledby="rk-score">
		<h2 id="rk-score"><?php /* translators: %s: score */ printf( esc_html__( 'Your score: %s / 100', 'explore-katsina' ), esc_html( number_format_i18n( (float) $rank->score, 1 ) ) ); ?></h2>
		<div class="ek-score-parts">
			<?php
			$parts = array(
				array( __( 'Review rating', 'explore-katsina' ), (float) $rank->rating_part, (int) $sset['rank_weight_rating'], sprintf( /* translators: 1: weighted average, 2: count */ __( 'fair average %1$s★ from %2$d reviews', 'explore-katsina' ), number_format_i18n( (float) $rank->weighted_rating, 2 ), (int) $rank->review_count ) ),
				array( __( 'Completed bookings', 'explore-katsina' ), (float) $rank->bookings_part, (int) $sset['rank_weight_bookings'], sprintf( /* translators: %d: count */ __( '%d in the last 12 months', 'explore-katsina' ), (int) $rank->completed_bookings ) ),
				array( __( 'Response', 'explore-katsina' ), (float) $rank->response_part, (int) $sset['rank_weight_response'], __( 'answering bookings in 48h, replying to reviews', 'explore-katsina' ) ),
			);
			foreach ( $parts as $pt ) :
				?>
				<span><?php echo esc_html( $pt[0] ); ?> <span class="ek-small ek-muted">(<?php echo (int) $pt[2]; ?>%)</span></span>
				<span class="ek-bar" title="<?php echo esc_attr( $pt[3] ); ?>"><span style="width:<?php echo (int) round( $pt[1] * 100 ); ?>%"></span></span>
				<span class="ek-num"><?php echo (int) round( $pt[1] * 100 ); ?>%</span>
			<?php endforeach; ?>
		</div>
		<p class="ek-small ek-muted" style="margin:8px 0 0"><?php echo esc_html( $parts[0][3] . ' · ' . $parts[1][3] ); ?></p>
	</section>
	<?php endif; ?>
	<section class="ek-card" aria-labelledby="rk-how">
		<h2 id="rk-how"><?php esc_html_e( 'How ranking works', 'explore-katsina' ); ?></h2>
		<ul class="ek-small" style="margin:0;padding-left:1.1em;display:grid;gap:6px">
			<li><?php /* translators: %s: type */ printf( esc_html__( 'You are compared only with other %s businesses, statewide and in your LGA.', 'explore-katsina' ), esc_html( $type ) ); ?></li>
			<li><?php esc_html_e( 'Mostly verified review ratings, using a fair average: a few reviews cannot beat a long record of good ones.', 'explore-katsina' ); ?></li>
			<li><?php esc_html_e( 'Recent reviews count more than old ones.', 'explore-katsina' ); ?></li>
			<li><?php esc_html_e( 'Completed bookings and how quickly you respond also count.', 'explore-katsina' ); ?></li>
			<li><strong><?php esc_html_e( 'Paid plans never change your rank number.', 'explore-katsina' ); ?></strong> <?php esc_html_e( 'Featured listings get a highlighted pin and label, shown separately.', 'explore-katsina' ); ?></li>
			<li><?php esc_html_e( 'Rankings update every day.', 'explore-katsina' ); ?></li>
		</ul>
	</section>
</div>
<section class="ek-card" aria-labelledby="tips-h">
	<h2 id="tips-h"><?php esc_html_e( 'Tips to improve', 'explore-katsina' ); ?></h2>
	<ul class="ek-checklist">
		<?php foreach ( $tips as $t ) : ?>
			<li class="<?php echo $t['done'] ? 'is-done' : ''; ?>"><span><strong><?php echo esc_html( $t['label'] ); ?></strong><br><span class="ek-small ek-muted"><?php echo esc_html( $t['why'] ); ?></span></span></li>
		<?php endforeach; ?>
	</ul>
</section>
