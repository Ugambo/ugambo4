<?php
/** Admin result message after an action (shared by the money screens). */
defined( 'ABSPATH' ) || exit;
$ek_msg = isset( $_GET['ek_msg'] ) ? sanitize_text_field( wp_unslash( $_GET['ek_msg'] ) ) : ''; // phpcs:ignore
if ( '' !== $ek_msg ) :
	?>
	<div class="notice notice-<?php echo empty( $_GET['ek_ok'] ) ? 'error' : 'success'; // phpcs:ignore ?>"><p><?php echo esc_html( $ek_msg ); ?></p></div>
	<?php
endif;
