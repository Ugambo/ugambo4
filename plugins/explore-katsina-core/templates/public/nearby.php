<?php
/**
 * Nearby places (other approved businesses within 5 km). Attractions are added in Phase 10.
 *
 * @var array $b
 */
use EK\Business;
use EK\Hotel_Search;
use EK\Post_Types;

defined( 'ABSPATH' ) || exit;

$near = array();
foreach ( get_posts( array( 'post_type' => Post_Types::BUSINESS, 'post_status' => 'publish', 'posts_per_page' => 300, 'exclude' => array( $b['id'] ), 'no_found_rows' => true ) ) as $post ) {
	$lat = (float) get_post_meta( $post->ID, '_ek_lat', true );
	$lng = (float) get_post_meta( $post->ID, '_ek_lng', true );
	$km  = Hotel_Search::distance( $b['lat'], $b['lng'], $lat, $lng );
	if ( $km <= 5 ) {
		$near[] = array( 'post' => $post, 'km' => $km );
	}
}
usort( $near, static fn( $x, $y ) => $x['km'] <=> $y['km'] );
$near  = array_slice( $near, 0, 6 );
$types = Business::types();
if ( ! $near ) {
	return;
}
?>
<section aria-labelledby="near-h">
	<h2 id="near-h"><?php esc_html_e( 'Nearby', 'explore-katsina' ); ?></h2>
	<ul class="ek-nearby">
		<?php foreach ( $near as $n ) : $near_type = Business::type_of( $n['post']->ID ); ?>
			<li><a href="<?php echo esc_url( get_permalink( $n['post'] ) ); ?>"><?php echo esc_html( $n['post']->post_title ); ?></a><span class="ek-small ek-muted"><?php echo esc_html( ( $types[ $near_type ]['label'] ?? '' ) . ' · ' . Hotel_Search::format_distance( $n['km'] ) ); ?></span></li>
		<?php endforeach; ?>
	</ul>
</section>
