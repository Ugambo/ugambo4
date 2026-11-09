<?php
/**
 * Halls / spaces: list, add, edit.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Halls;
use EK\Money;
use EK\Venue_Dashboard;
use EK\View;

defined( 'ABSPATH' ) || exit;

$edit   = sanitize_key( $_GET['hall'] ?? '' ); // phpcs:ignore
$halls  = Halls::for_venue( $b['id'], true );
$errors = Venue_Dashboard::$errors;
if ( Venue_Dashboard::$values && isset( Venue_Dashboard::$values['hall_name'] ) ) {
	$edit = absint( Venue_Dashboard::$values['hall_id'] ?? 0 ) ? (string) absint( Venue_Dashboard::$values['hall_id'] ) : 'new';
}
$settings = Halls::settings_labels();

if ( $edit ) :
	$h = 'new' === $edit ? null : Halls::data( absint( $edit ) );
	if ( $h && (int) $h['venue_id'] !== (int) $b['id'] ) {
		$h = null;
	}
	$v = isset( Venue_Dashboard::$values['hall_name'] ) ? Venue_Dashboard::$values : array();
	$f = static fn( $k, $fallback ) => $v ? ( $v[ $k ] ?? '' ) : $fallback;
	?>
	<p><a href="<?php echo esc_url( Dashboard::url( 'halls', $b['id'] ) ); ?>">← <?php esc_html_e( 'All halls', 'explore-katsina' ); ?></a></p>
	<form class="ek-card ek-stack" method="post" enctype="multipart/form-data" novalidate>
		<?php echo Dashboard::nonce_fields( 'dash_hall', $b['id'] ); // phpcs:ignore ?>
		<input type="hidden" name="hall_id" value="<?php echo (int) ( $h['id'] ?? 0 ); ?>">
		<h2 style="margin:0"><?php echo $h ? esc_html__( 'Edit hall', 'explore-katsina' ) : esc_html__( 'Add a hall or space', 'explore-katsina' ); ?></h2>
		<?php if ( $errors ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php esc_html_e( 'Please check the highlighted fields.', 'explore-katsina' ); ?></div><?php endif; ?>
		<div class="ek-grid ek-grid--2">
			<div class="<?php echo esc_attr( View::field_class( $errors, 'hall_name' ) ); ?> ek-span-2"><label for="h-name"><?php esc_html_e( 'Name', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="h-name" name="hall_name" required placeholder="<?php esc_attr_e( 'e.g. Main Hall, Garden, Conference Room', 'explore-katsina' ); ?>" value="<?php echo esc_attr( $f( 'hall_name', $h['name'] ?? '' ) ); ?>"><?php echo View::error( $errors, 'hall_name' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'capacity_seated' ) ); ?>"><label for="h-seat"><?php esc_html_e( 'Capacity seated', 'explore-katsina' ); ?></label><input type="number" id="h-seat" name="capacity_seated" min="0" value="<?php echo esc_attr( $f( 'capacity_seated', $h['capacity_seated'] ?? '' ) ); ?>"><?php echo View::error( $errors, 'capacity_seated' ); // phpcs:ignore ?></div>
			<div class="ek-field"><label for="h-stand"><?php esc_html_e( 'Capacity standing', 'explore-katsina' ); ?></label><input type="number" id="h-stand" name="capacity_standing" min="0" value="<?php echo esc_attr( $f( 'capacity_standing', $h['capacity_standing'] ?? '' ) ); ?>"></div>
			<div class="ek-field"><label for="h-pricing"><?php esc_html_e( 'Price is', 'explore-katsina' ); ?></label><select id="h-pricing" name="pricing"><option value="day" <?php selected( $f( 'pricing', $h['pricing'] ?? 'day' ), 'day' ); ?>><?php esc_html_e( 'Per day', 'explore-katsina' ); ?></option><option value="event" <?php selected( $f( 'pricing', $h['pricing'] ?? 'day' ), 'event' ); ?>><?php esc_html_e( 'Per event (one day)', 'explore-katsina' ); ?></option></select></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'price' ) ); ?>"><label for="h-price"><?php esc_html_e( 'Price (₦)', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="h-price" name="price" inputmode="numeric" required value="<?php echo esc_attr( $f( 'price', isset( $h['price'] ) ? number_format( $h['price'] / 100 ) : '' ) ); ?>"><?php echo View::error( $errors, 'price' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'weekend_price' ) ); ?>"><label for="h-wprice"><?php esc_html_e( 'Weekend price (₦, optional)', 'explore-katsina' ); ?></label><input type="text" id="h-wprice" name="weekend_price" inputmode="numeric" value="<?php echo esc_attr( $f( 'weekend_price', ! empty( $h['weekend_price'] ) ? number_format( $h['weekend_price'] / 100 ) : '' ) ); ?>"><span class="ek-hint"><?php esc_html_e( 'Used for Fridays and Saturdays.', 'explore-katsina' ); ?></span><?php echo View::error( $errors, 'weekend_price' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'setting' ) ); ?>"><label for="h-set"><?php esc_html_e( 'Indoor or outdoor', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><select id="h-set" name="setting" required><option value=""><?php esc_html_e( 'Choose…', 'explore-katsina' ); ?></option><?php foreach ( $settings as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $f( 'setting', $h['setting'] ?? '' ), $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select><?php echo View::error( $errors, 'setting' ); // phpcs:ignore ?></div>
		</div>
		<div class="ek-field"><label for="h-desc"><?php esc_html_e( 'Description', 'explore-katsina' ); ?></label><textarea id="h-desc" name="hall_description" rows="3"><?php echo esc_textarea( $f( 'hall_description', $h['description'] ?? '' ) ); ?></textarea></div>
		<div class="ek-field">
			<span class="ek-label"><?php esc_html_e( 'Photos (up to 6)', 'explore-katsina' ); ?></span>
			<?php if ( ! empty( $h['photos'] ) ) : ?><ul class="ek-photos" style="list-style:none;margin:0;padding:0"><?php foreach ( $h['photos'] as $pid ) : ?><li class="ek-photo"><?php echo wp_get_attachment_image( $pid, 'thumbnail', false, array( 'alt' => '' ) ); ?><span class="ek-photo-tools"><label><input type="checkbox" name="remove_photo[]" value="<?php echo (int) $pid; ?>"> <?php esc_html_e( 'Remove', 'explore-katsina' ); ?></label></span></li><?php endforeach; ?></ul><?php endif; ?>
			<input type="file" name="hall_photos[]" accept="image/jpeg,image/png,image/webp" multiple data-ek-preview="h-prev" data-ek-max-files="6"><div class="ek-previews" id="h-prev"></div>
		</div>
		<label class="ek-check"><input type="checkbox" name="active" value="1" <?php checked( $v ? ! empty( $v['active'] ) : ( $h['active'] ?? true ) ); ?>> <strong><?php esc_html_e( 'Available for booking', 'explore-katsina' ); ?></strong></label>
		<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save hall', 'explore-katsina' ); ?></button></div>
	</form>
	<?php if ( $h ) : ?><form method="post"><?php echo Dashboard::nonce_fields( 'dash_hall_delete', $b['id'] ); // phpcs:ignore ?><input type="hidden" name="hall_id" value="<?php echo (int) $h['id']; ?>"><button class="ek-link-btn" type="submit" data-ek-confirm="<?php esc_attr_e( 'Tap again to delete', 'explore-katsina' ); ?>"><?php esc_html_e( 'Delete this hall', 'explore-katsina' ); ?></button></form><?php endif; ?>
<?php else : ?>
	<div class="ek-row ek-row--between">
		<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Add each hall or space guests can book.', 'explore-katsina' ); ?></p>
		<a class="ek-btn" href="<?php echo esc_url( Dashboard::url( 'halls', $b['id'], array( 'hall' => 'new' ) ) ); ?>">+ <?php esc_html_e( 'Add hall', 'explore-katsina' ); ?></a>
	</div>
	<?php if ( ! $halls ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No halls yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Guests can book once you add at least one hall with a price.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<div class="ek-roomlist">
			<?php foreach ( $halls as $h ) : ?>
				<article class="ek-card ek-roomcard">
					<?php echo $h['photos'] ? wp_get_attachment_image( $h['photos'][0], 'medium', false, array( 'class' => 'ek-roomcard-img', 'alt' => '' ) ) : '<div class="ek-roomcard-img ek-roomcard-img--empty" aria-hidden="true"></div>'; // phpcs:ignore ?>
					<div class="ek-stack" style="gap:6px;min-width:0">
						<div class="ek-row ek-row--between"><h3 style="margin:0"><?php echo esc_html( $h['name'] ); ?></h3><span class="ek-pill <?php echo $h['active'] ? 'ek-pill--ok' : ''; ?>"><?php echo $h['active'] ? esc_html__( 'Bookable', 'explore-katsina' ) : esc_html__( 'Hidden', 'explore-katsina' ); ?></span></div>
						<p class="ek-small" style="margin:0"><strong class="ek-num"><?php echo esc_html( Money::format( $h['price'] ) ); ?></strong> <?php echo 'event' === $h['pricing'] ? esc_html__( 'per event', 'explore-katsina' ) : esc_html__( 'per day', 'explore-katsina' ); ?></p>
						<p class="ek-small ek-muted" style="margin:0"><?php /* translators: 1: seated, 2: standing */ printf( esc_html__( '%1$d seated · %2$d standing', 'explore-katsina' ), (int) $h['capacity_seated'], (int) $h['capacity_standing'] ); ?> · <?php echo esc_html( $settings[ $h['setting'] ] ?? '' ); ?></p>
						<div class="ek-row"><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'halls', $b['id'], array( 'hall' => $h['id'] ) ) ); ?>"><?php esc_html_e( 'Edit', 'explore-katsina' ); ?></a><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'calendar', $b['id'], array( 'room' => $h['id'] ) ) ); ?>"><?php esc_html_e( 'Calendar & prices', 'explore-katsina' ); ?></a></div>
					</div>
				</article>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>
<?php endif; ?>
