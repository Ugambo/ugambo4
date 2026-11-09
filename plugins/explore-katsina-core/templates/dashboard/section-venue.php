<?php
/**
 * Venue details: amenities, booking mode, deposit, cancellation policy, rules.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Hotel;
use EK\Venue;
use EK\Venue_Dashboard;
use EK\View;

defined( 'ABSPATH' ) || exit;

$errors = Venue_Dashboard::$errors;
$s      = Venue_Dashboard::$values ? array_merge( Venue::settings( $b['id'] ), Venue::validate( Venue_Dashboard::$values )[0] ) : Venue::settings( $b['id'] );
?>
<form class="ek-stack" method="post" novalidate>
	<?php echo Dashboard::nonce_fields( 'dash_venue', $b['id'] ); // phpcs:ignore ?>
	<?php if ( $errors ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php esc_html_e( 'Please check the highlighted fields. Nothing was saved yet.', 'explore-katsina' ); ?></div><?php endif; ?>
	<section class="ek-card ek-stack">
		<h2 style="margin:0"><?php esc_html_e( 'Amenities', 'explore-katsina' ); ?></h2>
		<div class="ek-checkgrid"><?php foreach ( Venue::amenities() as $k => $label ) : ?><label class="ek-check"><input type="checkbox" name="amenities[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $s['amenities'], true ) ); ?>> <?php echo esc_html( $label ); ?></label><?php endforeach; ?></div>
	</section>
	<section class="ek-card ek-stack">
		<h2 style="margin:0"><?php esc_html_e( 'How guests book', 'explore-katsina' ); ?></h2>
		<div class="ek-choices">
			<label class="ek-choice"><input type="radio" name="booking_mode" value="request" <?php checked( 'request', $s['booking_mode'] ); ?>><span><strong><?php esc_html_e( 'Request to book', 'explore-katsina' ); ?></strong><br><span class="ek-small ek-muted"><?php esc_html_e( 'The guest asks for a date and it is held for them. You accept or decline within 48 hours. After you accept, the guest has 72 hours to pay the deposit online.', 'explore-katsina' ); ?></span></span></label>
			<label class="ek-choice"><input type="radio" name="booking_mode" value="instant" <?php checked( 'instant', $s['booking_mode'] ); ?>><span><strong><?php esc_html_e( 'Instant booking with deposit', 'explore-katsina' ); ?></strong><br><span class="ek-small ek-muted"><?php esc_html_e( 'The guest pays the deposit immediately and the date is booked. Keep your calendar up to date.', 'explore-katsina' ); ?></span></span></label>
		</div>
		<div class="<?php echo esc_attr( View::field_class( $errors, 'deposit_pct' ) ); ?>" style="max-width:240px"><label for="v-dep"><?php esc_html_e( 'Deposit paid online (%)', 'explore-katsina' ); ?></label><input type="number" id="v-dep" name="deposit_pct" min="10" max="100" step="5" value="<?php echo (int) $s['deposit_pct']; ?>"><?php echo View::error( $errors, 'deposit_pct' ); // phpcs:ignore ?></div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'The guest pays the rest directly to you. The deposit (minus commission) is paid to you 3 days after the event if there is no complaint.', 'explore-katsina' ); ?></p>
	</section>
	<section class="ek-card ek-stack">
		<h2 style="margin:0"><?php esc_html_e( 'Cancellation policy', 'explore-katsina' ); ?></h2>
		<div class="ek-choices"><?php foreach ( Hotel::policies() as $k => $p ) : ?><label class="ek-choice"><input type="radio" name="policy" value="<?php echo esc_attr( $k ); ?>" <?php checked( $k, $s['policy'] ); ?>><span><strong><?php echo esc_html( $p['label'] ); ?></strong><br><span class="ek-small ek-muted"><?php echo esc_html( str_replace( __( 'check-in', 'explore-katsina' ), __( 'the event', 'explore-katsina' ), $p['text'] ) ); ?></span></span></label><?php endforeach; ?></div>
		<div class="ek-field"><label for="v-note"><?php esc_html_e( 'Extra note (optional)', 'explore-katsina' ); ?></label><input type="text" id="v-note" name="policy_note" maxlength="200" value="<?php echo esc_attr( $s['policy_note'] ); ?>"></div>
		<div class="ek-field"><label for="v-rules"><?php esc_html_e( 'Venue rules (optional)', 'explore-katsina' ); ?></label><textarea id="v-rules" name="rules" rows="3" placeholder="<?php esc_attr_e( 'e.g. Events end by 11pm. No fireworks indoors.', 'explore-katsina' ); ?>"><?php echo esc_textarea( $s['rules'] ); ?></textarea></div>
	</section>
	<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save venue details', 'explore-katsina' ); ?></button></div>
</form>
