<?php
/**
 * Name, type, LGA, address, description.
 *
 * @var array $v
 * @var array $errors
 * @var bool  $is_new
 */
use EK\Business;
use EK\View;

defined( 'ABSPATH' ) || exit;
?>
<div class="<?php echo esc_attr( View::field_class( $errors, 'name' ) ); ?>">
	<label for="ek-name"><?php esc_html_e( 'Business name', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
	<input type="text" id="ek-name" name="business_name" required maxlength="120" autocomplete="organization" value="<?php echo esc_attr( $v['business_name'] ?? ( $v['name'] ?? '' ) ); ?>"<?php echo View::aria( $errors, 'name' ); // phpcs:ignore ?>>
	<?php echo View::error( $errors, 'name' ); // phpcs:ignore ?>
</div>
<div class="ek-grid ek-grid--2">
	<?php if ( $is_new ) : ?>
		<div class="<?php echo esc_attr( View::field_class( $errors, 'type' ) ); ?>">
			<label for="ek-type"><?php esc_html_e( 'Business type', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
			<select id="ek-type" name="type" required<?php echo View::aria( $errors, 'type' ); // phpcs:ignore ?>>
				<option value=""><?php esc_html_e( 'Choose type…', 'explore-katsina' ); ?></option>
				<optgroup label="<?php esc_attr_e( 'Bookings & reservations', 'explore-katsina' ); ?>">
				<?php foreach ( Business::types() as $slug => $t ) : if ( 'marketplace' !== $t['group'] ) { continue; } ?>
					<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $v['type'] ?? '', $slug ); ?>><?php echo esc_html( $t['label'] ); ?></option>
				<?php endforeach; ?>
				</optgroup>
				<optgroup label="<?php esc_attr_e( 'Directory', 'explore-katsina' ); ?>">
				<?php foreach ( Business::types() as $slug => $t ) : if ( 'directory' !== $t['group'] ) { continue; } ?>
					<option value="<?php echo esc_attr( $slug ); ?>" <?php selected( $v['type'] ?? '', $slug ); ?>><?php echo esc_html( $t['label'] ); ?></option>
				<?php endforeach; ?>
				</optgroup>
			</select>
			<?php echo View::error( $errors, 'type' ); // phpcs:ignore ?>
		</div>
	<?php endif; ?>
	<div class="<?php echo esc_attr( View::field_class( $errors, 'lga_id' ) ); ?>">
		<label for="ek-lga"><?php esc_html_e( 'Local Government Area (LGA)', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
		<select id="ek-lga" name="lga_id" required<?php echo View::aria( $errors, 'lga_id' ); // phpcs:ignore ?>><?php echo View::lga_options( (int) ( $v['lga_id'] ?? 0 ) ); // phpcs:ignore ?></select>
		<?php echo View::error( $errors, 'lga_id' ); // phpcs:ignore ?>
	</div>
</div>
<div class="<?php echo esc_attr( View::field_class( $errors, 'description' ) ); ?>">
	<label for="ek-description"><?php esc_html_e( 'Description', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
	<textarea id="ek-description" name="description" required minlength="40" maxlength="3000" data-ek-count<?php echo View::aria( $errors, 'description' ); // phpcs:ignore ?>><?php echo esc_textarea( wp_strip_all_tags( $v['description'] ?? '' ) ); ?></textarea>
	<span class="ek-hint"><?php esc_html_e( 'What makes your business special? What do you offer? 40–3,000 characters.', 'explore-katsina' ); ?> <span data-ek-counter></span></span>
	<?php echo View::error( $errors, 'description' ); // phpcs:ignore ?>
</div>
