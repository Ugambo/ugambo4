<?php
/**
 * Table reservation settings + a preview of today's/tomorrow's slots.
 *
 * @var array $b
 */
use EK\Availability;
use EK\Dashboard;
use EK\Money;
use EK\Restaurant;
use EK\Restaurant_Dashboard;
use EK\Slots;
use EK\View;

defined( 'ABSPATH' ) || exit;

$errors = 'tables' === Restaurant_Dashboard::$group ? Restaurant_Dashboard::$errors : array();
$s      = $errors ? Restaurant::validate( 'tables', Restaurant_Dashboard::$values, Restaurant::settings( $b['id'] ) )[0] : Restaurant::settings( $b['id'] );
$tom    = ( new DateTimeImmutable( 'tomorrow', Availability::tz() ) )->format( 'Y-m-d' );
$slots  = Slots::for_day( $b['id'], $tom );
?>
<form class="ek-stack" method="post" novalidate>
	<?php echo Dashboard::nonce_fields( 'dash_restaurant', $b['id'] ); // phpcs:ignore ?>
	<input type="hidden" name="group" value="tables">
	<?php if ( $errors ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php esc_html_e( 'Please check the highlighted fields. Nothing was saved yet.', 'explore-katsina' ); ?></div><?php endif; ?>
	<section class="ek-card ek-stack" aria-labelledby="t-h">
		<h2 id="t-h" style="margin:0"><?php esc_html_e( 'Table reservations', 'explore-katsina' ); ?></h2>
		<label class="ek-check"><input type="checkbox" name="res_enabled" value="1" <?php checked( $s['res_enabled'] ); ?>> <strong><?php esc_html_e( 'Take table reservations online', 'explore-katsina' ); ?></strong></label>
		<div class="ek-grid ek-grid--2">
			<div class="ek-field"><label for="t-mode"><?php esc_html_e( 'Count by', 'explore-katsina' ); ?></label><select id="t-mode" name="capacity_mode"><option value="seats" <?php selected( $s['capacity_mode'], 'seats' ); ?>><?php esc_html_e( 'Seats (a party of 4 uses 4 seats)', 'explore-katsina' ); ?></option><option value="tables" <?php selected( $s['capacity_mode'], 'tables' ); ?>><?php esc_html_e( 'Tables (each party uses 1 table)', 'explore-katsina' ); ?></option></select></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'capacity' ) ); ?>"><label for="t-cap"><?php esc_html_e( 'Seats or tables per time slot', 'explore-katsina' ); ?></label><input type="number" id="t-cap" name="capacity" min="1" max="1000" value="<?php echo (int) $s['capacity']; ?>"><span class="ek-hint"><?php esc_html_e( 'How many you are happy to give to online reservations at the same time.', 'explore-katsina' ); ?></span><?php echo View::error( $errors, 'capacity' ); // phpcs:ignore ?></div>
			<div class="ek-field"><label for="t-len"><?php esc_html_e( 'Slot length', 'explore-katsina' ); ?></label><select id="t-len" name="slot_minutes"><?php foreach ( array( 30, 45, 60, 90, 120, 150, 180 ) as $m ) : ?><option value="<?php echo (int) $m; ?>" <?php selected( $s['slot_minutes'], $m ); ?>><?php /* translators: %d: minutes */ printf( esc_html__( '%d minutes', 'explore-katsina' ), (int) $m ); ?></option><?php endforeach; ?></select><span class="ek-hint"><?php esc_html_e( 'How long a table is held for one party.', 'explore-katsina' ); ?></span></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'max_party' ) ); ?>"><label for="t-max"><?php esc_html_e( 'Largest group online', 'explore-katsina' ); ?></label><input type="number" id="t-max" name="max_party" min="1" max="200" value="<?php echo (int) $s['max_party']; ?>"><?php echo View::error( $errors, 'max_party' ); // phpcs:ignore ?></div>
			<div class="ek-field"><label for="t-notice"><?php esc_html_e( 'Minimum notice (hours)', 'explore-katsina' ); ?></label><input type="number" id="t-notice" name="min_notice_hours" min="0" max="72" value="<?php echo (int) $s['min_notice_hours']; ?>"></div>
			<div class="ek-field"><label for="t-ahead"><?php esc_html_e( 'Book up to (days ahead)', 'explore-katsina' ); ?></label><input type="number" id="t-ahead" name="days_ahead" min="1" max="365" value="<?php echo (int) $s['days_ahead']; ?>"></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'res_from' ) ); ?>"><label for="t-from"><?php esc_html_e( 'Reservations from (optional)', 'explore-katsina' ); ?></label><input type="time" id="t-from" name="res_from" value="<?php echo esc_attr( $s['res_from'] ); ?>"><?php echo View::error( $errors, 'res_from' ); // phpcs:ignore ?></div>
			<div class="ek-field"><label for="t-to"><?php esc_html_e( 'Reservations until (optional)', 'explore-katsina' ); ?></label><input type="time" id="t-to" name="res_to" value="<?php echo esc_attr( $s['res_to'] ); ?>"><span class="ek-hint"><?php esc_html_e( 'Leave both empty to use your opening hours.', 'explore-katsina' ); ?></span></div>
		</div>
		<div class="ek-field"><label for="t-closed"><?php esc_html_e( 'Closed for reservations on these dates', 'explore-katsina' ); ?></label><textarea id="t-closed" name="closed_dates" rows="2" placeholder="2026-12-25, 2027-03-20"><?php echo esc_textarea( implode( ', ', $s['closed_dates'] ) ); ?></textarea><span class="ek-hint"><?php esc_html_e( 'Dates as YYYY-MM-DD, separated by commas. Days marked "Closed" in your opening hours are already excluded.', 'explore-katsina' ); ?></span></div>
	</section>
	<section class="ek-card ek-stack" aria-labelledby="t-dep">
		<h2 id="t-dep" style="margin:0"><?php esc_html_e( 'Deposit for large groups (optional)', 'explore-katsina' ); ?></h2>
		<label class="ek-check"><input type="checkbox" name="deposit_enabled" value="1" <?php checked( $s['deposit_enabled'] ); ?>> <?php esc_html_e( 'Ask large groups to pay a deposit online', 'explore-katsina' ); ?></label>
		<div class="ek-grid ek-grid--2 <?php echo esc_attr( View::field_class( $errors, 'deposit' ) ); ?>">
			<div class="ek-field"><label for="t-dmin"><?php esc_html_e( 'For groups of (people) or more', 'explore-katsina' ); ?></label><input type="number" id="t-dmin" name="deposit_min_party" min="2" max="200" value="<?php echo (int) $s['deposit_min_party']; ?>"></div>
			<div class="ek-field"><label for="t-damt"><?php esc_html_e( 'Deposit per guest (₦)', 'explore-katsina' ); ?></label><input type="text" id="t-damt" name="deposit_per_guest" inputmode="numeric" value="<?php echo esc_attr( number_format( $s['deposit_per_guest'] / 100 ) ); ?>"></div>
			<?php echo View::error( $errors, 'deposit' ); // phpcs:ignore ?>
		</div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'The deposit is paid to Explore Katsina and passed to you after the meal; deduct it from the guests’ bill. Commission on table reservations: 0%.', 'explore-katsina' ); ?></p>
	</section>
	<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save table settings', 'explore-katsina' ); ?></button></div>
</form>
<section class="ek-card" aria-labelledby="t-prev">
	<h2 id="t-prev"><?php /* translators: %s: date */ printf( esc_html__( 'Preview: times guests can choose on %s', 'explore-katsina' ), esc_html( wp_date( 'l j F', strtotime( $tom ) ) ) ); ?></h2>
	<?php if ( ! $slots ) : ?>
		<p class="ek-muted" style="margin:0"><?php esc_html_e( 'No times available that day (closed, reservations off, or outside the booking window).', 'explore-katsina' ); ?></p>
	<?php else : ?>
		<div class="ek-slotgrid">
			<?php foreach ( $slots as $sl ) : ?><span class="ek-slot<?php echo $sl['available'] ? '' : ' is-full'; ?>"><?php echo esc_html( $sl['time'] ); ?><small><?php echo (int) $sl['available']; ?> <?php echo 'tables' === $s['capacity_mode'] ? esc_html__( 'tables', 'explore-katsina' ) : esc_html__( 'seats', 'explore-katsina' ); ?></small></span><?php endforeach; ?>
		</div>
	<?php endif; ?>
</section>
