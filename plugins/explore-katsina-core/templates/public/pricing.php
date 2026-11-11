<?php
/**
 * Pricing for businesses (all amounts come from Settings: PLACEHOLDERS until launch).
 */
use EK\Business;
use EK\Events;
use EK\Install;
use EK\Money;
use EK\Plans;
use EK\Services;
use EK\Settings;

defined( 'ABSPATH' ) || exit;
$bp    = (array) Settings::get( 'commission_bp' );
$pct   = static fn( $k ) => isset( $bp[ $k ] ) ? rtrim( rtrim( number_format( $bp[ $k ] / 100, 1 ), '0' ), '.' ) . '%' : '—';
$types = Business::types();
?>
<div class="ek ek-pricing ek-stack">
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Listing on Explore Katsina is free. We earn a commission only when you get a booking through us, and you can choose optional extras. Paid extras never change your rank.', 'explore-katsina' ); ?></p>
	<div class="ek-grid ek-grid--3">
		<section class="ek-card ek-stack ek-price-card" style="margin:0">
			<h2 style="margin:0"><?php esc_html_e( 'Basic', 'explore-katsina' ); ?></h2>
			<p class="ek-price"><strong><?php esc_html_e( 'Free', 'explore-katsina' ); ?></strong></p>
			<ul class="ek-small"><li><?php esc_html_e( 'Your page, map pin and photos', 'explore-katsina' ); ?></li><li><?php esc_html_e( 'Online bookings, reservations or enquiries', 'explore-katsina' ); ?></li><li><?php esc_html_e( 'Verified reviews and honest ranking', 'explore-katsina' ); ?></li><li><?php esc_html_e( 'Business dashboard on your phone', 'explore-katsina' ); ?></li></ul>
			<a class="ek-btn" href="<?php echo esc_url( Install::page_url( 'list_business' ) ); ?>"><?php esc_html_e( 'List your business', 'explore-katsina' ); ?></a>
		</section>
		<?php foreach ( Plans::plans() as $p ) : ?>
			<section class="ek-card ek-stack ek-price-card" style="margin:0">
				<h2 style="margin:0"><?php echo esc_html( $p['label'] ); ?></h2>
				<p class="ek-price"><strong><?php echo esc_html( Money::format( $p['month'] ) ); ?></strong> <?php esc_html_e( '/ month', 'explore-katsina' ); ?><br><span class="ek-small"><?php echo esc_html( Money::format( $p['year'] ) ); ?> <?php esc_html_e( '/ year', 'explore-katsina' ); ?></span></p>
				<ul class="ek-small"><?php foreach ( $p['benefits'] as $bn ) : ?><li><?php echo esc_html( $bn ); ?></li><?php endforeach; ?></ul>
				<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Buy from your business dashboard.', 'explore-katsina' ); ?></p>
			</section>
		<?php endforeach; ?>
	</div>
	<section class="ek-card ek-stack" aria-labelledby="ek-comm-h">
		<h2 id="ek-comm-h" style="margin:0"><?php esc_html_e( 'Commission on bookings', 'explore-katsina' ); ?></h2>
		<table class="ek-table">
			<thead><tr><th><?php esc_html_e( 'Booking', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Commission', 'explore-katsina' ); ?></th></tr></thead>
			<tbody>
				<tr><td><?php echo esc_html( $types['hotel']['label'] ); ?></td><td><?php echo esc_html( $pct( 'hotel' ) ); ?></td></tr>
				<tr><td><?php echo esc_html( $types['event-centre']['label'] ); ?> (<?php esc_html_e( 'on the deposit', 'explore-katsina' ); ?>)</td><td><?php echo esc_html( $pct( 'event-centre' ) ); ?></td></tr>
				<tr><td><?php echo esc_html( $types['tour-operator']['label'] ); ?></td><td><?php echo esc_html( $pct( 'tour-operator' ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Restaurant table reservations', 'explore-katsina' ); ?></td><td><?php echo esc_html( $pct( 'restaurant' ) ); ?></td></tr>
				<tr><td><?php esc_html_e( 'Restaurant food orders', 'explore-katsina' ); ?></td><td><?php echo esc_html( $pct( 'restaurant_orders' ) ); ?></td></tr>
			</tbody>
		</table>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Online payments come to us first; your share is released 3 days after the stay, event or completed reservation and paid to your bank on request. Commission on "pay at the hotel" stays is invoiced monthly.', 'explore-katsina' ); ?></p>
	</section>
	<div class="ek-grid ek-grid--3">
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Verified badge', 'explore-katsina' ); ?></h2><p style="margin:0"><strong><?php echo esc_html( Money::format( (int) Settings::get( 'price_verified' ) ) ); ?></strong> <?php esc_html_e( 'once', 'explore-katsina' ); ?></p><p class="ek-small" style="margin:0"><?php esc_html_e( 'We check your business documents and show a "Verified" badge.', 'explore-katsina' ); ?></p></section>
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Listing setup', 'explore-katsina' ); ?></h2><p style="margin:0"><?php foreach ( Services::setup_packages() as $pk ) { echo esc_html( $pk[0] . ': ' . Money::format( $pk[1] ) ) . '<br>'; } ?></p><a href="<?php echo esc_url( Install::page_url( 'listing_setup' ) ); ?>"><?php esc_html_e( 'Order listing setup →', 'explore-katsina' ); ?></a></section>
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Event promotion', 'explore-katsina' ); ?></h2><p style="margin:0"><?php foreach ( Events::packages() as $pk ) { echo esc_html( $pk[0] . ': ' . Money::format( $pk[1] ) ) . '<br>'; } ?></p><a href="<?php echo esc_url( Install::page_url( 'promote_event' ) ); ?>"><?php esc_html_e( 'Promote an event →', 'explore-katsina' ); ?></a></section>
	</div>
	<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'All prices and rates are PLACEHOLDERS until launch. Banner ads and sponsored stories:', 'explore-katsina' ); ?> <a href="<?php echo esc_url( Install::page_url( 'advertise' ) ); ?>"><?php esc_html_e( 'Advertise with us', 'explore-katsina' ); ?></a>.</p>
</div>
