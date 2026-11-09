<?php
/**
 * Homepage spot for Premium businesses (clearly labelled as Featured).
 *
 * @var int[] $ids
 */
use EK\Business;
use EK\Reviews;

defined( 'ABSPATH' ) || exit;
?>
<section class="ek ek-spotlight" aria-labelledby="spot-h">
	<h2 id="spot-h"><?php esc_html_e( 'Featured places', 'explore-katsina' ); ?></h2>
	<ul class="ek-spot-list">
		<?php foreach ( $ids as $id ) : $p = Business::profile( $id ); $st = Reviews::stats( $id ); ?>
			<li class="ek-card ek-spot">
				<a href="<?php echo esc_url( $p['url'] ); ?>" class="ek-spot-img" tabindex="-1" aria-hidden="true"><?php echo ! empty( $p['photos'][0] ) ? wp_get_attachment_image( (int) $p['photos'][0], 'medium_large', false, array( 'alt' => '', 'loading' => 'lazy' ) ) : ''; // phpcs:ignore ?></a>
				<span class="ek-badge ek-badge--featured"><?php esc_html_e( 'Featured', 'explore-katsina' ); ?></span>
				<h3><a href="<?php echo esc_url( $p['url'] ); ?>"><?php echo esc_html( $p['name'] ); ?></a></h3>
				<p class="ek-small ek-muted"><?php echo esc_html( ( Business::types()[ $p['type'] ]['label'] ?? '' ) . ' · ' . $p['lga'] . ( $st['count'] ? ' · ★ ' . number_format_i18n( $st['overall'], 1 ) : '' ) ); ?></p>
			</li>
		<?php endforeach; ?>
	</ul>
</section>
