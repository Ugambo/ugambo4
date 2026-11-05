<?php
/**
 * Map pin field.
 *
 * @var array $v
 * @var array $errors
 */
use EK\View;

defined( 'ABSPATH' ) || exit;
$lat = isset( $v['lat'] ) && is_numeric( $v['lat'] ) && (float) $v['lat'] ? (float) $v['lat'] : '';
$lng = isset( $v['lng'] ) && is_numeric( $v['lng'] ) && (float) $v['lng'] ? (float) $v['lng'] : '';
?>
<div class="<?php echo esc_attr( View::field_class( $errors, 'lat' ) ); ?>" data-ek-required-pin>
	<span class="ek-label" id="pin-label"><?php esc_html_e( 'Map pin', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></span>
	<span class="ek-hint" id="pin-hint"><?php esc_html_e( 'Drag the pin, or tap the map, to mark your exact entrance. Visitors use this for directions and "Near me" search. Zoom in for accuracy.', 'explore-katsina' ); ?></span>
	<div class="ek-map" data-ek-map-picker data-lat-input="ek-lat" data-lng-input="ek-lng" role="application" aria-labelledby="pin-label" aria-describedby="pin-hint"></div>
	<div class="ek-map-tools">
		<button type="button" class="ek-btn ek-btn--ghost ek-btn--sm" data-ek-locate><?php esc_html_e( 'Use my location', 'explore-katsina' ); ?></button>
		<span class="ek-coords" data-ek-coords aria-live="polite"><?php echo $lat ? esc_html( $lat . ', ' . $lng ) : esc_html__( 'No pin placed yet', 'explore-katsina' ); ?></span>
	</div>
	<input type="hidden" name="lat" id="ek-lat" value="<?php echo esc_attr( $lat ); ?>">
	<input type="hidden" name="lng" id="ek-lng" value="<?php echo esc_attr( $lng ); ?>">
	<noscript><p class="ek-notice ek-notice--warn"><?php esc_html_e( 'The map needs JavaScript. Please enable it to place your pin.', 'explore-katsina' ); ?></p></noscript>
	<?php echo View::error( $errors, 'lat' ); // phpcs:ignore WordPress.Security.EscapeOutput ?>
</div>
