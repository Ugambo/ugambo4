<?php
/**
 * Contact fields.
 *
 * @var array $v
 * @var array $errors
 */
use EK\View;

defined( 'ABSPATH' ) || exit;
$s = (array) ( $v['socials'] ?? array() );
?>
<div class="ek-grid ek-grid--2">
	<div class="<?php echo esc_attr( View::field_class( $errors, 'phone' ) ); ?>">
		<label for="ek-phone"><?php esc_html_e( 'Phone number', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
		<input type="tel" id="ek-phone" name="phone" inputmode="tel" autocomplete="tel" required placeholder="0803 123 4567" value="<?php echo esc_attr( $v['phone'] ?? '' ); ?>"<?php echo View::aria( $errors, 'phone' ); // phpcs:ignore ?>>
		<?php echo View::error( $errors, 'phone' ); // phpcs:ignore ?>
	</div>
	<div class="<?php echo esc_attr( View::field_class( $errors, 'whatsapp' ) ); ?>">
		<label for="ek-whatsapp"><?php esc_html_e( 'WhatsApp number', 'explore-katsina' ); ?></label>
		<input type="tel" id="ek-whatsapp" name="whatsapp" inputmode="tel" placeholder="0803 123 4567" value="<?php echo esc_attr( $v['whatsapp'] ?? '' ); ?>"<?php echo View::aria( $errors, 'whatsapp' ); // phpcs:ignore ?>>
		<span class="ek-hint"><?php esc_html_e( 'Visitors can message you directly. Recommended.', 'explore-katsina' ); ?></span>
		<?php echo View::error( $errors, 'whatsapp' ); // phpcs:ignore ?>
	</div>
	<div class="<?php echo esc_attr( View::field_class( $errors, 'email' ) ); ?>">
		<label for="ek-email"><?php esc_html_e( 'Business email', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
		<input type="email" id="ek-email" name="email" autocomplete="email" required value="<?php echo esc_attr( $v['email'] ?? '' ); ?>"<?php echo View::aria( $errors, 'email' ); // phpcs:ignore ?>>
		<span class="ek-hint"><?php esc_html_e( 'Booking and reservation notices are sent here.', 'explore-katsina' ); ?></span>
		<?php echo View::error( $errors, 'email' ); // phpcs:ignore ?>
	</div>
	<div class="<?php echo esc_attr( View::field_class( $errors, 'website' ) ); ?>">
		<label for="ek-website"><?php esc_html_e( 'Website', 'explore-katsina' ); ?></label>
		<input type="url" id="ek-website" name="website" inputmode="url" placeholder="www.example.com" value="<?php echo esc_attr( $v['website'] ?? '' ); ?>"<?php echo View::aria( $errors, 'website' ); // phpcs:ignore ?>>
		<?php echo View::error( $errors, 'website' ); // phpcs:ignore ?>
	</div>
	<div class="ek-field">
		<label for="ek-fb"><?php esc_html_e( 'Facebook page', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-fb" name="socials[facebook]" placeholder="facebook.com/yourpage" value="<?php echo esc_attr( $s['facebook'] ?? '' ); ?>">
	</div>
	<div class="ek-field">
		<label for="ek-ig"><?php esc_html_e( 'Instagram', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-ig" name="socials[instagram]" placeholder="@yourhandle" value="<?php echo esc_attr( $s['instagram'] ?? '' ); ?>">
	</div>
	<div class="ek-field">
		<label for="ek-x"><?php esc_html_e( 'X (Twitter)', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-x" name="socials[x]" placeholder="@yourhandle" value="<?php echo esc_attr( $s['x'] ?? '' ); ?>">
	</div>
	<div class="ek-field">
		<label for="ek-tt"><?php esc_html_e( 'TikTok', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-tt" name="socials[tiktok]" placeholder="@yourhandle" value="<?php echo esc_attr( $s['tiktok'] ?? '' ); ?>">
	</div>
</div>
