<?php
/**
 * Business photo uploads (public images, stored in the Media Library).
 * Owners don't get the "upload_files" capability, so they can't browse the
 * Media Library; uploads only happen through our checked forms.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Photos {

	const MIMES = array(
		'jpg|jpeg' => 'image/jpeg',
		'png'      => 'image/png',
		'webp'     => 'image/webp',
	);

	/**
	 * Upload every file in $_FILES[$field][] and attach it to the business.
	 *
	 * @return array{ids: int[], errors: string[]}
	 */
	public static function upload_many( $field, $business_id, $limit ) {
		$out = array(
			'ids'    => array(),
			'errors' => array(),
		);
		if ( empty( $_FILES[ $field ]['name'] ) || ! is_array( $_FILES[ $field ]['name'] ) ) {
			return $out;
		}
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		require_once ABSPATH . 'wp-admin/includes/image.php';

		$files = $_FILES[ $field ]; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$max   = (int) Settings::get( 'max_photo_mb' ) * MB_IN_BYTES;
		$count = count( $files['name'] );

		for ( $i = 0; $i < $count; $i++ ) {
			if ( UPLOAD_ERR_NO_FILE === (int) $files['error'][ $i ] ) {
				continue;
			}
			$name = sanitize_file_name( $files['name'][ $i ] );
			if ( count( $out['ids'] ) >= $limit ) {
				/* translators: %d: number of photos */
				$out['errors'][] = sprintf( __( 'Only %d photos are allowed on your plan; extra photos were skipped.', 'explore-katsina' ), $limit );
				break;
			}
			if ( UPLOAD_ERR_OK !== (int) $files['error'][ $i ] || (int) $files['size'][ $i ] > $max ) {
				/* translators: 1: file name, 2: MB */
				$out['errors'][] = sprintf( __( '%1$s was not uploaded (maximum %2$d MB per photo).', 'explore-katsina' ), $name, (int) Settings::get( 'max_photo_mb' ) );
				continue;
			}
			$check = wp_check_filetype_and_ext( $files['tmp_name'][ $i ], $files['name'][ $i ], self::MIMES );
			if ( empty( $check['type'] ) ) {
				/* translators: %s: file name */
				$out['errors'][] = sprintf( __( '%s is not a JPG, PNG or WebP photo.', 'explore-katsina' ), $name );
				continue;
			}
			$_FILES['ek_single_photo'] = array(
				'name'     => $files['name'][ $i ],
				'type'     => $check['type'],
				'tmp_name' => $files['tmp_name'][ $i ],
				'error'    => $files['error'][ $i ],
				'size'     => $files['size'][ $i ],
			);
			$id = media_handle_upload( 'ek_single_photo', (int) $business_id, array(), array( 'test_form' => false, 'mimes' => self::MIMES ) );
			unset( $_FILES['ek_single_photo'] );
			if ( is_wp_error( $id ) ) {
				$out['errors'][] = $name . ': ' . $id->get_error_message();
				continue;
			}
			update_post_meta( $id, '_ek_business_photo', (int) $business_id );
			$out['ids'][] = (int) $id;
		}
		return $out;
	}

	/** Only photos that really belong to this business can be kept / reordered. */
	public static function owned_by( $attachment_id, $business_id ) {
		return (int) get_post_meta( (int) $attachment_id, '_ek_business_photo', true ) === (int) $business_id;
	}
}
