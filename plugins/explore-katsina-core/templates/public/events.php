<?php
/**
 * Events list (promoted first, clearly labelled).
 *
 * @var int[] $ids
 * @var bool  $compact
 */
use EK\Events;
use EK\Install;
use EK\Money;
use EK\Tickets;

defined( 'ABSPATH' ) || exit;
$compact = ! empty( $compact );
?>
<div class="ek ek-events ek-stack">
	<?php if ( ! $compact ) : ?>
		<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Festivals, concerts and gatherings across Katsina State.', 'explore-katsina' ); ?> <a href="<?php echo esc_url( Install::page_url( 'promote_event' ) ); ?>"><?php esc_html_e( 'Organising an event? Promote it here.', 'explore-katsina' ); ?></a></p>
	<?php else : ?>
		<h2 style="margin:0"><?php esc_html_e( 'Upcoming events', 'explore-katsina' ); ?></h2>
	<?php endif; ?>
	<?php if ( ! $ids ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'No upcoming events yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Check back soon.', 'explore-katsina' ); ?></div><?php endif; ?>
	<ul class="ek-event-list">
		<?php foreach ( $ids as $id ) : $d = Events::data( $id ); $prices = array_filter( wp_list_pluck( Tickets::types( $id ), 'price_kobo' ) ); ?>
			<li class="ek-card ek-event-card<?php echo Events::is_promoted( $id ) ? ' is-promoted' : ''; ?>">
				<a href="<?php echo esc_url( get_permalink( $id ) ); ?>" class="ek-event-img" tabindex="-1" aria-hidden="true"><?php echo get_the_post_thumbnail( $id, 'medium_large', array( 'alt' => '', 'loading' => 'lazy' ) ); // phpcs:ignore ?></a>
				<div class="ek-stack" style="gap:4px;min-width:0">
					<?php if ( Events::is_promoted( $id ) ) : ?><span class="ek-badge ek-badge--featured" style="align-self:flex-start"><?php esc_html_e( 'Promoted', 'explore-katsina' ); ?></span><?php endif; ?>
					<?php if ( $d['type'] ) : ?><span class="ek-small ek-muted" style="text-transform:uppercase;letter-spacing:.04em"><?php echo esc_html( $d['type'] ); ?></span><?php endif; ?>
					<h3 style="margin:0"><a href="<?php echo esc_url( get_permalink( $id ) ); ?>"><?php echo esc_html( get_the_title( $id ) ); ?></a></h3>
					<p class="ek-small" style="margin:0"><strong><?php echo esc_html( Events::when( $d ) ); ?></strong></p>
					<p class="ek-small ek-muted" style="margin:0"><?php echo esc_html( trim( $d['venue'] . ( $d['lga'] ? ', ' . $d['lga'] : '' ), ', ' ) ); ?></p>
					<?php if ( Tickets::types( $id ) ) : ?><p class="ek-small" style="margin:0"><?php echo $prices ? esc_html( sprintf( /* translators: %s: price */ __( 'Tickets from %s', 'explore-katsina' ), Money::format( min( $prices ) ) ) ) : esc_html__( 'Free tickets', 'explore-katsina' ); ?></p><?php endif; ?>
				</div>
			</li>
		<?php endforeach; ?>
	</ul>
</div>
