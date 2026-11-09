<?php
/**
 * Find a restaurant.
 *
 * @var array $p
 * @var array $r
 */
use EK\Assets;
use EK\Hotel_Search;
use EK\Restaurant;
use EK\Restaurant_Search;
use EK\View;

defined( 'ABSPATH' ) || exit;

$base    = get_permalink();
$has_loc = null !== $p['lat'];
$cuis    = Restaurant::cuisines();
$levels  = Restaurant::price_levels();
$sorts   = array(
	'distance' => __( 'Distance', 'explore-katsina' ),
	'rank'     => __( 'Rank', 'explore-katsina' ),
	'rating'   => __( 'Rating', 'explore-katsina' ),
	'price'    => __( 'Price (lowest first)', 'explore-katsina' ),
);
$pins    = array_map(
	static fn( $i ) => array(
		'id'    => $i['id'],
		'name'  => $i['name'],
		'url'   => $i['url'],
		'lat'   => $i['lat'],
		'lng'   => $i['lng'],
		'price' => $levels[ $i['level'] ][0],
		'dist'  => Hotel_Search::format_distance( $i['distance'] ),
		'img'   => $i['photo'] ? wp_get_attachment_image_url( $i['photo'], 'medium' ) : '',
	),
	array_slice( $r['all'], 0, 300 )
);
$pages   = (int) ceil( $r['total'] / Restaurant_Search::PER_PAGE );
?>
<div class="ek ek-search">
	<form class="ek-search-box" method="get" action="<?php echo esc_url( $base ); ?>" data-ek-search-form>
		<h1 class="ek-search-title"><?php esc_html_e( 'Find a restaurant in Katsina', 'explore-katsina' ); ?></h1>
		<div class="ek-search-grid ek-search-grid--food">
			<div class="ek-field"><label for="r-cuis"><?php esc_html_e( 'Food', 'explore-katsina' ); ?></label><select id="r-cuis" name="cuisine"><option value=""><?php esc_html_e( 'Any food', 'explore-katsina' ); ?></option><?php foreach ( $cuis as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $p['cuisine'], $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></div>
			<div class="ek-field"><label for="r-price"><?php esc_html_e( 'Price range', 'explore-katsina' ); ?></label><select id="r-price" name="price"><option value=""><?php esc_html_e( 'Any price', 'explore-katsina' ); ?></option><?php foreach ( $levels as $lvl => $pl ) : ?><option value="<?php echo (int) $lvl; ?>" <?php selected( $p['price'], $lvl ); ?>><?php /* translators: 1: symbols, 2: description */ printf( esc_html__( 'Up to %1$s (%2$s)', 'explore-katsina' ), esc_html( $pl[0] ), esc_html( $pl[1] ) ); ?></option><?php endforeach; ?></select></div>
			<div class="ek-field"><label for="r-lga"><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></label><select id="r-lga" name="lga"><?php echo str_replace( esc_html__( 'Choose LGA…', 'explore-katsina' ), esc_html__( 'All of Katsina State', 'explore-katsina' ), View::lga_options( $p['lga'] ) ); // phpcs:ignore ?></select></div>
			<div class="ek-field"><label for="r-rate"><?php esc_html_e( 'Rating', 'explore-katsina' ); ?></label><select id="r-rate" name="min_rating"><option value=""><?php esc_html_e( 'Any rating', 'explore-katsina' ); ?></option><?php foreach ( array( 3, 3.5, 4, 4.5 ) as $rt ) : ?><option value="<?php echo esc_attr( $rt ); ?>" <?php selected( (string) $p['min_rating'], (string) $rt ); ?>><?php /* translators: %s: rating */ printf( esc_html__( '%s+', 'explore-katsina' ), esc_html( number_format_i18n( $rt, 1 ) ) ); ?></option><?php endforeach; ?></select></div>
		</div>
		<div class="ek-row">
			<label class="ek-check" style="color:#fff"><input type="checkbox" name="open_now" value="1" <?php checked( $p['open_now'] ); ?>> <?php esc_html_e( 'Open now', 'explore-katsina' ); ?></label>
			<label class="ek-check" style="color:#fff"><input type="checkbox" name="halal" value="1" <?php checked( $p['halal'] ); ?>> <?php esc_html_e( 'Halal', 'explore-katsina' ); ?></label>
		</div>
		<input type="hidden" name="lat" value="<?php echo esc_attr( $has_loc && ! $p['near'] ? $p['lat'] : '' ); ?>" data-ek-lat>
		<input type="hidden" name="lng" value="<?php echo esc_attr( $has_loc && ! $p['near'] ? $p['lng'] : '' ); ?>" data-ek-lng>
		<input type="hidden" name="sort" value="<?php echo esc_attr( $p['sort'] ); ?>" data-ek-sort-field>
		<div class="ek-row">
			<button class="ek-btn" type="submit"><?php esc_html_e( 'Search', 'explore-katsina' ); ?></button>
			<button class="ek-btn ek-btn--ghost-light" type="button" data-ek-near-me><?php echo $has_loc && ! $p['near'] ? '📍 ' . esc_html__( 'Using your location', 'explore-katsina' ) : esc_html__( 'Near me', 'explore-katsina' ); ?></button>
			<span class="ek-small" data-ek-near-status aria-live="polite"></span>
		</div>
	</form>

	<div class="ek-results-bar">
		<p class="ek-results-count" role="status"><?php /* translators: %d: count */ printf( esc_html( _n( '%d restaurant', '%d restaurants', $r['total'], 'explore-katsina' ) ), (int) $r['total'] ); ?></p>
		<div class="ek-row">
			<label class="ek-small" for="ek-sort"><?php esc_html_e( 'Sort by', 'explore-katsina' ); ?></label>
			<select id="ek-sort" data-ek-sort>
				<?php foreach ( $sorts as $k => $label ) : ?>
					<option value="<?php echo esc_attr( add_query_arg( Restaurant_Search::query_args( $p, array( 'sort' => $k ) ), $base ) ); ?>" <?php selected( $p['sort'], $k ); ?><?php echo 'distance' === $k && ! $has_loc ? ' disabled' : ''; ?>><?php echo esc_html( $label ); ?><?php echo 'distance' === $k && ! $has_loc ? ' ' . esc_html__( '(tap Near me)', 'explore-katsina' ) : ''; ?></option>
				<?php endforeach; ?>
			</select>
			<div class="ek-seg" role="group" aria-label="<?php esc_attr_e( 'View', 'explore-katsina' ); ?>">
				<a href="<?php echo esc_url( add_query_arg( Restaurant_Search::query_args( $p, array( 'view' => '' ) ), $base ) ); ?>"<?php echo 'list' === $p['view'] ? ' aria-current="true"' : ''; ?>><?php esc_html_e( 'List', 'explore-katsina' ); ?></a>
				<a href="<?php echo esc_url( add_query_arg( Restaurant_Search::query_args( $p, array( 'view' => 'map' ) ), $base ) ); ?>"<?php echo 'map' === $p['view'] ? ' aria-current="true"' : ''; ?>><?php esc_html_e( 'Map', 'explore-katsina' ); ?></a>
			</div>
		</div>
	</div>

	<?php if ( 'map' === $p['view'] ) : ?>
		<div class="ek-results-map" data-ek-results-map data-pins="<?php echo esc_attr( wp_json_encode( $pins ) ); ?>" data-colour="<?php echo esc_attr( Assets::map_config()['pinColours']['restaurant'] ); ?>" data-me="<?php echo esc_attr( $has_loc ? wp_json_encode( array( $p['lat'], $p['lng'] ) ) : '' ); ?>" data-unit="" role="region" aria-label="<?php esc_attr_e( 'Map of restaurants', 'explore-katsina' ); ?>"></div>
	<?php endif; ?>

	<?php if ( ! $r['items'] ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No restaurants match your search', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Try fewer filters, or all of Katsina State.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<?php echo \EK\Ads::zone( 'search' ); // phpcs:ignore ?>
		<ol class="ek-results">
			<?php foreach ( $r['items'] as $i ) : ?>
				<li class="ek-result">
					<a class="ek-result-img" href="<?php echo esc_url( $i['url'] ); ?>" tabindex="-1" aria-hidden="true"><?php echo $i['photo'] ? wp_get_attachment_image( $i['photo'], 'medium_large', false, array( 'loading' => 'lazy', 'alt' => '' ) ) : '<span class="ek-result-noimg"></span>'; // phpcs:ignore ?></a>
					<div class="ek-result-body">
						<div class="ek-result-top"><h2 class="ek-result-name"><a href="<?php echo esc_url( $i['url'] ); ?>"><?php echo esc_html( $i['name'] ); ?></a></h2><span class="ek-price-level" title="<?php echo esc_attr( $levels[ $i['level'] ][1] ); ?>"><?php echo esc_html( $levels[ $i['level'] ][0] ); ?></span></div>
						<p class="ek-result-meta"><?php echo esc_html( implode( ' · ', array_map( static fn( $c ) => $cuis[ $c ], array_slice( $i['cuisines'], 0, 3 ) ) ) ); ?></p>
						<p class="ek-result-meta"><?php echo esc_html( $i['lga'] ); ?><?php echo null !== $i['distance'] ? ' · <strong>' . esc_html( Hotel_Search::format_distance( $i['distance'] ) ) . '</strong>' : ''; ?></p>
						<div class="ek-row" style="gap:6px">
							<span class="ek-pill <?php echo $i['open'] ? 'ek-pill--ok' : 'ek-pill--bad'; ?>"><?php echo $i['open'] ? esc_html__( 'Open now', 'explore-katsina' ) : esc_html__( 'Closed now', 'explore-katsina' ); ?></span>
							<?php if ( $i['halal'] ) : ?><span class="ek-pill"><?php esc_html_e( 'Halal', 'explore-katsina' ); ?></span><?php endif; ?>
							<?php if ( $i['reviews'] ) : ?><span class="ek-score"><?php echo esc_html( number_format_i18n( $i['rating'], 1 ) ); ?></span><span class="ek-small"><?php /* translators: %d: reviews */ printf( esc_html( _n( '%d verified review', '%d verified reviews', $i['reviews'], 'explore-katsina' ) ), (int) $i['reviews'] ); ?></span><?php else : ?><span class="ek-small ek-muted"><?php esc_html_e( 'No reviews yet', 'explore-katsina' ); ?></span><?php endif; ?>
							<?php if ( ! empty( $i['featured'] ) ) : ?><span class="ek-badge ek-badge--featured"><?php esc_html_e( 'Featured', 'explore-katsina' ); ?></span><?php endif; ?><?php if ( $i['rank'] ) : ?><span class="ek-pill">#<?php echo (int) $i['rank']; ?> <?php /* translators: %d: total */ printf( esc_html__( 'of %d restaurants in Katsina', 'explore-katsina' ), (int) $i['rank_total'] ); ?></span><?php endif; ?>
							<?php if ( $i['verified'] ) : ?><span class="ek-badge ek-badge--verified">✓ <?php esc_html_e( 'Verified', 'explore-katsina' ); ?></span><?php endif; ?>
						</div>
					</div>
					<div class="ek-result-price">
						<a class="ek-btn ek-btn--sm" href="<?php echo esc_url( $i['url'] . '#menu' ); ?>"><?php esc_html_e( 'See menu', 'explore-katsina' ); ?></a>
						<?php if ( $i['reserve'] ) : ?><a class="ek-btn ek-btn--sm ek-btn--ghost" href="<?php echo esc_url( $i['url'] . '#reserve' ); ?>"><?php esc_html_e( 'Reserve a table', 'explore-katsina' ); ?></a><?php endif; ?>
					</div>
				</li>
			<?php endforeach; ?>
		</ol>
		<?php if ( $pages > 1 ) : ?>
			<nav class="ek-pages" aria-label="<?php esc_attr_e( 'Pages', 'explore-katsina' ); ?>">
				<?php for ( $n = 1; $n <= $pages; $n++ ) : ?><a href="<?php echo esc_url( add_query_arg( Restaurant_Search::query_args( $p, array( 'pg' => $n > 1 ? $n : '' ) ), $base ) ); ?>"<?php echo $n === $p['page'] ? ' aria-current="page"' : ''; ?>><?php echo (int) $n; ?></a><?php endfor; ?>
			</nav>
		<?php endif; ?>
	<?php endif; ?>
</div>
