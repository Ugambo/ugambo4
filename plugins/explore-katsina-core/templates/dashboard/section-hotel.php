<?php
/**
 * Hotel details: stars, amenities, times, rules, cancellation policy, payment options.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Hotel;
use EK\Hotel_Dashboard;
use EK\View;

defined( 'ABSPATH' ) || exit;

$errors = Hotel_Dashboard::$errors;
$s      = Hotel_Dashboard::$values ? array_merge( Hotel::settings( $b['id'] ), Hotel::validate( Hotel_Dashboard::$values )[0] ) : Hotel::settings( $b['id'] );
?>
<form class="ek-stack" method="post" novalidate>
	<?php echo Dashboard::nonce_fields( 'dash_hotel', $b['id'] ); // phpcs:ignore ?>
	<?php if ( $errors ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php esc_html_e( 'Please check the highlighted fields. Nothing was saved yet.', 'explore-katsina' ); ?></div><?php endif; ?>

	<section class="ek-card ek-stack" aria-labelledby="h-stars">
		<h2 id="h-stars" style="margin:0"><?php esc_html_e( 'Star rating', 'explore-katsina' ); ?></h2>
		<div class="ek-field">
			<label for="ek-stars"><?php esc_html_e( 'Your star rating (self-declared)', 'explore-katsina' ); ?></label>
			<select id="ek-stars" name="stars" style="max-width:240px">
				<option value="0" <?php selected( 0, $s['stars'] ); ?>><?php esc_html_e( 'Not rated', 'explore-katsina' ); ?></option>
				<?php for ( $i = 1; $i <= 5; $i++ ) : ?><option value="<?php echo (int) $i; ?>" <?php selected( $i, $s['stars'] ); ?>><?php echo esc_html( str_repeat( '★', $i ) ); ?> (<?php echo (int) $i; ?>)</option><?php endfor; ?>
			</select>
			<span class="ek-hint"><?php echo $s['stars_verified'] ? '✓ ' . esc_html__( 'Verified by Explore Katsina.', 'explore-katsina' ) : esc_html__( 'Shown as "self-declared" until our team verifies it. Changing it removes any verification.', 'explore-katsina' ); ?></span>
		</div>
	</section>

	<section class="ek-card ek-stack" aria-labelledby="h-amen">
		<h2 id="h-amen" style="margin:0"><?php esc_html_e( 'Amenities', 'explore-katsina' ); ?></h2>
		<div class="ek-checkgrid">
			<?php foreach ( Hotel::amenities() as $k => $label ) : ?>
				<label class="ek-check"><input type="checkbox" name="amenities[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $s['amenities'], true ) ); ?>> <?php echo esc_html( $label ); ?></label>
			<?php endforeach; ?>
		</div>
	</section>

	<section class="ek-card ek-stack" aria-labelledby="h-times">
		<h2 id="h-times" style="margin:0"><?php esc_html_e( 'Check-in, check-out and house rules', 'explore-katsina' ); ?></h2>
		<div class="ek-grid ek-grid--2">
			<div class="ek-field"><label for="ek-checkin"><?php esc_html_e( 'Check-in from', 'explore-katsina' ); ?></label><input type="time" id="ek-checkin" name="checkin" value="<?php echo esc_attr( $s['checkin'] ); ?>"></div>
			<div class="ek-field"><label for="ek-checkout"><?php esc_html_e( 'Check-out by', 'explore-katsina' ); ?></label><input type="time" id="ek-checkout" name="checkout" value="<?php echo esc_attr( $s['checkout'] ); ?>"></div>
		</div>
		<div class="ek-field">
			<label for="ek-rules"><?php esc_html_e( 'House rules', 'explore-katsina' ); ?></label>
			<textarea id="ek-rules" name="house_rules" rows="4" placeholder="<?php esc_attr_e( 'e.g. Valid ID required at check-in. No smoking in rooms. Visitors leave by 10pm.', 'explore-katsina' ); ?>"><?php echo esc_textarea( $s['house_rules'] ); ?></textarea>
		</div>
	</section>

	<section class="ek-card ek-stack" aria-labelledby="h-policy">
		<h2 id="h-policy" style="margin:0"><?php esc_html_e( 'Cancellation policy', 'explore-katsina' ); ?></h2>
		<fieldset class="<?php echo esc_attr( View::field_class( $errors, 'policy' ) ); ?>" style="border:0;padding:0;margin:0">
			<legend class="ek-visually-hidden"><?php esc_html_e( 'Cancellation policy', 'explore-katsina' ); ?></legend>
			<div class="ek-choices">
				<?php foreach ( Hotel::policies() as $k => $p ) : ?>
					<label class="ek-choice"><input type="radio" name="policy" value="<?php echo esc_attr( $k ); ?>" <?php checked( $k, $s['policy'] ); ?>><span><strong><?php echo esc_html( $p['label'] ); ?></strong><br><span class="ek-small ek-muted"><?php echo esc_html( $p['text'] ); ?></span></span></label>
				<?php endforeach; ?>
			</div>
			<?php echo View::error( $errors, 'policy' ); // phpcs:ignore ?>
		</fieldset>
		<div class="ek-field"><label for="ek-pnote"><?php esc_html_e( 'Extra note for guests (optional)', 'explore-katsina' ); ?></label><input type="text" id="ek-pnote" name="policy_note" value="<?php echo esc_attr( $s['policy_note'] ); ?>" maxlength="200"></div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Each booking keeps the policy that applied when it was made, so changing this only affects new bookings.', 'explore-katsina' ); ?></p>
	</section>

	<section class="ek-card ek-stack" aria-labelledby="h-pay">
		<h2 id="h-pay" style="margin:0"><?php esc_html_e( 'How guests can pay', 'explore-katsina' ); ?></h2>
		<div class="<?php echo esc_attr( View::field_class( $errors, 'payment' ) ); ?>">
			<label class="ek-check"><input type="checkbox" name="pay_full" value="1" <?php checked( $s['pay_full'] ); ?>> <span><strong><?php esc_html_e( 'Pay in full online', 'explore-katsina' ); ?></strong><br><span class="ek-small ek-muted"><?php esc_html_e( 'Guaranteed bookings. Money is paid to you after check-out (minus commission).', 'explore-katsina' ); ?></span></span></label>
			<label class="ek-check"><input type="checkbox" name="pay_deposit" value="1" <?php checked( $s['pay_deposit'] ); ?>> <span><strong><?php esc_html_e( 'Deposit online, rest at the hotel', 'explore-katsina' ); ?></strong></span></label>
			<div class="ek-field" style="max-width:220px;margin-left:32px">
				<label for="ek-dep"><?php esc_html_e( 'Deposit (%)', 'explore-katsina' ); ?></label>
				<input type="number" id="ek-dep" name="deposit_pct" min="10" max="90" step="5" value="<?php echo (int) $s['deposit_pct']; ?>">
				<?php echo View::error( $errors, 'deposit_pct' ); // phpcs:ignore ?>
			</div>
			<label class="ek-check"><input type="checkbox" name="pay_at_venue" value="1" <?php checked( $s['pay_at_venue'] ); ?>> <span><strong><?php esc_html_e( 'Pay at the hotel', 'explore-katsina' ); ?></strong><br><span class="ek-small ek-muted"><?php esc_html_e( 'Our commission on these bookings is invoiced to you monthly.', 'explore-katsina' ); ?></span></span></label>
			<?php echo View::error( $errors, 'payment' ); // phpcs:ignore ?>
		</div>
	</section>
	<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save hotel details', 'explore-katsina' ); ?></button></div>
</form>
