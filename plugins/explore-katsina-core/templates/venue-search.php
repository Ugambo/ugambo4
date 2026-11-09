<?php
/**
 * Find an event centre.
 *
 * @var array $p
 * @var array $r
 */
use EK\Assets;
use EK\Hotel_Search;
use EK\Money;
use EK\Venue;
use EK\Venue_Search;
use EK\View;

defined( 'ABSPATH' ) || exit;

$base    = get_permalink();
$has_loc = null !== $p['lat'];
$amen    = Venue::amenities();
$sorts   = array(
	'distance' => __( 'Distance', 'explore-katsina' ),
	'rank'     => __( 'Rank', 'explore-katsina' ),
	'rating'   => __( 'Rating', 'explore-katsina' ),
	'price'    => __( 'Price (lowest first)', 'explore-katsina' ),
);
$pins    = array_map(
	static fn( $i ) => array( 'id' => $i['id'], 'name' => $i['name'], 'url' => $i['url'], 'lat' => $i['lat'], 'lng' => $i['lng'], 'price' => __( 'from', 'explore-katsina' ) . ' ' . Money::format( $i['price'] ), 'dist' => Hotel_Search::format_distance( $i['distance'] ), 'img' => $i['photo'] ? wp_get_attachment_image_url( $i['photo'], 'medium' ) : '' ),
	array_slice( $r['all'], 0, 300 )
);
$pages   = (int) ceil( $r['total'] / Venue_Search::PER_PAGE );
$link_q  = array_filter( array( 'date' => $p['date'], 'guests' => $p['guests'] ? $p['guests'] : '', 'layout' => 'standing' === $p['layout'] ? 'standing' : '' ) );
?>
<div class="ek ek-search">
	<form class="ek-search-box" method="get" action="<?php echo esc_url( $base ); ?>" data-ek-search-form>
		<h1 class="ek-search-title"><?php esc_html_e( 'Find an event centre in Katsina', 'explore-katsina' ); ?></h1>
		<div class="ek-search-grid ek-search-grid--food">
			<div class="ek-field"><label for="v-date"><?php esc_html_e( 'Event date', 'explore-katsina' ); ?></label><input type="date" id="v-date" name="date" min="<?php echo esc_attr( EK\Availability::today() ); ?>" value="<?php echo esc_attr( $p['date'] ); ?>"></div>
			<div class="ek-field"><label for="v-guests"><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></label><input type="number" id="v-guests" name="guests" min="1" max="50000" value="<?php echo $p['guests'] ? (int) $p['guests'] : ''; ?>" placeholder="200"></div>
			<div class="ek-field"><label for="v-layout"><?php esc_html_e( 'Seated or standing', 'explore-katsina' ); ?></label><select id="v-layout" name="layout"><option value="seated" <?php selected( $p['layout'], 'seated' ); ?>><?php esc_html_e( 'Seated', 'explore-katsina' ); ?></option><option value="standing" <?php selected( $p['layout'], 'standing' ); ?>><?php esc_html_e( 'Standing', 'explore-katsina' ); ?></option></select></div>
			<div class="ek-field"><label for="v-lga"><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></label><select id="v-lga" name="lga"><?php echo str_replace( esc_html__( 'Choose LGA…', 'explore-katsina' ), esc_html__( 'All of Katsina State', 'explore-katsina' ), View::lga_options( $p['lga'] ) ); // phpcs:ignore ?></select></div>
		</div>
		<input type="hidden" name="lat" value="<?php echo esc_attr( $has_loc ? $p['lat'] : '' ); ?>" data-ek-lat>
		<input type="hidden" name="lng" value="<?php echo esc_attr( $has_loc ? $p['lng'] : '' ); ?>" data-ek-lng>
		<input type="hidden" name="sort" value="<?php echo esc_attr( $p['sort'] ); ?>" data-ek-sort-field>
		<div class="ek-row">
			<button class="ek-btn" type="submit"><?php esc_html_e( 'Search', 'explore-katsina' ); ?></button>
			<button class="ek-btn ek-btn--ghost-light" type="button" data-ek-near-me><?php echo $has_loc ? '📍 ' . esc_html__( 'Using your location', 'explore-katsina' ) : esc_html__( 'Near me', 'explore-katsina' ); ?></button>
			<span class="ek-small" data-ek-near-status aria-live="polite"></span>
		</div>
		<details class="ek-filters"<?php echo ( $p['price_max'] || $p['amenities'] ) ? ' open' : ''; ?>>
			<summary><?php esc_html_e( 'Filters', 'explore-katsina' ); ?></summary>
			<div class="ek-search-grid" style="margin-top:12px"><div class="ek-field"><label for="v-max"><?php esc_html_e( 'Max hall price (₦)', 'explore-katsina' ); ?></label><input type="text" inputmode="numeric" id="v-max" name="price_max" value="<?php echo $p['price_max'] ? esc_attr( $p['price_max'] / 100 ) : ''; ?>"></div></div>
			<fieldset style="border:0;padding:0;margin:12px 0 0"><legend class="ek-label"><?php esc_html_e( 'Amenities', 'explore-katsina' ); ?></legend>
				<div class="ek-checkgrid"><?php foreach ( $amen as $k => $label ) : ?><label class="ek-check"><input type="checkbox" name="amenities[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $p['amenities'], true ) ); ?>> <?php echo esc_html( $label ); ?></label><?php endforeach; ?></div>
			</fieldset>
			<div class="ek-row" style="margin-top:12px"><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Apply filters', 'explore-katsina' ); ?></button><a class="ek-small" style="color:#fff" href="<?php echo esc_url( $base ); ?>"><?php esc_html_e( 'Clear all', 'explore-katsina' ); ?></a></div>
		</details>
	</form>

	<div class="ek-results-bar">
		<p class="ek-results-count" role="status"><?php if ( $p['date'] ) { /* translators: 1: count, 2: date */ printf( esc_html( _n( '%1$d event centre free on %2$s', '%1$d event centres free on %2$s', $r['total'], 'explore-katsina' ) ), (int) $r['total'], esc_html( wp_date( 'j M Y', strtotime( $p['date'] ) ) ) ); } else { /* translators: %d: count */ printf( esc_html( _n( '%d event centre', '%d event centres', $r['total'], 'explore-katsina' ) ), (int) $r['total'] ); echo ' · <span class="ek-muted">' . esc_html__( 'add a date to see who is free', 'explore-katsina' ) . '</span>'; } ?></p>
		<div class="ek-row">
			<label class="ek-small" for="ek-sort"><?php esc_html_e( 'Sort by', 'explore-katsina' ); ?></label>
			<select id="ek-sort" data-ek-sort><?php foreach ( $sorts as $k => $label ) : ?><option value="<?php echo esc_attr( add_query_arg( Venue_Search::query_args( $p, array( 'sort' => $k ) ), $base ) ); ?>" <?php selected( $p['sort'], $k ); ?><?php echo 'distance' === $k && ! $has_loc ? ' disabled' : ''; ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select>
			<div class="ek-seg" role="group" aria-label="<?php esc_attr_e( 'View', 'explore-katsina' ); ?>">
				<a href="<?php echo esc_url( add_query_arg( Venue_Search::query_args( $p, array( 'view' => '' ) ), $base ) ); ?>"<?php echo 'list' === $p['view'] ? ' aria-current="true"' : ''; ?>><?php esc_html_e( 'List', 'explore-katsina' ); ?></a>
				<a href="<?php echo esc_url( add_query_arg( Venue_Search::query_args( $p, array( 'view' => 'map' ) ), $base ) ); ?>"<?php echo 'map' === $p['view'] ? ' aria-current="true"' : ''; ?>><?php esc_html_e( 'Map', 'explore-katsina' ); ?></a>
			</div>
		</div>
	</div>

	<?php if ( 'map' === $p['view'] ) : ?>
		<div class="ek-results-map" data-ek-results-map data-kind="event" data-unit="" data-pins="<?php echo esc_attr( wp_json_encode( $pins ) ); ?>" data-colour="<?php echo esc_attr( Assets::map_config()['pinColours']['event-centre'] ); ?>" data-me="<?php echo esc_attr( $has_loc ? wp_json_encode( array( $p['lat'], $p['lng'] ) ) : '' ); ?>" role="region" aria-label="<?php esc_attr_e( 'Map of event centres', 'explore-katsina' ); ?>"></div>
	<?php endif; ?>

	<?php if ( ! $r['items'] ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No event centres match your search', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Try another date, fewer guests or all of Katsina State.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<ol class="ek-results">
			<?php foreach ( $r['items'] as $i ) : $link = add_query_arg( $link_q, $i['url'] ) . '#halls'; ?>
				<li class="ek-result">
					<a class="ek-result-img" href="<?php echo esc_url( $link ); ?>" tabindex="-1" aria-hidden="true"><?php echo $i['photo'] ? wp_get_attachment_image( $i['photo'], 'medium_large', false, array( 'loading' => 'lazy', 'alt' => '' ) ) : '<span class="ek-result-noimg"></span>'; // phpcs:ignore ?></a>
					<div class="ek-result-body">
						<h2 class="ek-result-name"><a href="<?php echo esc_url( $link ); ?>"><?php echo esc_html( $i['name'] ); ?></a></h2>
						<p class="ek-result-meta"><?php echo esc_html( $i['lga'] ); ?><?php echo null !== $i['distance'] ? ' · <strong>' . esc_html( Hotel_Search::format_distance( $i['distance'] ) ) . '</strong>' : ''; ?></p>
						<p class="ek-result-meta"><?php /* translators: 1: halls, 2: capacity */ printf( esc_html( _n( '%1$d hall · up to %2$s guests', '%1$d halls · up to %2$s guests', $i['halls'], 'explore-katsina' ) ), (int) $i['halls'], esc_html( number_format_i18n( $i['capacity'] ) ) ); ?></p>
						<div class="ek-row" style="gap:6px">
							<?php if ( $i['reviews'] ) : ?><span class="ek-score"><?php echo esc_html( number_format_i18n( $i['rating'], 1 ) ); ?></span><span class="ek-small"><?php /* translators: %d: reviews */ printf( esc_html( _n( '%d verified review', '%d verified reviews', $i['reviews'], 'explore-katsina' ) ), (int) $i['reviews'] ); ?></span><?php else : ?><span class="ek-small ek-muted"><?php esc_html_e( 'No reviews yet', 'explore-katsina' ); ?></span><?php endif; ?>
							<?php if ( $i['rank'] ) : ?><span class="ek-pill">#<?php echo (int) $i['rank']; ?> <?php /* translators: %d: total */ printf( esc_html__( 'of %d event centres in Katsina', 'explore-katsina' ), (int) $i['rank_total'] ); ?></span><?php endif; ?>
							<span class="ek-pill"><?php echo 'instant' === $i['mode'] ? esc_html__( 'Instant booking', 'explore-katsina' ) : esc_html__( 'Request to book', 'explore-katsina' ); ?></span>
						</div>
						<p class="ek-small ek-muted ek-result-amen"><?php echo esc_html( implode( ' · ', array_slice( array_map( static fn( $k ) => $amen[ $k ], $i['amenities'] ), 0, 4 ) ) ); ?></p>
					</div>
					<div class="ek-result-price">
						<span class="ek-small ek-muted"><?php esc_html_e( 'from', 'explore-katsina' ); ?></span>
						<strong class="ek-price-big"><?php echo esc_html( Money::format( $i['price'] ) ); ?></strong>
						<span class="ek-small"><?php echo 'event' === $i['pricing'] ? esc_html__( 'per event', 'explore-katsina' ) : esc_html__( 'per day', 'explore-katsina' ); ?></span>
						<a class="ek-btn ek-btn--sm" href="<?php echo esc_url( $link ); ?>"><?php esc_html_e( 'See halls', 'explore-katsina' ); ?></a>
					</div>
				</li>
			<?php endforeach; ?>
		</ol>
		<?php if ( $pages > 1 ) : ?><nav class="ek-pages" aria-label="<?php esc_attr_e( 'Pages', 'explore-katsina' ); ?>"><?php for ( $n = 1; $n <= $pages; $n++ ) : ?><a href="<?php echo esc_url( add_query_arg( Venue_Search::query_args( $p, array( 'pg' => $n > 1 ? $n : '' ) ), $base ) ); ?>"<?php echo $n === $p['page'] ? ' aria-current="page"' : ''; ?>><?php echo (int) $n; ?></a><?php endfor; ?></nav><?php endif; ?>
	<?php endif; ?>
</div>
