<?php
/**
 * Verified reviews on a business page.
 *
 * @var array $b
 */
use EK\Reviews;
use EK\View;

defined( 'ABSPATH' ) || exit;

$stats = Reviews::stats( $b['id'] );
if ( ! $stats['count'] ) {
	return;
}
$rows  = Reviews::for_business( $b['id'], 10 );
$parts = array( 'cleanliness' => __( 'Cleanliness', 'explore-katsina' ), 'service' => __( 'Service', 'explore-katsina' ), 'value' => __( 'Value', 'explore-katsina' ), 'location' => __( 'Location', 'explore-katsina' ) );
?>
<section class="ek-stack" id="reviews" aria-labelledby="rev-h">
	<h2 id="rev-h" style="margin:0"><?php esc_html_e( 'Verified reviews', 'explore-katsina' ); ?></h2>
	<div class="ek-rev-summary">
		<div class="ek-rev-big"><span class="ek-score ek-score--big"><?php echo esc_html( number_format_i18n( $stats['overall'], 1 ) ); ?></span><span class="ek-small"><?php /* translators: %d: count */ printf( esc_html( _n( '%d review from a real booking', '%d reviews from real bookings', $stats['count'], 'explore-katsina' ) ), (int) $stats['count'] ); ?></span></div>
		<dl class="ek-rev-parts">
			<?php foreach ( $parts as $k => $label ) : if ( ! $stats[ $k ] ) { continue; } ?>
				<dt><?php echo esc_html( $label ); ?></dt><dd><span class="ek-bar"><span style="width:<?php echo (int) round( $stats[ $k ] * 20 ); ?>%"></span></span> <span class="ek-num"><?php echo esc_html( number_format_i18n( $stats[ $k ], 1 ) ); ?></span></dd>
			<?php endforeach; ?>
		</dl>
	</div>
	<?php foreach ( $rows as $r ) : ?>
		<article class="ek-review">
			<div class="ek-row ek-row--between"><div><?php echo View::stars( $r->rating_overall ); // phpcs:ignore ?> <strong><?php echo esc_html( $r->title ); ?></strong></div><span class="ek-small ek-muted"><?php echo esc_html( $r->author_name ); ?> · <?php echo esc_html( View::date( $r->created_at ) ); ?> · <span class="ek-verified-stay">✓ <?php esc_html_e( 'Verified booking', 'explore-katsina' ); ?></span></span></div>
			<p style="margin:6px 0 0" lang="<?php echo esc_attr( $r->lang ); ?>"><?php echo esc_html( $r->body ); ?></p>
			<?php if ( $r->owner_reply ) : ?><div class="ek-reply"><strong><?php esc_html_e( 'Reply from the owner', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( $r->owner_reply ); ?></div><?php endif; ?>
		</article>
	<?php endforeach; ?>
</section>
