<?php
/**
 * Katsina Map: filters + synced list (side panel on desktop, bottom sheet on phones) + map.
 */
use EK\Install;
use EK\Map_Index;
use EK\Map_Page;
use EK\View;

defined( 'ABSPATH' ) || exit;
$cfg    = \EK\Assets::map_config();
$labels = Map_Page::type_labels();
$want   = isset( $_GET['type'] ) ? array_intersect( array_map( 'sanitize_key', explode( ',', wp_unslash( $_GET['type'] ) ) ), Map_Page::TYPES ) : Map_Page::TYPES; // phpcs:ignore
$lga    = absint( $_GET['lga'] ?? 0 ); // phpcs:ignore
?>
<div class="ek ek-kmap" data-ek-kmap>
	<header class="ek-kmap-bar">
		<a class="ek-kmap-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>">EXPLORE KATSINA</a>
		<h1><?php esc_html_e( 'Katsina Map', 'explore-katsina' ); ?></h1>
		<nav aria-label="<?php esc_attr_e( 'Site', 'explore-katsina' ); ?>"><a href="<?php echo esc_url( Install::page_url( 'hotels' ) ); ?>"><?php esc_html_e( 'Hotels', 'explore-katsina' ); ?></a><a href="<?php echo esc_url( Install::page_url( 'restaurants' ) ); ?>"><?php esc_html_e( 'Restaurants', 'explore-katsina' ); ?></a><a href="<?php echo esc_url( Install::page_url( 'event_centres' ) ); ?>"><?php esc_html_e( 'Event centres', 'explore-katsina' ); ?></a></nav>
	</header>
	<div class="ek-kmap-main">
		<aside class="ek-kmap-panel" data-panel aria-label="<?php esc_attr_e( 'Places and filters', 'explore-katsina' ); ?>">
			<button type="button" class="ek-kmap-handle" data-sheet-toggle aria-expanded="false" aria-controls="ek-kmap-sheet"><span class="ek-kmap-grip" aria-hidden="true"></span><span data-count><?php esc_html_e( 'Loading…', 'explore-katsina' ); ?></span><span class="ek-kmap-handle-cta" data-sheet-cta><?php esc_html_e( 'Show list', 'explore-katsina' ); ?></span></button>
			<div class="ek-kmap-sheet" id="ek-kmap-sheet">
				<form class="ek-kmap-filters" data-filters onsubmit="return false">
					<fieldset class="ek-kmap-types">
						<legend class="ek-visually-hidden"><?php esc_html_e( 'Show', 'explore-katsina' ); ?></legend>
						<?php foreach ( $labels as $k => $label ) : ?>
							<label class="ek-kmap-chip" style="--pin:<?php echo esc_attr( $cfg['pinColours'][ $k ] ); ?>"><input type="checkbox" name="types" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $want, true ) ); ?>><span><i aria-hidden="true"></i><?php echo esc_html( $label ); ?></span></label>
						<?php endforeach; ?>
					</fieldset>
					<div class="ek-kmap-near">
						<button type="button" class="ek-btn ek-btn--sm ek-btn--night" data-locate><?php esc_html_e( 'Use my location', 'explore-katsina' ); ?></button>
						<label class="ek-kmap-inline"><span class="ek-visually-hidden"><?php esc_html_e( 'Within', 'explore-katsina' ); ?></span>
							<select name="radius" data-radius disabled>
								<option value="0"><?php esc_html_e( 'Any distance', 'explore-katsina' ); ?></option>
								<?php foreach ( array( 1, 5, 10, 25 ) as $km ) : ?><option value="<?php echo (int) $km; ?>"><?php /* translators: %d: km */ printf( esc_html__( 'Within %d km', 'explore-katsina' ), (int) $km ); ?></option><?php endforeach; ?>
							</select>
						</label>
						<span class="ek-small ek-muted" data-locate-msg role="status"></span>
					</div>
					<details class="ek-kmap-more">
						<summary><?php esc_html_e( 'More filters', 'explore-katsina' ); ?> <span data-filter-count></span></summary>
						<div class="ek-kmap-grid">
							<div class="ek-field"><label for="km-lga"><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></label><select id="km-lga" name="lga"><?php echo str_replace( esc_html__( 'Choose LGA…', 'explore-katsina' ), esc_html__( 'All 34 LGAs', 'explore-katsina' ), View::lga_options( $lga ) ); // phpcs:ignore ?></select></div>
							<div class="ek-field"><label for="km-rating"><?php esc_html_e( 'Rating', 'explore-katsina' ); ?></label><select id="km-rating" name="min_rating"><option value=""><?php esc_html_e( 'Any', 'explore-katsina' ); ?></option><option value="3">3★+</option><option value="4">4★+</option><option value="4.5">4.5★+</option></select></div>
							<div class="ek-field"><label for="km-amenity"><?php esc_html_e( 'Must have', 'explore-katsina' ); ?></label><select id="km-amenity" name="amenity"><option value=""><?php esc_html_e( 'Anything', 'explore-katsina' ); ?></option><?php foreach ( Map_Index::filter_amenities() as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></div>
							<fieldset class="ek-field ek-kmap-price"><legend class="ek-label"><?php esc_html_e( 'Price', 'explore-katsina' ); ?></legend><?php for ( $i = 1; $i <= 4; $i++ ) : ?><label><input type="checkbox" name="price" value="<?php echo (int) $i; ?>"> <?php echo esc_html( str_repeat( '₦', $i ) ); ?></label><?php endfor; ?></fieldset>
							<label class="ek-kmap-open"><input type="checkbox" name="open" value="1"> <?php esc_html_e( 'Open now', 'explore-katsina' ); ?></label>
						</div>
						<p class="ek-small ek-muted" style="margin:6px 0 0"><?php esc_html_e( 'Price: hotels by cheapest room per night (₦ under ₦15,000 … ₦₦₦₦ over ₦70,000), restaurants by their price range, event centres by cheapest hall. Attractions are hidden when "Open now" is on.', 'explore-katsina' ); ?></p>
					</details>
				</form>
				<div class="ek-kmap-listhead">
					<strong data-count></strong>
					<label class="ek-kmap-inline"><span><?php esc_html_e( 'Sort', 'explore-katsina' ); ?></span>
						<select data-sort>
							<option value="rank"><?php esc_html_e( 'Rank', 'explore-katsina' ); ?></option>
							<option value="distance" disabled><?php esc_html_e( 'Distance', 'explore-katsina' ); ?></option>
							<option value="rating"><?php esc_html_e( 'Rating', 'explore-katsina' ); ?></option>
							<option value="price"><?php esc_html_e( 'Price', 'explore-katsina' ); ?></option>
						</select>
					</label>
				</div>
				<p class="ek-small ek-kmap-msg" data-msg role="status" hidden></p>
				<ol class="ek-kmap-list" data-list></ol>
				<p class="ek-small ek-muted ek-kmap-note"><?php esc_html_e( 'Rank numbers come from verified reviews, completed bookings and response rate. Featured places pay for a highlighted pin; it never changes their rank.', 'explore-katsina' ); ?></p>
			</div>
		</aside>
		<div class="ek-kmap-map" data-map aria-label="<?php esc_attr_e( 'Map of Katsina State', 'explore-katsina' ); ?>"></div>
	</div>
	<noscript><p class="ek-notice ek-notice--info"><?php esc_html_e( 'The map needs JavaScript. You can still browse:', 'explore-katsina' ); ?> <a href="<?php echo esc_url( Install::page_url( 'hotels' ) ); ?>"><?php esc_html_e( 'Hotels', 'explore-katsina' ); ?></a> · <a href="<?php echo esc_url( Install::page_url( 'restaurants' ) ); ?>"><?php esc_html_e( 'Restaurants', 'explore-katsina' ); ?></a> · <a href="<?php echo esc_url( Install::page_url( 'event_centres' ) ); ?>"><?php esc_html_e( 'Event centres', 'explore-katsina' ); ?></a></p></noscript>
</div>
