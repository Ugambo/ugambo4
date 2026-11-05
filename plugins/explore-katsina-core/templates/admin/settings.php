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
		<tr><th><?php esc_html_e( 'Commission rates', 'explore-katsina' ); ?></th><td><p class="description"><?php esc_html_e( 'Commission settings arrive in Phase 7 (placeholders: hotels 10%, event centres 10%, tour operators 15%, restaurant reservations 0%, food orders 10%).', 'explore-katsina' ); ?></p></td></tr>
	</table>
	<h2><?php esc_html_e( 'Rankings', 'explore-katsina' ); ?></h2>
	<table class="form-table" role="presentation">
		<tr><th><label for="min_reviews_for_rank"><?php esc_html_e( 'Verified reviews needed for a rank number', 'explore-katsina' ); ?></label></th><td><input type="number" min="1" max="50" id="min_reviews_for_rank" name="min_reviews_for_rank" value="<?php echo (int) $s['min_reviews_for_rank']; ?>"><p class="description"><?php esc_html_e( 'The full ranking weights are added in Phase 8.', 'explore-katsina' ); ?></p></td></tr>
	</table>
	<h2><?php esc_html_e( 'Security', 'explore-katsina' ); ?></h2>
	<p><?php echo Crypto::has_dedicated_key() ? '✅ ' . esc_html__( 'Bank details are encrypted with your own key (EK_ENCRYPTION_KEY). Keep a safe offline copy of wp-config.php.', 'explore-katsina' ) : '⚠️ ' . esc_html__( 'No EK_ENCRYPTION_KEY found in wp-config.php.', 'explore-katsina' ); ?></p>
	<?php submit_button(); ?>
</form>
