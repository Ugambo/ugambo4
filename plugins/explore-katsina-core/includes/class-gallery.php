<?php
/**
 * Photo galleries for guide content (attractions and events): the admin picks photos from the
 * Media Library in wp-admin. Visitors see a photo mosaic, with photo credits (author, licence,
 * source) underneath for any photo that carries them, e.g. Wikimedia Commons photos.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Gallery {

	const META = '_ek_gallery';

	/** @return int[] Attachment IDs, in order (falls back to the featured image). */
	public static function ids( $post_id ) {
		$ids = array_values( array_filter( array_map( 'intval', (array) get_post_meta( (int) $post_id, self::META, true ) ) ) );
		if ( ! $ids && has_post_thumbnail( $post_id ) ) {
			$ids = array( (int) get_post_thumbnail_id( $post_id ) );
		}
		return array_values( array_filter( $ids, static fn( $id ) => 'attachment' === get_post_type( $id ) ) );
	}

	public static function set( $post_id, array $ids ) {
		$ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ), static fn( $id ) => $id && 'attachment' === get_post_type( $id ) ) ) );
		update_post_meta( (int) $post_id, self::META, $ids );
		if ( $ids && ! has_post_thumbnail( $post_id ) ) {
			set_post_thumbnail( $post_id, $ids[0] );
		}
		return $ids;
	}

	/* ---------------- wp-admin ---------------- */

	public static function admin_assets() {
		wp_enqueue_media();
		wp_add_inline_script(
			'jquery-core',
			"jQuery(function($){\$(document).on('click','[data-ek-gallery-pick]',function(e){e.preventDefault();var box=\$(this).closest('[data-ek-gallery]'),input=box.find('input[type=hidden]'),frame=wp.media({title:box.data('title'),multiple:'add',library:{type:'image'},button:{text:box.data('button')}});frame.on('open',function(){var sel=frame.state().get('selection');(input.val()||'').split(',').forEach(function(id){id=parseInt(id,10);if(id){var a=wp.media.attachment(id);a.fetch();sel.add(a);}});});frame.on('select',function(){var ids=[],html='';frame.state().get('selection').each(function(a){ids.push(a.id);var s=a.get('sizes'),u=s&&s.thumbnail?s.thumbnail.url:a.get('url');html+='<img src=\"'+u+'\" alt=\"\" width=\"72\" height=\"72\" style=\"object-fit:cover;border-radius:4px\">';});input.val(ids.join(','));box.find('[data-ek-gallery-thumbs]').html(html);});frame.open();});\$(document).on('click','[data-ek-gallery-clear]',function(e){e.preventDefault();var box=\$(this).closest('[data-ek-gallery]');box.find('input[type=hidden]').val('');box.find('[data-ek-gallery-thumbs]').empty();});});"
		);
	}

	public static function field( $post_id ) {
		$ids = array_values( array_filter( array_map( 'intval', (array) get_post_meta( (int) $post_id, self::META, true ) ) ) );
		?>
		<div class="ek-field" data-ek-gallery data-title="<?php esc_attr_e( 'Choose photos', 'explore-katsina' ); ?>" data-button="<?php esc_attr_e( 'Use these photos', 'explore-katsina' ); ?>">
			<label><?php esc_html_e( 'Photo gallery (the first photo is the main one)', 'explore-katsina' ); ?></label>
			<input type="hidden" name="ek_gallery" value="<?php echo esc_attr( implode( ',', $ids ) ); ?>">
			<div data-ek-gallery-thumbs style="display:flex;gap:6px;flex-wrap:wrap;margin:6px 0">
				<?php foreach ( $ids as $id ) : ?>
					<?php echo wp_get_attachment_image( $id, 'thumbnail', false, array( 'style' => 'width:72px;height:72px;object-fit:cover;border-radius:4px' ) ); ?>
				<?php endforeach; ?>
			</div>
			<p><button type="button" class="button" data-ek-gallery-pick><?php esc_html_e( 'Choose photos', 'explore-katsina' ); ?></button> <button type="button" class="button-link" data-ek-gallery-clear><?php esc_html_e( 'Remove all', 'explore-katsina' ); ?></button></p>
			<p class="description"><?php esc_html_e( 'Only use photos you own or that have a free licence. For Wikimedia Commons photos, keep the author and licence: they are shown as photo credits.', 'explore-katsina' ); ?></p>
		</div>
		<?php
	}

	/** Save the hidden "ek_gallery" field (nonce and capability are checked by the caller). */
	public static function save_field( $post_id, array $in ) {
		if ( isset( $in['ek_gallery'] ) ) {
			self::set( $post_id, explode( ',', sanitize_text_field( (string) $in['ek_gallery'] ) ) );
		}
	}

	/* ---------------- Public ---------------- */

	public static function render( array $ids, $alt = '' ) {
		if ( ! $ids ) {
			return '';
		}
		$show = array_slice( $ids, 0, 5 );
		$html = '<div class="ek-gallery ek-gallery--' . count( $show ) . '">';
		foreach ( $show as $i => $pid ) {
			$caption = wp_get_attachment_caption( $pid );
			$html   .= wp_get_attachment_image( $pid, 0 === $i ? 'large' : 'medium_large', false, array( 'loading' => 0 === $i ? 'eager' : 'lazy', 'alt' => $caption ? $caption : $alt ) );
		}
		return $html . '</div>' . View::credits_for( $ids );
	}
}
