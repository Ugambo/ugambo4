<?php
/**
 * Address field.
 *
 * @var array $v
 * @var array $errors
 */
use EK\View;

defined( 'ABSPATH' ) || exit;
?>
<div class="<?php echo esc_attr( View::field_class( $errors, 'address' ) ); ?>">
	<label for="ek-address"><?php esc_html_e( 'Full address', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
	<textarea id="ek-address" name="address" required rows="3" style="min-height:90px" autocomplete="street-address"<?php echo View::aria( $errors, 'address' ); // phpcs:ignore ?>><?php echo esc_textarea( $v['address'] ?? '' ); ?></textarea>
	<span class="ek-hint"><?php esc_html_e( 'Street, area and a well-known landmark nearby (e.g. "opposite the central mosque").', 'explore-katsina' ); ?></span>
	<?php echo View::error( $errors, 'address' ); // phpcs:ignore ?>
</div>
