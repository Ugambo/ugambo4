<?php
/**
 * Admin: settings.
 *
 * @var array $s
 */
use EK\Crypto;

defined( 'ABSPATH' ) || exit;
?>
<h1><?php esc_html_e( 'Explore Katsina settings', 'explore-katsina' ); ?></h1>
<?php if ( ! empty( $_GET['saved'] ) ) : // phpcs:ignore ?><div class="notice notice-success"><p><?php esc_html_e( 'Settings saved.', 'explore-katsina' ); ?></p></div><?php endif; ?>
<?php include __DIR__ . '/_msg.php'; ?>
<form method="post">
	<?php wp_nonce_field( 'ek_admin_settings' ); ?>
	<input type="hidden" name="ek_admin_action" value="settings">
	<h2><?php esc_html_e( 'Businesses', 'explore-katsina' ); ?></h2>
	<table class="form-table" role="presentation">
		<tr><th><label for="notify_email"><?php esc_html_e( 'Send admin notices to', 'explore-katsina' ); ?></label></th><td><input type="email" class="regular-text" id="notify_email" name="notify_email" value="<?php echo esc_attr( $s['notify_email'] ); ?>"><p class="description"><?php esc_html_e( 'New sign-ups, payout requests and bank changes are emailed here.', 'explore-katsina' ); ?></p></td></tr>
		<tr><th><label for="agreement_version"><?php esc_html_e( 'Partner Agreement version', 'explore-katsina' ); ?></label></th><td><input type="text" id="agreement_version" name="agreement_version" value="<?php echo esc_attr( $s['agreement_version'] ); ?>"><p class="description"><?php esc_html_e( 'Change this whenever you update the agreement. Each business record shows which version they accepted.', 'explore-katsina' ); ?></p></td></tr>
		<tr><th><label for="max_photos_basic"><?php esc_html_e( 'Photos allowed (Basic plan)', 'explore-katsina' ); ?></label></th><td><input type="number" min="1" max="50" id="max_photos_basic" name="max_photos_basic" value="<?php echo (int) $s['max_photos_basic']; ?>"></td></tr>
		<tr><th><label for="max_photo_mb"><?php esc_html_e( 'Maximum photo size (MB)', 'explore-katsina' ); ?></label></th><td><input type="number" min="1" max="20" id="max_photo_mb" name="max_photo_mb" value="<?php echo (int) $s['max_photo_mb']; ?>"></td></tr>
	</table>
	<h2><?php esc_html_e( 'Money', 'explore-katsina' ); ?></h2>
	<table class="form-table" role="presentation">
		<tr><th><label for="min_payout"><?php esc_html_e( 'Minimum payout (₦)', 'explore-katsina' ); ?></label></th><td><input type="text" id="min_payout" name="min_payout" value="<?php echo esc_attr( (string) ( $s['min_payout_kobo'] / 100 ) ); ?>"></td></tr>
		<tr><th><?php esc_html_e( 'Commission rates', 'explore-katsina' ); ?></th><td>
			<?php foreach ( \EK\Commission::labels() as $k => $label ) : ?>
				<p style="margin:0 0 8px"><label><input type="text" inputmode="decimal" size="5" name="commission[<?php echo esc_attr( $k ); ?>]" value="<?php echo esc_attr( (string) ( ( (int) ( $s['commission_bp'][ $k ] ?? 0 ) ) / 100 ) ); ?>"> % · <?php echo esc_html( $label ); ?></label></p>
			<?php endforeach; ?>
			<p class="description"><?php esc_html_e( 'PLACEHOLDER rates (hotels 10%, event centres 10%, tour operators 15%, table reservations 0%, food orders 10%): set your real rates before launch. Changes apply to new bookings only; each booking keeps the rate it was made at. You can give one business a different rate on its own page.', 'explore-katsina' ); ?></p>
		</td></tr>
		<tr><th><label for="invoice_due_days"><?php esc_html_e( 'Invoice payment time (days)', 'explore-katsina' ); ?></label></th><td><input type="number" min="7" max="90" id="invoice_due_days" name="invoice_due_days" value="<?php echo (int) $s['invoice_due_days']; ?>"><p class="description"><?php esc_html_e( 'Monthly commission invoices (for pay-at-hotel bookings) are due this many days after they are issued. If unpaid by then, the listing is paused automatically until paid. Your brief: 30 days.', 'explore-katsina' ); ?></p></td></tr>
	</table>
	<h2><?php esc_html_e( 'Rankings', 'explore-katsina' ); ?></h2>
	<table class="form-table" role="presentation">
		<tr><th><label for="min_reviews_for_rank"><?php esc_html_e( 'Verified reviews needed for a rank number', 'explore-katsina' ); ?></label></th><td><input type="number" min="1" max="50" id="min_reviews_for_rank" name="min_reviews_for_rank" value="<?php echo (int) $s['min_reviews_for_rank']; ?>"></td></tr>
		<tr><th><?php esc_html_e( 'How the score is made (out of 100)', 'explore-katsina' ); ?></th><td>
			<p><label><input type="number" min="0" max="100" name="rank_weight_rating" value="<?php echo (int) $s['rank_weight_rating']; ?>" style="width:5em"> % <?php esc_html_e( 'rating from verified reviews', 'explore-katsina' ); ?></label></p>
			<p><label><input type="number" min="0" max="100" name="rank_weight_bookings" value="<?php echo (int) $s['rank_weight_bookings']; ?>" style="width:5em"> % <?php esc_html_e( 'completed bookings (last 12 months)', 'explore-katsina' ); ?></label></p>
			<p><label><input type="number" min="0" max="100" name="rank_weight_response" value="<?php echo (int) $s['rank_weight_response']; ?>" style="width:5em"> % <?php esc_html_e( 'response (answering bookings within 48 hours, replying to reviews)', 'explore-katsina' ); ?></label></p>
			<p class="description"><?php esc_html_e( 'If they do not add up to 100, they are scaled so they do.', 'explore-katsina' ); ?></p>
		</td></tr>
		<tr><th><label for="rank_prior_reviews"><?php esc_html_e( '"Pretend" average reviews', 'explore-katsina' ); ?></label></th><td><input type="number" min="0" max="100" id="rank_prior_reviews" name="rank_prior_reviews" value="<?php echo (int) $s['rank_prior_reviews']; ?>"><p class="description"><?php esc_html_e( 'Every business starts as if it already had this many reviews at the average rating for its type, so one 5★ review cannot beat fifty 4.6★ reviews. Example with 10: one 5★ review → (1×5 + 10×4.2) ÷ 11 ≈ 4.27; fifty 4.6★ reviews → (50×4.6 + 10×4.2) ÷ 60 ≈ 4.53, which ranks higher.', 'explore-katsina' ); ?></p></td></tr>
		<tr><th><label for="rank_half_life_months"><?php esc_html_e( 'Recent reviews count more', 'explore-katsina' ); ?></label></th><td><input type="number" min="1" max="60" id="rank_half_life_months" name="rank_half_life_months" value="<?php echo (int) $s['rank_half_life_months']; ?>"> <?php esc_html_e( 'months: after this long a review counts half as much', 'explore-katsina' ); ?></td></tr>
		<tr><th><label for="rank_bookings_full"><?php esc_html_e( 'Completed bookings for full marks', 'explore-katsina' ); ?></label></th><td><input type="number" min="1" id="rank_bookings_full" name="rank_bookings_full" value="<?php echo (int) $s['rank_bookings_full']; ?>"> <?php esc_html_e( 'per year (sliding scale: the 10th booking matters more than the 1,000th)', 'explore-katsina' ); ?></td></tr>
		<tr><th><?php esc_html_e( 'Badges', 'explore-katsina' ); ?></th><td>
			<p><label><?php esc_html_e( 'Top Rated = top', 'explore-katsina' ); ?> <input type="number" min="1" max="50" name="rank_top_percent" value="<?php echo (int) $s['rank_top_percent']; ?>" style="width:5em"> % <?php esc_html_e( 'of its type', 'explore-katsina' ); ?></label></p>
			<p><label><?php esc_html_e( 'Rising = score up at least', 'explore-katsina' ); ?> <input type="number" min="1" max="50" name="rank_rising_points" value="<?php echo (int) $s['rank_rising_points']; ?>" style="width:5em"> <?php esc_html_e( 'points in 90 days', 'explore-katsina' ); ?></label></p>
			<p class="description"><?php esc_html_e( 'Verified = you gave the Verified badge. Featured (a paid plan) is a separate label and is never part of the score.', 'explore-katsina' ); ?></p>
		</td></tr>
	</table>
	<h2><?php esc_html_e( 'Restaurants', 'explore-katsina' ); ?></h2>
	<table class="form-table" role="presentation">
		<tr><th><?php esc_html_e( 'Online food ordering', 'explore-katsina' ); ?></th><td><label><input type="checkbox" name="food_ordering_enabled" value="1" <?php checked( ! empty( $s['food_ordering_enabled'] ) ); ?>> <?php esc_html_e( 'Switch on online food ordering (pickup and delivery) for the whole site', 'explore-katsina' ); ?></label><p class="description"><?php esc_html_e( 'OFF by default. When on, each restaurant can then turn ordering on in its own dashboard. When off, all ordering screens and buttons are hidden.', 'explore-katsina' ); ?></p></td></tr>
	</table>
	<h2><?php esc_html_e( 'Security', 'explore-katsina' ); ?></h2>
	<p><?php echo Crypto::has_dedicated_key() ? '✅ ' . esc_html__( 'Bank details are encrypted with your own key (EK_ENCRYPTION_KEY). Keep a safe offline copy of wp-config.php.', 'explore-katsina' ) : '⚠️ ' . esc_html__( 'No EK_ENCRYPTION_KEY found in wp-config.php.', 'explore-katsina' ); ?></p>
	<?php submit_button(); ?>
</form>
<form method="post">
	<?php wp_nonce_field( 'ek_admin_rankings_run' ); ?><input type="hidden" name="ek_admin_action" value="rankings_run"><input type="hidden" name="back" value="ek-settings">
	<p><button class="button"><?php esc_html_e( 'Recalculate rankings now', 'explore-katsina' ); ?></button> <span class="description"><?php /* translators: %s: date */ printf( esc_html__( 'Rankings update automatically every night. Last calculated: %s', 'explore-katsina' ), esc_html( get_option( 'ek_rank_last' ) ? \EK\View::date( get_option( 'ek_rank_last' ), true ) : __( 'never', 'explore-katsina' ) ) ); ?></span></p>
</form>
