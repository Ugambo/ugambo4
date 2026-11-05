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
