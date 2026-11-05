<?php
/**
 * Photos.
 *
 * @var array $b
 */
use EK\Business;
use EK\Dashboard;
use EK\Settings;

defined( 'ABSPATH' ) || exit;

$max   = Business::max_photos( $b['id'] );
$count = count( $b['photos'] );
?>
<section class="ek-card ek-stack" aria-labelledby="ph-h">
	<div class="ek-row ek-row--between">
		<h2 id="ph-h" style="margin:0"><?php esc_html_e( 'Your photos', 'explore-katsina' ); ?></h2>
		<span class="ek-pill ek-num"><?php /* translators: 1: used, 2: max */ printf( esc_html__( '%1$d of %2$d', 'explore-katsina' ), (int) $count, (int) $max ); ?></span>
	</div>
	<p class="ek-muted ek-small" style="margin:0"><?php esc_html_e( 'The first photo is your cover on search results and the map. Use your own bright, clear photos.', 'explore-katsina' ); ?></p>
	<?php if ( $b['photos'] ) : ?>
		<ul class="ek-photos" style="list-style:none;margin:0;padding:0">
			<?php foreach ( $b['photos'] as $i => $pid ) : ?>
				<li class="ek-photo">
					<?php echo wp_get_attachment_image( $pid, 'medium', false, array( 'loading' => 'lazy', 'alt' => '' ) ); ?>
					<?php if ( 0 === $i ) : ?><span class="ek-cover"><?php esc_html_e( 'Cover', 'explore-katsina' ); ?></span><?php endif; ?>
					<form method="post" class="ek-photo-tools">
						<?php echo Dashboard::nonce_fields( 'dash_photos', $b['id'] ); // phpcs:ignore ?>
						<input type="hidden" name="photo" value="<?php echo (int) $pid; ?>">
						<span style="display:flex;gap:4px">
							<button type="submit" name="op" value="left" aria-label="<?php esc_attr_e( 'Move earlier', 'explore-katsina' ); ?>" <?php disabled( 0 === $i ); ?>>←</button>
							<button type="submit" name="op" value="right" aria-label="<?php esc_attr_e( 'Move later', 'explore-katsina' ); ?>" <?php disabled( $count - 1 === $i ); ?>>→</button>
						</span>
						<span style="display:flex;gap:4px">
							<?php if ( $i > 0 ) : ?><button type="submit" name="op" value="cover"><?php esc_html_e( 'Cover', 'explore-katsina' ); ?></button><?php endif; ?>
							<button type="submit" name="op" value="delete" data-ek-confirm="<?php esc_attr_e( 'Sure?', 'explore-katsina' ); ?>" aria-label="<?php esc_attr_e( 'Delete photo', 'explore-katsina' ); ?>">✕</button>
						</span>
					</form>
				</li>
			<?php endforeach; ?>
		</ul>
	<?php endif; ?>
</section>
<?php if ( $count < $max ) : ?>
	<form class="ek-card ek-stack" method="post" enctype="multipart/form-data">
		<?php echo Dashboard::nonce_fields( 'dash_photos', $b['id'] ); // phpcs:ignore ?>
		<input type="hidden" name="op" value="upload">
		<div class="ek-field">
			<label for="ek-add-photos"><?php esc_html_e( 'Add photos', 'explore-katsina' ); ?></label>
			<div class="ek-drop">
				<input type="file" id="ek-add-photos" name="photos[]" accept="image/jpeg,image/png,image/webp" multiple data-ek-preview="ek-add-previews" data-ek-max-files="<?php echo (int) ( $max - $count ); ?>">
				<p class="ek-hint" style="margin:.5em 0 0"><?php /* translators: 1: number, 2: MB */ printf( esc_html__( 'You can add %1$d more. JPG, PNG or WebP, up to %2$d MB each.', 'explore-katsina' ), (int) ( $max - $count ), (int) Settings::get( 'max_photo_mb' ) ); ?></p>
				<div class="ek-previews" id="ek-add-previews"></div>
			</div>
		</div>
		<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Upload', 'explore-katsina' ); ?></button></div>
	</form>
<?php else : ?>
	<div class="ek-notice ek-notice--info"><?php esc_html_e( 'You have reached the photo limit for the Basic plan. Featured and Premium plans allow more photos.', 'explore-katsina' ); ?></div>
<?php endif; ?>
