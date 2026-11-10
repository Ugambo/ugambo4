<?php
/**
 * Event header: date, place, promoted label.
 *
 * @var int   $id
 * @var array $d
 */
use EK\Events;
use EK\Favourites;
use EK\Install;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-event-head ek-stack">
	<?php if ( Events::is_promoted( $id ) ) : ?><span class="ek-badge ek-badge--featured" style="align-self:flex-start"><?php esc_html_e( 'Promoted', 'explore-katsina' ); ?></span><?php endif; ?>
	<dl class="ek-dl">
		<?php if ( $d['type'] ) : ?><dt><?php esc_html_e( 'Type', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['type'] ); ?></dd><?php endif; ?>
		<dt><?php esc_html_e( 'When', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Events::when( $d ) ); ?><?php if ( $d['tbc'] ) : ?><br><span class="ek-small ek-muted"><?php esc_html_e( 'We will publish the date as soon as it is officially announced.', 'explore-katsina' ); ?></span><?php endif; ?></dd>
		<?php if ( $d['venue'] ) : ?><dt><?php esc_html_e( 'Where', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['venue'] . ( $d['lga'] ? ', ' . $d['lga'] : '' ) ); ?></dd><?php endif; ?>
	</dl>
	<div class="ek-row">
		<?php if ( is_numeric( $d['lat'] ) && (float) $d['lat'] ) : ?><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $d['lat'] . ',' . $d['lng'] ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a><?php endif; ?>
		<?php if ( \EK\Tickets::types( $id ) ) : ?><a class="ek-btn ek-btn--sm" href="#tickets"><?php esc_html_e( 'Get tickets', 'explore-katsina' ); ?></a><?php endif; ?>
		<?php echo Favourites::button( $id ); // phpcs:ignore ?>
	</div>
</div>
