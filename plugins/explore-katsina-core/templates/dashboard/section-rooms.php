<?php
/**
 * Room categories: list, add, edit.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Hotel;
use EK\Hotel_Dashboard;
use EK\Money;
use EK\Rooms;
use EK\View;

defined( 'ABSPATH' ) || exit;

$edit   = sanitize_key( $_GET['room'] ?? '' ); // phpcs:ignore
$rooms  = Rooms::for_hotel( $b['id'], true );
$errors = Hotel_Dashboard::$errors;
if ( Hotel_Dashboard::$values ) {
	$edit = (string) ( absint( Hotel_Dashboard::$values['room_id'] ?? 0 ) ? absint( Hotel_Dashboard::$values['room_id'] ) : 'new' );
}

if ( $edit ) :
	$room = 'new' === $edit ? null : Rooms::data( absint( $edit ) );
	if ( $room && (int) $room['hotel_id'] !== (int) $b['id'] ) {
		$room = null;
		$edit = 'new';
	}
	$v = Hotel_Dashboard::$values;
	$f = static function ( $key, $fallback ) use ( $v ) {
		return $v ? ( $v[ $key ] ?? '' ) : $fallback;
	};
	$amen = $v ? (array) ( $v['room_amenities'] ?? array() ) : ( $room['amenities'] ?? array( 'ac', 'ensuite' ) );
	?>
	<p><a href="<?php echo esc_url( Dashboard::url( 'rooms', $b['id'] ) ); ?>">← <?php esc_html_e( 'All room categories', 'explore-katsina' ); ?></a></p>
	<form class="ek-card ek-stack" method="post" enctype="multipart/form-data" novalidate>
		<?php echo Dashboard::nonce_fields( 'dash_room', $b['id'] ); // phpcs:ignore ?>
		<input type="hidden" name="room_id" value="<?php echo (int) ( $room['id'] ?? 0 ); ?>">
		<h2 style="margin:0"><?php echo $room ? esc_html__( 'Edit room category', 'explore-katsina' ) : esc_html__( 'Add a room category', 'explore-katsina' ); ?></h2>
		<?php if ( $errors ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php esc_html_e( 'Please check the highlighted fields.', 'explore-katsina' ); ?></div><?php endif; ?>
		<div class="ek-grid ek-grid--2">
			<div class="<?php echo esc_attr( View::field_class( $errors, 'room_name' ) ); ?>"><label for="r-name"><?php esc_html_e( 'Name', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="r-name" name="room_name" list="r-names" required value="<?php echo esc_attr( $f( 'room_name', $room['name'] ?? '' ) ); ?>"><datalist id="r-names"><option value="Standard"><option value="Deluxe"><option value="Executive"><option value="Suite"><option value="Family Room"></datalist><?php echo View::error( $errors, 'room_name' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'units' ) ); ?>"><label for="r-units"><?php esc_html_e( 'How many rooms of this type?', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="number" id="r-units" name="units" min="1" max="500" required value="<?php echo esc_attr( $f( 'units', $room['units'] ?? 1 ) ); ?>"><?php echo View::error( $errors, 'units' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'price' ) ); ?>"><label for="r-price"><?php esc_html_e( 'Price per night (₦)', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="r-price" name="price" inputmode="numeric" required placeholder="25,000" value="<?php echo esc_attr( $f( 'price', isset( $room['price'] ) ? number_format( $room['price'] / 100 ) : '' ) ); ?>"><?php echo View::error( $errors, 'price' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'weekend_price' ) ); ?>"><label for="r-wprice"><?php esc_html_e( 'Weekend price per night (₦, optional)', 'explore-katsina' ); ?></label><input type="text" id="r-wprice" name="weekend_price" inputmode="numeric" value="<?php echo esc_attr( $f( 'weekend_price', ! empty( $room['weekend_price'] ) ? number_format( $room['weekend_price'] / 100 ) : '' ) ); ?>"><span class="ek-hint"><?php esc_html_e( 'Used for Friday and Saturday nights.', 'explore-katsina' ); ?></span><?php echo View::error( $errors, 'weekend_price' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'max_guests' ) ); ?>"><label for="r-guests"><?php esc_html_e( 'Maximum guests per room', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="number" id="r-guests" name="max_guests" min="1" max="20" required value="<?php echo esc_attr( $f( 'max_guests', $room['max_guests'] ?? 2 ) ); ?>"><?php echo View::error( $errors, 'max_guests' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'bed' ) ); ?>"><label for="r-bed"><?php esc_html_e( 'Bed type', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><select id="r-bed" name="bed" required><option value=""><?php esc_html_e( 'Choose…', 'explore-katsina' ); ?></option><?php foreach ( Hotel::bed_types() as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $f( 'bed', $room['bed'] ?? '' ), $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select><?php echo View::error( $errors, 'bed' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'size' ) ); ?>"><label for="r-size"><?php esc_html_e( 'Size (m², optional)', 'explore-katsina' ); ?></label><input type="number" id="r-size" name="size" min="0" max="1000" value="<?php echo esc_attr( $f( 'size', $room['size'] ?? '' ) ); ?>"><?php echo View::error( $errors, 'size' ); // phpcs:ignore ?></div>
		</div>
		<fieldset style="border:0;padding:0;margin:0"><legend class="ek-label"><?php esc_html_e( 'Room amenities', 'explore-katsina' ); ?></legend>
			<div class="ek-checkgrid"><?php foreach ( Hotel::room_amenities() as $k => $label ) : ?><label class="ek-check"><input type="checkbox" name="room_amenities[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $amen, true ) ); ?>> <?php echo esc_html( $label ); ?></label><?php endforeach; ?></div>
		</fieldset>
		<div class="ek-field"><label for="r-desc"><?php esc_html_e( 'Description', 'explore-katsina' ); ?></label><textarea id="r-desc" name="room_description" rows="3"><?php echo esc_textarea( $f( 'room_description', $room['description'] ?? '' ) ); ?></textarea></div>
		<div class="ek-field">
			<span class="ek-label"><?php esc_html_e( 'Photos (up to 6)', 'explore-katsina' ); ?></span>
			<?php if ( ! empty( $room['photos'] ) ) : ?>
				<ul class="ek-photos" style="list-style:none;margin:0;padding:0">
					<?php foreach ( $room['photos'] as $pid ) : ?>
						<li class="ek-photo"><?php echo wp_get_attachment_image( $pid, 'thumbnail', false, array( 'alt' => '' ) ); ?><span class="ek-photo-tools"><label><input type="checkbox" name="remove_photo[]" value="<?php echo (int) $pid; ?>"> <?php esc_html_e( 'Remove', 'explore-katsina' ); ?></label></span></li>
					<?php endforeach; ?>
				</ul>
			<?php endif; ?>
			<input type="file" name="room_photos[]" accept="image/jpeg,image/png,image/webp" multiple data-ek-preview="r-prev" data-ek-max-files="6">
			<div class="ek-previews" id="r-prev"></div>
		</div>
		<label class="ek-check"><input type="checkbox" name="active" value="1" <?php checked( $v ? ! empty( $v['active'] ) : ( $room['active'] ?? true ) ); ?>> <span><strong><?php esc_html_e( 'Available for booking', 'explore-katsina' ); ?></strong><br><span class="ek-small ek-muted"><?php esc_html_e( 'Untick to hide this room type without deleting it.', 'explore-katsina' ); ?></span></span></label>
		<div class="ek-row"><button class="ek-btn" type="submit"><?php esc_html_e( 'Save room category', 'explore-katsina' ); ?></button></div>
	</form>
	<?php if ( $room ) : ?>
		<form method="post" class="ek-row">
			<?php echo Dashboard::nonce_fields( 'dash_room_delete', $b['id'] ); // phpcs:ignore ?>
			<input type="hidden" name="room_id" value="<?php echo (int) $room['id']; ?>">
			<button class="ek-link-btn" type="submit" data-ek-confirm="<?php esc_attr_e( 'Tap again to delete', 'explore-katsina' ); ?>"><?php esc_html_e( 'Delete this room category', 'explore-katsina' ); ?></button>
		</form>
	<?php endif; ?>
<?php else : ?>
	<div class="ek-row ek-row--between">
		<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Create one category for each type of room, e.g. Standard, Deluxe, Executive, Suite.', 'explore-katsina' ); ?></p>
		<a class="ek-btn" href="<?php echo esc_url( Dashboard::url( 'rooms', $b['id'], array( 'room' => 'new' ) ) ); ?>">+ <?php esc_html_e( 'Add room category', 'explore-katsina' ); ?></a>
	</div>
	<?php if ( ! $rooms ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No room categories yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Guests can book once you add at least one room category with a price.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<div class="ek-roomlist">
			<?php foreach ( $rooms as $r ) : ?>
				<article class="ek-card ek-roomcard">
					<?php if ( $r['photos'] ) { echo wp_get_attachment_image( $r['photos'][0], 'medium', false, array( 'class' => 'ek-roomcard-img', 'alt' => '' ) ); } else { echo '<div class="ek-roomcard-img ek-roomcard-img--empty" aria-hidden="true"></div>'; } // phpcs:ignore ?>
					<div class="ek-stack" style="gap:6px;min-width:0">
						<div class="ek-row ek-row--between"><h3 style="margin:0"><?php echo esc_html( $r['name'] ); ?></h3><span class="ek-pill <?php echo $r['active'] ? 'ek-pill--ok' : ''; ?>"><?php echo $r['active'] ? esc_html__( 'Bookable', 'explore-katsina' ) : esc_html__( 'Hidden', 'explore-katsina' ); ?></span></div>
						<p class="ek-small" style="margin:0"><strong class="ek-num"><?php echo esc_html( Money::format( $r['price'] ) ); ?></strong> <?php esc_html_e( 'per night', 'explore-katsina' ); ?><?php echo $r['weekend_price'] ? ' · ' . esc_html__( 'weekends', 'explore-katsina' ) . ' ' . esc_html( Money::format( $r['weekend_price'] ) ) : ''; ?></p>
						<p class="ek-small ek-muted" style="margin:0"><?php /* translators: 1: rooms, 2: guests */ printf( esc_html__( '%1$d rooms · up to %2$d guests each', 'explore-katsina' ), (int) $r['units'], (int) $r['max_guests'] ); ?> · <?php echo esc_html( Hotel::bed_types()[ $r['bed'] ] ?? '' ); ?></p>
						<div class="ek-row"><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'rooms', $b['id'], array( 'room' => $r['id'] ) ) ); ?>"><?php esc_html_e( 'Edit', 'explore-katsina' ); ?></a><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'calendar', $b['id'], array( 'room' => $r['id'] ) ) ); ?>"><?php esc_html_e( 'Calendar & prices', 'explore-katsina' ); ?></a></div>
					</div>
				</article>
			<?php endforeach; ?>
		</div>
	<?php endif; ?>
<?php endif; ?>
