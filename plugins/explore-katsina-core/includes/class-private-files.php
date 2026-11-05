<?php
/**
 * Private files (ID documents). Stored with random, unguessable names in a folder
 * that the web server refuses to serve, and only ever sent to the site admin
 * through a permission-checked link.
 *
 * Set EK_PRIVATE_DIR in wp-config.php to keep them outside the website folder
 * entirely (recommended on the live host).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Private_Files {

	const ALLOWED = array(
		'jpg|jpeg' => 'image/jpeg',
		'png'      => 'image/png',
		'webp'     => 'image/webp',
		'pdf'      => 'application/pdf',
	);

	public static function init() {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve' ), 1 );
	}

	public static function dir() {
		if ( defined( 'EK_PRIVATE_DIR' ) && EK_PRIVATE_DIR ) {
			return trailingslashit( EK_PRIVATE_DIR );
		}
		$uploads = wp_upload_dir( null, false );
		return trailingslashit( $uploads['basedir'] ) . 'ek-private/';
	}

	public static function protect_directory() {
		$dir = self::dir();
		if ( ! wp_mkdir_p( $dir ) ) {
			return;
		}
		$files = array(
			'.htaccess'  => "# Explore Katsina: never serve these files directly.\n<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n",
			'index.php'  => "<?php\n// Silence.\n",
			'web.config' => "<?xml version=\"1.0\"?><configuration><system.webServer><authorization><deny users=\"*\" /></authorization></system.webServer></configuration>\n",
		);
		foreach ( $files as $name => $body ) {
			if ( ! file_exists( $dir . $name ) ) {
				file_put_contents( $dir . $name, $body ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}
		}
	}

	/**
	 * Store an uploaded file from $_FILES[$field].
	 *
	 * @return array|\WP_Error ['file' => stored name, 'mime' => type]
	 */
	public static function store_upload( $field ) {
		if ( empty( $_FILES[ $field ] ) || ! is_array( $_FILES[ $field ] ) || UPLOAD_ERR_NO_FILE === (int) $_FILES[ $field ]['error'] ) {
			return new \WP_Error( 'missing', __( 'Upload a photo or PDF of a valid ID (NIN slip, voter\'s card, driver\'s licence or passport).', 'explore-katsina' ) );
		}
		$f = $_FILES[ $field ]; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		if ( UPLOAD_ERR_OK !== (int) $f['error'] || ! is_uploaded_file( $f['tmp_name'] ) ) {
			return new \WP_Error( 'upload', __( 'The ID upload failed. Please try again.', 'explore-katsina' ) );
		}
		$max = (int) Settings::get( 'max_photo_mb' ) * MB_IN_BYTES;
		if ( (int) $f['size'] > $max ) {
			/* translators: %d: megabytes */
			return new \WP_Error( 'size', sprintf( __( 'The ID file is too large (maximum %d MB).', 'explore-katsina' ), (int) Settings::get( 'max_photo_mb' ) ) );
		}
		$check = wp_check_filetype_and_ext( $f['tmp_name'], $f['name'], self::ALLOWED );
		if ( empty( $check['type'] ) || ! in_array( $check['type'], self::ALLOWED, true ) ) {
			return new \WP_Error( 'type', __( 'The ID must be a JPG, PNG, WebP or PDF file.', 'explore-katsina' ) );
		}
		self::protect_directory();
		$name = bin2hex( random_bytes( 16 ) ) . '.' . $check['ext'];
		if ( ! move_uploaded_file( $f['tmp_name'], self::dir() . $name ) ) {
			return new \WP_Error( 'move', __( 'The ID could not be saved. Please try again.', 'explore-katsina' ) );
		}
		@chmod( self::dir() . $name, 0640 ); // phpcs:ignore
		return array(
			'file' => $name,
			'mime' => $check['type'],
		);
	}

	/** Admin-only link to view a business's ID document. */
	public static function admin_url_for( $business_id ) {
		return add_query_arg(
			array(
				'ek_private_id' => (int) $business_id,
				'_wpnonce'      => wp_create_nonce( 'ek_private_id_' . (int) $business_id ),
			),
			home_url( '/' )
		);
	}

	public static function maybe_serve() {
		if ( empty( $_GET['ek_private_id'] ) ) {
			return;
		}
		$business_id = absint( $_GET['ek_private_id'] );
		if ( ! current_user_can( 'manage_options' ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ?? '' ) ), 'ek_private_id_' . $business_id ) ) {
			wp_die( esc_html__( 'You do not have permission to view this file.', 'explore-katsina' ), '', array( 'response' => 403 ) );
		}
		$details = Business::private_details( $business_id );
		$name    = basename( (string) ( $details['id_doc_file'] ?? '' ) );
		$path    = self::dir() . $name;
		if ( ! $name || ! is_file( $path ) ) {
			wp_die( esc_html__( 'No ID document found.', 'explore-katsina' ), '', array( 'response' => 404 ) );
		}
		Log::add( 'id_viewed', 'business', $business_id );
		nocache_headers();
		header( 'Content-Type: ' . ( $details['id_doc_mime'] ? $details['id_doc_mime'] : 'application/octet-stream' ) );
		header( 'Content-Disposition: inline; filename="id-document-' . $business_id . '.' . pathinfo( $name, PATHINFO_EXTENSION ) . '"' );
		header( 'X-Content-Type-Options: nosniff' );
		header( 'Content-Length: ' . filesize( $path ) );
		readfile( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		exit;
	}

	public static function delete( $name ) {
		$name = basename( (string) $name );
		if ( $name && is_file( self::dir() . $name ) ) {
			wp_delete_file( self::dir() . $name );
		}
	}
}
