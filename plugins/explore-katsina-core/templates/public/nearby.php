<?php
/**
 * Nearby places (approved businesses and attractions within 5 km), from the map index.
 *
 * @var array $ek_near Pins from Map_Index::near() (set by the page before the small map).
 */
use EK\Hotel_Search;
use EK\Install;

defined( 'ABSPATH' ) || exit;

$near = array_slice( $ek_near ?? array(), 0, 6 );
if ( ! $near ) {
	return;
}
?>
<section aria-labelledby="near-h">
	<h2 id="near-h"><?php esc_html_e( 'Nearby', 'explore-katsina' ); ?></h2>
	<ul class="ek-nearby">
		<?php foreach ( $near as $n ) : ?>
			<li><a href="<?php echo esc_url( $n['url'] ); ?>"><?php echo esc_html( $n['title'] ); ?></a><span class="ek-small ek-muted"><?php echo esc_html( $n['typeLabel'] . ' · ' . Hotel_Search::format_distance( $n['distance'] / 1000 ) ); ?></span></li>
		<?php endforeach; ?>
	</ul>
	<p class="ek-small" style="margin:8px 0 0"><a href="<?php echo esc_url( Install::page_url( 'map' ) ); ?>"><?php esc_html_e( 'See everything on the Katsina Map →', 'explore-katsina' ); ?></a></p>
</section>
