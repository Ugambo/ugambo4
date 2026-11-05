<?php
/**
 * Analytics.
 *
 * @var array $b
 * @var array $sections
 */
use EK\Analytics;
use EK\Dashboard;
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;

$range = absint( $_GET['range'] ?? 30 ); // phpcs:ignore WordPress.Security.NonceVerification
$range = in_array( $range, array( 7, 30, 90 ), true ) ? $range : 30;
$a     = Analytics::summary( $b['id'], $range );
$tiles = array(
	'view'       => __( 'Page views', 'explore-katsina' ),
	'pin_tap'    => __( 'Map pin taps', 'explore-katsina' ),
	'whatsapp'   => __( 'WhatsApp clicks', 'explore-katsina' ),
	'call'       => __( 'Call clicks', 'explore-katsina' ),
	'directions' => __( 'Directions', 'explore-katsina' ),
	'website'    => __( 'Website clicks', 'explore-katsina' ),
);
?>
<nav class="ek-row" aria-label="<?php esc_attr_e( 'Time range', 'explore-katsina' ); ?>">
	<?php foreach ( array( 7, 30, 90 ) as $d ) : ?>
		<a class="ek-pill" href="<?php echo esc_url( Dashboard::url( 'analytics', $b['id'], array( 'range' => $d ) ) ); ?>"<?php echo $range === $d ? ' aria-current="true" style="background:var(--ek-night);color:#fff"' : ''; ?>><?php /* translators: %d: days */ printf( esc_html__( 'Last %d days', 'explore-katsina' ), (int) $d ); ?></a>
	<?php endforeach; ?>
</nav>
<div class="ek-stats">
	<?php foreach ( $tiles as $key => $label ) : ?>
		<div class="ek-stat">
			<small><?php echo esc_html( $label ); ?></small>
			<b><?php echo esc_html( number_format_i18n( $a[ $key ] ) ); ?></b>
			<?php echo View::sparkline( Analytics::series( $b['id'], $key, $range ) ); // phpcs:ignore ?>
		</div>
	<?php endforeach; ?>
	<div class="ek-stat"><small><?php echo esc_html( $sections['bookings'] ); ?></small><b><?php echo esc_html( number_format_i18n( $a['bookings'] ) ); ?></b></div>
	<div class="ek-stat ek-stat--accent"><small><?php esc_html_e( 'Revenue (paid online)', 'explore-katsina' ); ?></small><b><?php echo esc_html( Money::format( $a['revenue'] ) ); ?></b></div>
</div>
<p class="ek-small ek-muted"><?php esc_html_e( 'Your own visits are not counted. Repeat taps by the same visitor within 30 minutes count once.', 'explore-katsina' ); ?></p>
