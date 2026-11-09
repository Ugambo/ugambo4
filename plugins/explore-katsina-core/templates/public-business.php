<?php
/**
 * Public business page.
 *
 * @var array $b
 * @var bool  $track
 */
use EK\Assets;
use EK\Business;
use EK\View;

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
$track_attr = function ( $metric ) use ( $b, $track ) {
	return $track ? ' data-ek-track="' . (int) $b['id'] . ':' . esc_attr( $metric ) . '"' : '';
};
?>
<div class="ek ek-public"<?php echo $track ? ' data-ek-view="' . (int) $b['id'] . '"' : ''; ?>>
	<?php if ( $b['photos'] ) : ?>
		<div class="ek-gallery ek-gallery--<?php echo (int) min( 5, count( $b['photos'] ) ); ?>">
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
					<?php echo \EK\Favourites::button( $b['id'] ); // phpcs:ignore ?>
				</div>
				<?php
				$ek_rank = isset( \EK\Ranking::ranked_types()[ $b['type'] ] ) ? \EK\Ranking::current( $b['id'] ) : null;
				$ek_lbls = \EK\Ranking::badge_labels();
				if ( isset( \EK\Ranking::ranked_types()[ $b['type'] ] ) ) :
					?>
					<p class="ek-rankline">
						<?php if ( $ek_rank && $ek_rank->rank_state ) : ?>
							<a class="ek-rank" href="<?php echo esc_url( \EK\Top::url( $b['type'] ) ); ?>"><?php echo esc_html( \EK\Ranking::label( $ek_rank, $b['type'] ) ); ?></a>
							<?php if ( $ek_rank->rank_lga && $ek_rank->total_lga > 1 ) : $ek_lga = \EK\Business::lga_of( $b['id'] ); ?><a class="ek-rank" href="<?php echo esc_url( \EK\Top::url( $b['type'], $ek_lga ? $ek_lga->slug : '' ) ); ?>"><?php echo esc_html( \EK\Ranking::label( $ek_rank, $b['type'], 'lga', $b['lga'] ) ); ?></a><?php endif; ?>
						<?php else : ?>
							<span class="ek-rank"><?php esc_html_e( 'New, not yet ranked', 'explore-katsina' ); ?></span>
						<?php endif; ?>
						<?php foreach ( array_diff( \EK\Ranking::badges( $ek_rank ), array( 'verified' ) ) as $bd ) : ?><span class="ek-badge ek-badge--<?php echo esc_attr( $bd ); ?>"><?php echo esc_html( $ek_lbls[ $bd ] ?? $bd ); ?></span><?php endforeach; ?>
						<?php if ( \EK\Map_Index::is_featured( $b['id'] ) ) : ?><span class="ek-badge ek-badge--featured"><?php esc_html_e( 'Featured', 'explore-katsina' ); ?></span><?php endif; ?>
					</p>
				<?php endif; ?>
			</div>
			<div class="ek-description"><?php echo wpautop( wp_kses_post( $b['description'] ) ); // phpcs:ignore ?></div>
			<?php
			if ( 'hotel' === $b['type'] ) {
				include EK_DIR . 'templates/public/hotel.php';
			} elseif ( 'restaurant' === $b['type'] ) {
				include EK_DIR . 'templates/public/restaurant.php';
			} elseif ( 'event-centre' === $b['type'] ) {
				include EK_DIR . 'templates/public/venue.php';
			}
			?>

			<section aria-labelledby="pub-loc">
				<h2 id="pub-loc"><?php esc_html_e( 'Location', 'explore-katsina' ); ?></h2>
				<p><?php echo esc_html( $b['address'] ); ?></p>
				<?php $ek_near = \EK\Map_Index::near( $b['lat'], $b['lng'], 5, 12, $b['id'] ); ?>
				<div class="ek-mini-map" data-ek-mini-map data-lat="<?php echo esc_attr( $b['lat'] ); ?>" data-lng="<?php echo esc_attr( $b['lng'] ); ?>" data-colour="<?php echo esc_attr( $colour ); ?>" data-near="<?php echo esc_attr( wp_json_encode( \EK\Map_Index::mini( $ek_near ) ) ); ?>" role="img" aria-label="<?php esc_attr_e( 'Map showing the location and nearby places', 'explore-katsina' ); ?>"></div>
			</section>
			<?php include EK_DIR . 'templates/public/reviews.php'; ?>
			<?php include EK_DIR . 'templates/public/nearby.php'; ?>
			<?php echo View::photo_credits( $b['id'] ); // phpcs:ignore ?>
		</div>

		<aside class="ek-card ek-contact-card ek-stack" aria-labelledby="pub-contact">
			<h2 id="pub-contact" style="margin:0"><?php esc_html_e( 'Contact', 'explore-katsina' ); ?></h2>
			<div class="ek-actions">
				<?php if ( $wa ) : ?><a class="ek-btn ek-btn--wa" href="<?php echo esc_url( $wa ); ?>" target="_blank" rel="noopener"<?php echo $track_attr( 'whatsapp' ); // phpcs:ignore ?>><?php esc_html_e( 'WhatsApp', 'explore-katsina' ); ?></a><?php endif; ?>
				<a class="ek-btn" href="<?php echo esc_url( 'tel:' . $b['phone'] ); ?>"<?php echo $track_attr( 'call' ); // phpcs:ignore ?>><?php esc_html_e( 'Call', 'explore-katsina' ); ?></a>
				<a class="ek-btn ek-btn--night" href="<?php echo esc_url( $dir ); ?>" target="_blank" rel="noopener"<?php echo $track_attr( 'directions' ); // phpcs:ignore ?>><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a>
				<?php if ( 'restaurant' === $b['type'] && \EK\Restaurant::settings( $b['id'] )['res_enabled'] ) : ?><a class="ek-btn ek-btn--ghost" href="#reserve"><?php esc_html_e( 'Reserve a table', 'explore-katsina' ); ?></a><?php endif; ?>
				<?php if ( $b['website'] ) : ?><a class="ek-btn ek-btn--ghost" href="<?php echo esc_url( $b['website'] ); ?>" target="_blank" rel="noopener nofollow"<?php echo $track_attr( 'website' ); // phpcs:ignore ?>><?php esc_html_e( 'Website', 'explore-katsina' ); ?></a><?php endif; ?>
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
