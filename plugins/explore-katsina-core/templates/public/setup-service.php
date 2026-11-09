<?php
/**
 * Listing setup service order page.
 *
 * @var array $errors
 * @var array $v
 * @var array $packages
 */
use EK\Business;
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;
$val = static fn( $k ) => esc_attr( $v[ $k ] ?? '' );
?>
<div class="ek ek-setup ek-stack" style="max-width:820px;margin:0 auto">
	<h1 style="margin:0"><?php esc_html_e( 'Let us set up your listing', 'explore-katsina' ); ?></h1>
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Busy? Pay once and our team creates your Explore Katsina listing for you: description, details, opening hours, rooms, menu or halls, and photos. We contact you within 2 working days.', 'explore-katsina' ); ?></p>
	<?php if ( ! empty( $errors['_form'] ) ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $errors['_form'] ); ?></div><?php endif; ?>
	<form method="post" class="ek-card ek-stack" novalidate>
		<input type="hidden" name="ek_action" value="setup_order"><?php wp_nonce_field( 'ek_setup_order', '_ek_nonce' ); ?>
		<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
		<fieldset class="<?php echo esc_attr( View::field_class( $errors, 'package' ) ); ?>" style="border:0;padding:0;margin:0">
			<legend class="ek-label"><?php esc_html_e( 'Package', 'explore-katsina' ); ?></legend>
			<div class="ek-grid ek-grid--2">
				<?php foreach ( $packages as $k => $p ) : ?>
					<label class="ek-card ek-choice" style="margin:0"><input type="radio" name="package" value="<?php echo esc_attr( $k ); ?>" <?php checked( ( $v['package'] ?? 'basic' ), $k ); ?>> <strong><?php echo esc_html( $p[0] ); ?></strong> · <?php echo esc_html( Money::format( $p[1] ) ); ?><br><span class="ek-small ek-muted"><?php echo esc_html( $p[2] ); ?></span></label>
				<?php endforeach; ?>
			</div>
			<?php echo View::error( $errors, 'package' ); // phpcs:ignore ?>
		</fieldset>
		<div class="ek-grid ek-grid--2">
			<div class="<?php echo esc_attr( View::field_class( $errors, 'business_name' ) ); ?>"><label for="su-name"><?php esc_html_e( 'Business name', 'explore-katsina' ); ?></label><input type="text" id="su-name" name="business_name" value="<?php echo $val( 'business_name' ); // phpcs:ignore ?>" required><?php echo View::error( $errors, 'business_name' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'type' ) ); ?>"><label for="su-type"><?php esc_html_e( 'Type of business', 'explore-katsina' ); ?></label><select id="su-type" name="type" required><option value=""><?php esc_html_e( 'Choose…', 'explore-katsina' ); ?></option><?php foreach ( Business::types() as $k => $t ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $v['type'] ?? '', $k ); ?>><?php echo esc_html( $t['label'] ); ?></option><?php endforeach; ?></select><?php echo View::error( $errors, 'type' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'lga' ) ); ?>"><label for="su-lga"><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></label><select id="su-lga" name="lga" required><?php echo View::lga_options( absint( $v['lga'] ?? 0 ) ); // phpcs:ignore ?></select><?php echo View::error( $errors, 'lga' ); // phpcs:ignore ?></div>
			<div class="ek-field"><label for="su-addr"><?php esc_html_e( 'Address or landmark', 'explore-katsina' ); ?></label><input type="text" id="su-addr" name="address" value="<?php echo $val( 'address' ); // phpcs:ignore ?>"></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'contact_name' ) ); ?>"><label for="su-cn"><?php esc_html_e( 'Your name', 'explore-katsina' ); ?></label><input type="text" id="su-cn" name="contact_name" autocomplete="name" value="<?php echo $val( 'contact_name' ); // phpcs:ignore ?>" required><?php echo View::error( $errors, 'contact_name' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'phone' ) ); ?>"><label for="su-ph"><?php esc_html_e( 'Phone (WhatsApp if possible)', 'explore-katsina' ); ?></label><input type="tel" id="su-ph" name="phone" autocomplete="tel" placeholder="0803 123 4567" value="<?php echo $val( 'phone' ); // phpcs:ignore ?>" required><?php echo View::error( $errors, 'phone' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'email' ) ); ?> ek-span-2"><label for="su-em"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="su-em" name="email" autocomplete="email" value="<?php echo $val( 'email' ); // phpcs:ignore ?>" required><?php echo View::error( $errors, 'email' ); // phpcs:ignore ?></div>
			<div class="ek-field ek-span-2"><label for="su-notes"><?php esc_html_e( 'Anything we should know (what you offer, prices, best time to visit)', 'explore-katsina' ); ?></label><textarea id="su-notes" name="notes" rows="4"><?php echo esc_textarea( $v['notes'] ?? '' ); ?></textarea></div>
		</div>
		<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Continue to payment', 'explore-katsina' ); ?></button></div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Your listing still goes through our normal approval before it is published. Prices are placeholders until launch.', 'explore-katsina' ); ?></p>
	</form>
</div>
