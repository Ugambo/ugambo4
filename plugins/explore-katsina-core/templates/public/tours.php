<?php
/**
 * Our tours list.
 *
 * @var int[] $ids
 */
use EK\Money;
use EK\Tours;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-stack">
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Guided tours run by Explore Katsina.', 'explore-katsina' ); ?></p>
	<?php if ( ! $ids ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'Tours coming soon', 'explore-katsina' ); ?></strong></div><?php endif; ?>
	<ul class="ek-event-list">
		<?php foreach ( $ids as $id ) : $d = Tours::data( $id ); $next = array_values( array_filter( Tours::departures( $id ), static fn( $r ) => 'open' === $r->status && Tours::seats_left( $r ) > 0 ) ); ?>
			<li class="ek-card ek-event-card">
				<a href="<?php echo esc_url( get_permalink( $id ) ); ?>" class="ek-event-img" tabindex="-1" aria-hidden="true"><?php echo get_the_post_thumbnail( $id, 'medium_large', array( 'alt' => '', 'loading' => 'lazy' ) ); // phpcs:ignore ?></a>
				<div class="ek-stack" style="gap:4px;min-width:0">
					<h3 style="margin:0"><a href="<?php echo esc_url( get_permalink( $id ) ); ?>"><?php echo esc_html( get_the_title( $id ) ); ?></a></h3>
					<p class="ek-small" style="margin:0"><strong><?php echo esc_html( Money::format( $d['price'] ) ); ?></strong> <?php esc_html_e( 'per person', 'explore-katsina' ); ?><?php echo $d['duration'] ? ' · ' . esc_html( $d['duration'] ) : ''; ?></p>
					<p class="ek-small ek-muted" style="margin:0"><?php echo $next ? esc_html( sprintf( /* translators: %s: date */ __( 'Next date: %s', 'explore-katsina' ), wp_date( 'j M Y', strtotime( $next[0]->depart_date . ' 12:00' ) ) ) ) : esc_html__( 'No dates yet', 'explore-katsina' ); ?></p>
				</div>
			</li>
		<?php endforeach; ?>
	</ul>
</div>
