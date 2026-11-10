<?php
/**
 * Visitor details for an attraction, shown under its description: history, visitor information,
 * small map, the nearest hotels / restaurants / event centres (with distances), and sources.
 *
 * @var int   $id
 * @var array $a
 */
use EK\Attractions;
use EK\Favourites;
use EK\Hotel_Search;
use EK\Install;
use EK\Map_Index;
use EK\View;

defined( 'ABSPATH' ) || exit;
$has_pin   = is_numeric( $a['lat'] ) && is_numeric( $a['lng'] ) && (float) $a['lat'];
$not_known = __( 'Not yet confirmed. Please check locally before you go.', 'explore-katsina' );
$groups    = array(
	'hotel'        => array( __( 'Where to stay', 'explore-katsina' ), __( 'No hotels listed nearby yet.', 'explore-katsina' ), 'hotels' ),
	'restaurant'   => array( __( 'Where to eat', 'explore-katsina' ), __( 'No restaurants listed nearby yet.', 'explore-katsina' ), 'restaurants' ),
	'event-centre' => array( __( 'Event centres', 'explore-katsina' ), __( 'No event centres listed nearby yet.', 'explore-katsina' ), 'event_centres' ),
);
$nearest   = array();
$all_near  = array();
$other     = array();
if ( $has_pin ) {
	foreach ( array_keys( $groups ) as $type ) {
		$nearest[ $type ] = Map_Index::nearest( (float) $a['lat'], (float) $a['lng'], $type, 3 );
		$all_near         = array_merge( $all_near, $nearest[ $type ] );
	}
	$other = Map_Index::nearest( (float) $a['lat'], (float) $a['lng'], 'attraction', 4, 40, $id );
	$all_near = array_merge( $all_near, $other );
}
?>
<div class="ek ek-attraction ek-stack">
	<?php if ( $a['unverified'] ) : ?><p class="ek-notice ek-notice--info" style="margin:0" data-ek-unverified><?php esc_html_e( 'Facts on this page come from published sources (listed below) but have not yet been checked on the ground. Please confirm opening times, fees and access locally before you travel.', 'explore-katsina' ); ?></p><?php endif; ?>

	<?php if ( trim( wp_strip_all_tags( $a['history'] ) ) ) : ?>
		<section aria-labelledby="ek-history-h">
			<h2 id="ek-history-h"><?php esc_html_e( 'History', 'explore-katsina' ); ?></h2>
			<div class="ek-prose"><?php echo wp_kses_post( wpautop( $a['history'] ) ); ?></div>
		</section>
	<?php endif; ?>

	<section class="ek-card ek-stack" aria-labelledby="ek-visit-h">
		<h2 id="ek-visit-h" style="margin:0"><?php esc_html_e( 'Visitor information', 'explore-katsina' ); ?></h2>
		<dl class="ek-dl">
			<?php if ( $a['category'] ) : ?><dt><?php esc_html_e( 'Type', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['category'] ); ?></dd><?php endif; ?>
			<?php if ( $a['lga'] ) : ?><dt><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['lga'] ); ?></dd><?php endif; ?>
			<dt><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?></dt><dd<?php echo $a['hours'] ? '' : ' class="ek-muted"'; ?>><?php echo esc_html( $a['hours'] ? $a['hours'] : $not_known ); ?></dd>
			<dt><?php esc_html_e( 'Entry fee', 'explore-katsina' ); ?></dt><dd<?php echo $a['entry_fee'] ? '' : ' class="ek-muted"'; ?>><?php echo esc_html( $a['entry_fee'] ? $a['entry_fee'] : $not_known ); ?></dd>
			<?php if ( $a['best_time'] ) : ?><dt><?php esc_html_e( 'Best time to visit', 'explore-katsina' ); ?></dt><dd><?php echo nl2br( esc_html( $a['best_time'] ) ); ?></dd><?php endif; ?>
			<?php if ( $a['directions'] ) : ?><dt><?php esc_html_e( 'How to get there', 'explore-katsina' ); ?></dt><dd><?php echo nl2br( esc_html( $a['directions'] ) ); ?></dd><?php endif; ?>
			<?php if ( $a['pin_note'] ) : ?><dt><?php esc_html_e( 'Map pin', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['pin_note'] ); ?></dd><?php endif; ?>
		</dl>
		<div class="ek-row">
			<?php if ( $has_pin ) : ?><a class="ek-btn ek-btn--night" href="<?php echo esc_url( 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $a['lat'] . ',' . $a['lng'] ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a><?php endif; ?>
			<a class="ek-btn ek-btn--ghost" href="<?php echo esc_url( add_query_arg( 'focus', $id, Install::page_url( 'map' ) ) ); ?>"><?php esc_html_e( 'Show on Katsina Map', 'explore-katsina' ); ?></a>
			<?php echo Favourites::button( $id ); // phpcs:ignore ?>
		</div>
	</section>

	<?php if ( $has_pin ) : ?>
		<div class="ek-mini-map" data-ek-mini-map data-lat="<?php echo esc_attr( $a['lat'] ); ?>" data-lng="<?php echo esc_attr( $a['lng'] ); ?>" data-colour="#1F6B52" data-near="<?php echo esc_attr( wp_json_encode( Map_Index::mini( array_values( array_filter( $all_near, static fn( $p ) => $p['distance'] <= 15000 ) ) ) ) ); ?>" role="img" aria-label="<?php esc_attr_e( 'Map showing the location and nearby places', 'explore-katsina' ); ?>"></div>

		<section aria-labelledby="ek-nearest-h" data-ek-nearest>
			<h2 id="ek-nearest-h"><?php esc_html_e( 'Stay, eat and celebrate nearby', 'explore-katsina' ); ?></h2>
			<p class="ek-small ek-muted" style="margin-top:0"><?php esc_html_e( 'Distances are straight-line from this attraction; the road distance is usually longer.', 'explore-katsina' ); ?></p>
			<div class="ek-near-grid">
				<?php foreach ( $groups as $type => $g ) : ?>
					<div class="ek-card" data-ek-nearest-type="<?php echo esc_attr( $type ); ?>">
						<h3 style="margin:0 0 8px"><?php echo esc_html( $g[0] ); ?></h3>
						<?php if ( $nearest[ $type ] ) : ?>
							<ul class="ek-nearby">
								<?php foreach ( $nearest[ $type ] as $n ) : ?>
									<li><a href="<?php echo esc_url( $n['url'] ); ?>"><?php echo esc_html( $n['title'] ); ?></a><span class="ek-small ek-muted"><?php echo esc_html( Hotel_Search::format_distance( $n['distance'] / 1000 ) ); ?><?php echo $n['rating'] && $n['reviews'] ? ' · ★ ' . esc_html( number_format_i18n( $n['rating'], 1 ) ) : ''; ?></span></li>
								<?php endforeach; ?>
							</ul>
						<?php else : ?>
							<p class="ek-small ek-muted" style="margin:0"><?php echo esc_html( $g[1] ); ?></p>
						<?php endif; ?>
						<p class="ek-small" style="margin:8px 0 0"><a href="<?php echo esc_url( Install::page_url( $g[2] ) ); ?>"><?php esc_html_e( 'See all →', 'explore-katsina' ); ?></a></p>
					</div>
				<?php endforeach; ?>
			</div>
		</section>

		<?php if ( $other ) : ?>
			<section aria-labelledby="ek-other-h">
				<h2 id="ek-other-h"><?php esc_html_e( 'Other attractions nearby', 'explore-katsina' ); ?></h2>
				<ul class="ek-nearby">
					<?php foreach ( $other as $n ) : ?>
						<li><a href="<?php echo esc_url( $n['url'] ); ?>"><?php echo esc_html( $n['title'] ); ?></a><span class="ek-small ek-muted"><?php echo esc_html( Hotel_Search::format_distance( $n['distance'] / 1000 ) ); ?></span></li>
					<?php endforeach; ?>
				</ul>
			</section>
		<?php endif; ?>
	<?php endif; ?>

	<?php echo View::render( 'public/sources', array( 'sources' => Attractions::parse_sources( $a['sources'] ) ) ); // phpcs:ignore ?>
</div>
