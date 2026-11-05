<?php
/**
 * Find a hotel.
 *
 * @var array $p Params.
 * @var array $r Results.
 */
use EK\Assets;
use EK\Hotel;
use EK\Hotel_Search;
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;

$today     = EK\Availability::today();
$tomorrow  = ( new DateTimeImmutable( $today ) )->modify( '+1 day' )->format( 'Y-m-d' );
$base      = get_permalink();
$has_dates = $p['checkin'] && $p['checkout'];
$has_loc   = null !== $p['lat'];
$amen      = Hotel::amenities();
$sorts     = array(
	'distance' => __( 'Distance', 'explore-katsina' ),
	'rank'     => __( 'Rank', 'explore-katsina' ),
	'rating'   => __( 'Rating', 'explore-katsina' ),
	'price'    => __( 'Price (lowest first)', 'explore-katsina' ),
);
$pins      = array_map(
	static fn( $i ) => array(
		'id'    => $i['id'],
		'name'  => $i['name'],
		'url'   => add_query_arg( Hotel_Search::query_args( $p, array( 'sort' => '', 'view' => '' ) ), $i['url'] ),
		'lat'   => $i['lat'],
		'lng'   => $i['lng'],
		'price' => Money::format( $i['night'] ),
		'dist'  => Hotel_Search::format_distance( $i['distance'] ),
		'img'   => $i['photo'] ? wp_get_attachment_image_url( $i['photo'], 'medium' ) : '',
	),
	array_slice( $r['all'], 0, 300 )
);
$pages = (int) ceil( $r['total'] / Hotel_Search::PER_PAGE );
?>
<div class="ek ek-search">
	<form class="ek-search-box" method="get" action="<?php echo esc_url( $base ); ?>" data-ek-search-form>
		<h1 class="ek-search-title"><?php esc_html_e( 'Find a hotel in Katsina', 'explore-katsina' ); ?></h1>
		<div class="ek-search-grid">
			<div class="ek-field"><label for="s-in"><?php esc_html_e( 'Check-in', 'explore-katsina' ); ?></label><input type="date" id="s-in" name="checkin" min="<?php echo esc_attr( $today ); ?>" value="<?php echo esc_attr( $p['checkin'] ); ?>" data-ek-checkin></div>
			<div class="ek-field"><label for="s-out"><?php esc_html_e( 'Check-out', 'explore-katsina' ); ?></label><input type="date" id="s-out" name="checkout" min="<?php echo esc_attr( $tomorrow ); ?>" value="<?php echo esc_attr( $p['checkout'] ); ?>" data-ek-checkout></div>
			<div class="ek-field"><label for="s-g"><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></label><input type="number" id="s-g" name="guests" min="1" max="40" value="<?php echo (int) $p['guests']; ?>"></div>
			<div class="ek-field"><label for="s-r"><?php esc_html_e( 'Rooms', 'explore-katsina' ); ?></label><input type="number" id="s-r" name="rooms" min="1" max="20" value="<?php echo (int) $p['rooms']; ?>"></div>
			<div class="ek-field"><label for="s-lga"><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></label><select id="s-lga" name="lga"><?php echo str_replace( esc_html__( 'Choose LGA…', 'explore-katsina' ), esc_html__( 'All of Katsina State', 'explore-katsina' ), View::lga_options( $p['lga'] ) ); // phpcs:ignore ?></select></div>
		</div>
		<input type="hidden" name="lat" value="<?php echo esc_attr( $has_loc && ! $p['near'] ? $p['lat'] : '' ); ?>" data-ek-lat>
		<input type="hidden" name="lng" value="<?php echo esc_attr( $has_loc && ! $p['near'] ? $p['lng'] : '' ); ?>" data-ek-lng>
		<input type="hidden" name="sort" value="<?php echo esc_attr( $p['sort'] ); ?>" data-ek-sort-field>
		<div class="ek-row">
			<button class="ek-btn" type="submit"><?php esc_html_e( 'Search', 'explore-katsina' ); ?></button>
			<button class="ek-btn ek-btn--ghost-light" type="button" data-ek-near-me><?php echo $has_loc && ! $p['near'] ? '📍 ' . esc_html__( 'Using your location', 'explore-katsina' ) : esc_html__( 'Near me', 'explore-katsina' ); ?></button>
			<span class="ek-small" data-ek-near-status aria-live="polite"></span>
		</div>
		<?php if ( ! empty( $p['date_error'] ) ) : ?><p class="ek-notice ek-notice--error" style="margin:8px 0 0"><?php echo esc_html( $p['date_error'] ); ?></p><?php endif; ?>

		<details class="ek-filters"<?php echo ( $p['price_min'] || $p['price_max'] || $p['stars'] || $p['amenities'] || $p['room_type'] || $p['pay_venue'] ) ? ' open' : ''; ?>>
			<summary><?php esc_html_e( 'Filters', 'explore-katsina' ); ?></summary>
			<div class="ek-search-grid" style="margin-top:12px">
				<div class="ek-field"><label for="f-min"><?php esc_html_e( 'Min price per night (₦)', 'explore-katsina' ); ?></label><input type="text" inputmode="numeric" id="f-min" name="price_min" value="<?php echo $p['price_min'] ? esc_attr( $p['price_min'] / 100 ) : ''; ?>"></div>
				<div class="ek-field"><label for="f-max"><?php esc_html_e( 'Max price per night (₦)', 'explore-katsina' ); ?></label><input type="text" inputmode="numeric" id="f-max" name="price_max" value="<?php echo $p['price_max'] ? esc_attr( $p['price_max'] / 100 ) : ''; ?>"></div>
				<div class="ek-field"><label for="f-stars"><?php esc_html_e( 'Star rating', 'explore-katsina' ); ?></label><select id="f-stars" name="stars"><option value=""><?php esc_html_e( 'Any', 'explore-katsina' ); ?></option><?php for ( $i = 1; $i <= 5; $i++ ) : ?><option value="<?php echo (int) $i; ?>" <?php selected( $p['stars'], $i ); ?>><?php /* translators: %d: stars */ printf( esc_html__( '%d★ and up', 'explore-katsina' ), (int) $i ); ?></option><?php endfor; ?></select></div>
				<div class="ek-field"><label for="f-room"><?php esc_html_e( 'Room category', 'explore-katsina' ); ?></label><select id="f-room" name="room_type"><option value=""><?php esc_html_e( 'Any', 'explore-katsina' ); ?></option><?php foreach ( array( 'standard' => 'Standard', 'deluxe' => 'Deluxe', 'executive' => 'Executive', 'suite' => 'Suite', 'family' => 'Family' ) as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $p['room_type'], $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></div>
			</div>
			<fieldset style="border:0;padding:0;margin:12px 0 0"><legend class="ek-label"><?php esc_html_e( 'Amenities', 'explore-katsina' ); ?></legend>
				<div class="ek-checkgrid">
					<?php foreach ( array( 'wifi', 'parking', 'power', 'ac', 'pool', 'restaurant', 'airport', 'conference', 'prayer', 'accessible' ) as $k ) : ?>
						<label class="ek-check"><input type="checkbox" name="amenities[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $p['amenities'], true ) ); ?>> <?php echo esc_html( $amen[ $k ] ); ?></label>
					<?php endforeach; ?>
					<label class="ek-check"><input type="checkbox" name="pay_venue" value="1" <?php checked( $p['pay_venue'] ); ?>> <?php esc_html_e( 'Pay at hotel available', 'explore-katsina' ); ?></label>
				</div>
			</fieldset>
			<div class="ek-row" style="margin-top:12px"><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Apply filters', 'explore-katsina' ); ?></button><a class="ek-small" style="color:#fff" href="<?php echo esc_url( $base ); ?>"><?php esc_html_e( 'Clear all', 'explore-katsina' ); ?></a></div>
		</details>
	</form>

	<div class="ek-results-bar">
		<p class="ek-results-count" role="status">
			<?php
			if ( $has_dates ) {
				/* translators: 1: count, 2: check-in, 3: check-out */
				printf( esc_html( _n( '%1$d hotel available %2$s – %3$s', '%1$d hotels available %2$s – %3$s', $r['total'], 'explore-katsina' ) ), (int) $r['total'], esc_html( wp_date( 'j M', strtotime( $p['checkin'] ) ) ), esc_html( wp_date( 'j M', strtotime( $p['checkout'] ) ) ) );
			} else {
				/* translators: %d: count */
				printf( esc_html( _n( '%d hotel', '%d hotels', $r['total'], 'explore-katsina' ) ), (int) $r['total'] );
				echo ' · <span class="ek-muted">' . esc_html__( 'add dates to see availability and totals', 'explore-katsina' ) . '</span>';
			}
			?>
		</p>
		<div class="ek-row">
			<label class="ek-small" for="ek-sort"><?php esc_html_e( 'Sort by', 'explore-katsina' ); ?></label>
			<select id="ek-sort" data-ek-sort>
				<?php foreach ( $sorts as $k => $label ) : ?>
					<option value="<?php echo esc_attr( add_query_arg( Hotel_Search::query_args( $p, array( 'sort' => $k ) ), $base ) ); ?>" <?php selected( $p['sort'], $k ); ?><?php echo 'distance' === $k && ! $has_loc ? ' disabled' : ''; ?>><?php echo esc_html( $label ); ?><?php echo 'distance' === $k && ! $has_loc ? ' ' . esc_html__( '(tap Near me)', 'explore-katsina' ) : ''; ?></option>
				<?php endforeach; ?>
			</select>
			<noscript><span class="ek-small"><?php foreach ( $sorts as $k => $label ) { echo '<a href="' . esc_url( add_query_arg( Hotel_Search::query_args( $p, array( 'sort' => $k ) ), $base ) ) . '">' . esc_html( $label ) . '</a> '; } ?></span></noscript>
			<div class="ek-seg" role="group" aria-label="<?php esc_attr_e( 'View', 'explore-katsina' ); ?>">
				<a href="<?php echo esc_url( add_query_arg( Hotel_Search::query_args( $p, array( 'view' => '' ) ), $base ) ); ?>"<?php echo 'list' === $p['view'] ? ' aria-current="true"' : ''; ?>><?php esc_html_e( 'List', 'explore-katsina' ); ?></a>
				<a href="<?php echo esc_url( add_query_arg( Hotel_Search::query_args( $p, array( 'view' => 'map' ) ), $base ) ); ?>"<?php echo 'map' === $p['view'] ? ' aria-current="true"' : ''; ?>><?php esc_html_e( 'Map', 'explore-katsina' ); ?></a>
			</div>
		</div>
	</div>

	<?php if ( 'map' === $p['view'] ) : ?>
		<div class="ek-results-map" data-ek-results-map data-pins="<?php echo esc_attr( wp_json_encode( $pins ) ); ?>" data-colour="<?php echo esc_attr( Assets::map_config()['pinColours']['hotel'] ); ?>" data-me="<?php echo esc_attr( $has_loc ? wp_json_encode( array( $p['lat'], $p['lng'] ) ) : '' ); ?>" role="region" aria-label="<?php esc_attr_e( 'Map of hotels', 'explore-katsina' ); ?>"></div>
	<?php endif; ?>

	<?php if ( ! $r['items'] ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No hotels match your search', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Try other dates, fewer filters, or all of Katsina State.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<ol class="ek-results" start="<?php echo (int) ( ( $p['page'] - 1 ) * Hotel_Search::PER_PAGE + 1 ); ?>">
			<?php
			foreach ( $r['items'] as $i ) :
				$link = add_query_arg( Hotel_Search::query_args( $p, array( 'sort' => '', 'view' => '', 'price_min' => '', 'price_max' => '', 'stars' => '', 'pay_venue' => '', 'lga' => '', 'lat' => '', 'lng' => '', 'near' => '', 'amenities' => array() ) ), $i['url'] );
				?>
				<li class="ek-result">
					<a class="ek-result-img" href="<?php echo esc_url( $link ); ?>" tabindex="-1" aria-hidden="true"><?php echo $i['photo'] ? wp_get_attachment_image( $i['photo'], 'medium_large', false, array( 'loading' => 'lazy', 'alt' => '' ) ) : '<span class="ek-result-noimg"></span>'; // phpcs:ignore ?></a>
					<div class="ek-result-body">
						<div class="ek-result-top">
							<h2 class="ek-result-name"><a href="<?php echo esc_url( $link ); ?>"><?php echo esc_html( $i['name'] ); ?></a></h2>
							<?php if ( $i['stars'] ) : ?><span class="ek-hotel-stars" title="<?php echo $i['stars_ok'] ? esc_attr__( 'Verified star rating', 'explore-katsina' ) : esc_attr__( 'Self-declared star rating', 'explore-katsina' ); ?>"><?php echo esc_html( str_repeat( '★', $i['stars'] ) ); ?><span class="ek-visually-hidden"><?php /* translators: %d: stars */ printf( esc_html__( '%d-star hotel', 'explore-katsina' ), (int) $i['stars'] ); ?></span></span><?php endif; ?>
						</div>
						<p class="ek-result-meta"><?php echo esc_html( $i['lga'] ); ?><?php echo null !== $i['distance'] ? ' · <strong>' . esc_html( Hotel_Search::format_distance( $i['distance'] ) ) . '</strong>' : ''; ?></p>
						<div class="ek-row" style="gap:6px">
							<?php if ( $i['reviews'] ) : ?><span class="ek-score"><?php echo esc_html( number_format_i18n( $i['rating'], 1 ) ); ?></span><span class="ek-small"><?php /* translators: %d: reviews */ printf( esc_html( _n( '%d verified review', '%d verified reviews', $i['reviews'], 'explore-katsina' ) ), (int) $i['reviews'] ); ?></span><?php else : ?><span class="ek-small ek-muted"><?php esc_html_e( 'No reviews yet', 'explore-katsina' ); ?></span><?php endif; ?>
							<?php if ( $i['rank'] ) : ?><span class="ek-pill">#<?php echo (int) $i['rank']; ?> <?php /* translators: %d: total */ printf( esc_html__( 'of %d hotels in Katsina', 'explore-katsina' ), (int) $i['rank_total'] ); ?></span><?php endif; ?>
							<?php if ( $i['verified'] ) : ?><span class="ek-badge ek-badge--verified">✓ <?php esc_html_e( 'Verified', 'explore-katsina' ); ?></span><?php endif; ?>
						</div>
						<p class="ek-small ek-muted ek-result-amen"><?php echo esc_html( implode( ' · ', array_slice( array_map( static fn( $k ) => $amen[ $k ], $i['amenities'] ), 0, 4 ) ) ); ?></p>
						<?php if ( $i['pay_venue'] ) : ?><span class="ek-pill ek-pill--ok"><?php esc_html_e( 'Pay at hotel available', 'explore-katsina' ); ?></span><?php endif; ?>
					</div>
					<div class="ek-result-price">
						<?php if ( $has_dates ) : ?>
							<span class="ek-small ek-muted"><?php /* translators: 1: nights, 2: rooms */ printf( esc_html__( '%1$d nights, %2$d room(s)', 'explore-katsina' ), (int) $i['nights'], (int) $p['rooms'] ); ?></span>
							<strong class="ek-price-big"><?php echo esc_html( Money::format( $i['total'] ) ); ?></strong>
							<span class="ek-small"><?php echo esc_html( Money::format( $i['night'] ) ); ?> <?php esc_html_e( 'avg / night', 'explore-katsina' ); ?></span>
						<?php else : ?>
							<span class="ek-small ek-muted"><?php esc_html_e( 'from', 'explore-katsina' ); ?></span>
							<strong class="ek-price-big"><?php echo esc_html( Money::format( $i['night'] ) ); ?></strong>
							<span class="ek-small"><?php esc_html_e( 'per night', 'explore-katsina' ); ?></span>
						<?php endif; ?>
						<a class="ek-btn ek-btn--sm" href="<?php echo esc_url( $link ); ?>"><?php esc_html_e( 'See rooms', 'explore-katsina' ); ?></a>
					</div>
				</li>
			<?php endforeach; ?>
		</ol>
		<?php if ( $pages > 1 ) : ?>
			<nav class="ek-pages" aria-label="<?php esc_attr_e( 'Pages', 'explore-katsina' ); ?>">
				<?php for ( $n = 1; $n <= $pages; $n++ ) : ?>
					<a href="<?php echo esc_url( add_query_arg( Hotel_Search::query_args( $p, array( 'pg' => $n > 1 ? $n : '' ) ), $base ) ); ?>"<?php echo $n === $p['page'] ? ' aria-current="page"' : ''; ?>><?php echo (int) $n; ?></a>
				<?php endfor; ?>
			</nav>
		<?php endif; ?>
	<?php endif; ?>
</div>
