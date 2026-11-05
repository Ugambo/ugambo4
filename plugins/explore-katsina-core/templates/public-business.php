<?php
/**
 * Public business page.
 *
 * @var array $b
 * @var bool  $track
 */
use EK\Assets;
use EK\Business;

defined( 'ABSPATH' ) || exit;

$types   = Business::types();
$type    = $types[ $b['type'] ]['label'] ?? '';
$open    = Business::is_open( $b['id'] );
$today   = strtolower( wp_date( 'D', null, new DateTimeZone( 'Africa/Lagos' ) ) );
$days    = Business::day_labels();
$colours = Assets::map_config()['pinColours'];
$colour  = $colours[ $b['type'] ] ?? $colours['directory'];
$wa      = $b['whatsapp'] ? 'https://wa.me/' . ltrim( $b['whatsapp'], '+' ) . '?text=' . rawurlencode( sprintf( /* translators: %s: business */ __( 'Hello %s, I found you on Explore Katsina.', 'explore-katsina' ), $b['name'] ) ) : '';
$dir     = 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $b['lat'] . ',' . $b['lng'] );
$t       = function ( $metric ) use ( $b, $track ) {
	return $track ? ' data-ek-track="' . (int) $b['id'] . ':' . esc_attr( $metric ) . '"' : '';
};
?>
<div class="ek ek-public"<?php echo $track ? ' data-ek-view="' . (int) $b['id'] . '"' : ''; ?>>
	<?php if ( $b['photos'] ) : ?>
		<div class="ek-gallery">
			<?php foreach ( array_slice( $b['photos'], 0, 5 ) as $i => $pid ) : ?>
				<?php echo wp_get_attachment_image( $pid, 0 === $i ? 'large' : 'medium_large', false, array( 'loading' => 0 === $i ? 'eager' : 'lazy', 'alt' => $b['name'] ) ); ?>
			<?php endforeach; ?>
		</div>
	<?php else : ?>
		<div class="ek-gallery"><div class="ek-gallery-placeholder"><span><?php echo esc_html( $b['name'] ); ?></span></div></div>
	<?php endif; ?>

	<div class="ek-pub-layout">
		<div class="ek-stack">
			<div>
				<p class="ek-eyebrow" style="margin:0 0 6px"><?php echo esc_html( $type ); ?> · <?php echo esc_html( $b['lga'] ); ?></p>
				<div class="ek-row">
					<span class="ek-pill <?php echo $open ? 'ek-pill--ok' : 'ek-pill--bad'; ?>"><?php echo $open ? esc_html__( 'Open now', 'explore-katsina' ) : esc_html__( 'Closed now', 'explore-katsina' ); ?></span>
					<?php if ( $b['verified'] ) : ?><span class="ek-badge ek-badge--verified">✓ <?php esc_html_e( 'Verified', 'explore-katsina' ); ?></span><?php endif; ?>
				</div>
			</div>
			<div class="ek-description"><?php echo wpautop( wp_kses_post( $b['description'] ) ); // phpcs:ignore ?></div>

			<section aria-labelledby="pub-loc">
				<h2 id="pub-loc"><?php esc_html_e( 'Location', 'explore-katsina' ); ?></h2>
				<p><?php echo esc_html( $b['address'] ); ?></p>
				<div class="ek-mini-map" data-ek-mini-map data-lat="<?php echo esc_attr( $b['lat'] ); ?>" data-lng="<?php echo esc_attr( $b['lng'] ); ?>" data-colour="<?php echo esc_attr( $colour ); ?>" role="img" aria-label="<?php esc_attr_e( 'Map showing the location', 'explore-katsina' ); ?>"></div>
			</section>
		</div>

		<aside class="ek-card ek-contact-card ek-stack" aria-labelledby="pub-contact">
			<h2 id="pub-contact" style="margin:0"><?php esc_html_e( 'Contact', 'explore-katsina' ); ?></h2>
			<div class="ek-actions">
				<?php if ( $wa ) : ?><a class="ek-btn ek-btn--wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener"<?php echo $t( 'whatsapp' ); // phpcs:ignore ?>><?php esc_html_e( 'WhatsApp', 'explore-katsina' ); ?></a><?php endif; ?>
				<a class="ek-btn" href="<?php echo esc_url( 'tel:' . $b['phone'] ); ?>"<?php echo $t( 'call' ); // phpcs:ignore ?>><?php esc_html_e( 'Call', 'explore-katsina' ); ?></a>
				<a class="ek-btn ek-btn--night" href="<?php echo esc_url( $dir ); ?>" target="_blank" rel="noopener"<?php echo $t( 'directions' ); // phpcs:ignore ?>><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a>
				<?php if ( $b['website'] ) : ?><a class="ek-btn ek-btn--ghost" href="<?php echo esc_url( $b['website'] ); ?>" target="_blank" rel="noopener nofollow"<?php echo $t( 'website' ); // phpcs:ignore ?>><?php esc_html_e( 'Website', 'explore-katsina' ); ?></a><?php endif; ?>
			</div>
			<p class="ek-small" style="margin:0"><?php echo esc_html( Business::display_phone( $b['phone'] ) ); ?><?php echo $b['email'] ? '<br>' . esc_html( $b['email'] ) : ''; ?></p>
			<div>
				<h3><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?></h3>
				<?php if ( $b['hours']['always'] ) : ?>
					<p><?php esc_html_e( 'Open 24 hours, every day', 'explore-katsina' ); ?></p>
				<?php else : ?>
					<ul class="ek-hours-list">
						<?php foreach ( $days as $key => $label ) : $h = $b['hours'][ $key ]; ?>
							<li class="<?php echo $key === $today ? 'is-today' : ''; ?>"><span><?php echo esc_html( $label ); ?></span><span class="ek-num"><?php echo $h['closed'] ? esc_html__( 'Closed', 'explore-katsina' ) : esc_html( $h['open'] . ' – ' . $h['close'] ); ?></span></li>
						<?php endforeach; ?>
					</ul>
				<?php endif; ?>
			</div>
		</aside>
	</div>
</div>
