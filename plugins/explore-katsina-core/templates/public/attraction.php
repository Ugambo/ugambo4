<?php
/**
 * Visitor details for an attraction, shown under its description.
 *
 * @var int   $id
 * @var array $a
 */
use EK\Favourites;
use EK\Install;
use EK\Map_Index;

defined( 'ABSPATH' ) || exit;
$has_pin = is_numeric( $a['lat'] ) && is_numeric( $a['lng'] ) && (float) $a['lat'];
$ek_near = $has_pin ? Map_Index::near( (float) $a['lat'], (float) $a['lng'], 5, 12, $id ) : array();
?>
<div class="ek ek-attraction ek-stack">
	<?php if ( $a['unverified'] ) : ?><p class="ek-notice ek-notice--info" style="margin:0"><?php esc_html_e( 'These details have not been verified yet. Please confirm opening times and fees before you travel.', 'explore-katsina' ); ?></p><?php endif; ?>
	<section class="ek-card ek-stack" aria-label="<?php esc_attr_e( 'Visitor information', 'explore-katsina' ); ?>">
		<dl class="ek-dl">
			<?php if ( $a['category'] ) : ?><dt><?php esc_html_e( 'Type', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['category'] ); ?></dd><?php endif; ?>
			<?php if ( $a['lga'] ) : ?><dt><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['lga'] ); ?></dd><?php endif; ?>
			<?php if ( $a['entry_fee'] ) : ?><dt><?php esc_html_e( 'Entry fee', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['entry_fee'] ); ?></dd><?php endif; ?>
			<?php if ( $a['hours'] ) : ?><dt><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $a['hours'] ); ?></dd><?php endif; ?>
			<?php if ( $a['directions'] ) : ?><dt><?php esc_html_e( 'How to get there', 'explore-katsina' ); ?></dt><dd><?php echo nl2br( esc_html( $a['directions'] ) ); ?></dd><?php endif; ?>
		</dl>
		<div class="ek-row">
			<?php if ( $has_pin ) : ?><a class="ek-btn ek-btn--night" href="<?php echo esc_url( 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $a['lat'] . ',' . $a['lng'] ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a><?php endif; ?>
			<a class="ek-btn ek-btn--ghost" href="<?php echo esc_url( add_query_arg( 'focus', $id, Install::page_url( 'map' ) ) ); ?>"><?php esc_html_e( 'Show on Katsina Map', 'explore-katsina' ); ?></a>
			<?php echo Favourites::button( $id ); // phpcs:ignore ?>
		</div>
	</section>
	<?php if ( $has_pin ) : ?>
		<div class="ek-mini-map" data-ek-mini-map data-lat="<?php echo esc_attr( $a['lat'] ); ?>" data-lng="<?php echo esc_attr( $a['lng'] ); ?>" data-colour="#1F6B52" data-near="<?php echo esc_attr( wp_json_encode( Map_Index::mini( $ek_near ) ) ); ?>" role="img" aria-label="<?php esc_attr_e( 'Map showing the location and nearby places', 'explore-katsina' ); ?>"></div>
	<?php endif; ?>
	<?php include EK_DIR . 'templates/public/nearby.php'; ?>
</div>
