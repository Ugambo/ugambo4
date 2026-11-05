<?php
/**
 * Profile editing.
 *
 * @var array $b
 * @var array $form
 */
use EK\Dashboard;

defined( 'ABSPATH' ) || exit;

$errors = $form['errors'];
$v      = $form['values'] ? $form['values'] : $b;
$is_new = false;
?>
<form class="ek-stack" method="post" novalidate>
	<?php echo Dashboard::nonce_fields( 'dash_profile', $b['id'] ); // phpcs:ignore ?>
	<?php if ( $errors ) : ?>
		<div class="ek-notice ek-notice--error" role="alert"><?php esc_html_e( 'Please check the highlighted fields. Nothing was saved yet.', 'explore-katsina' ); ?></div>
	<?php endif; ?>
	<section class="ek-card ek-stack">
		<h2><?php esc_html_e( 'About', 'explore-katsina' ); ?></h2>
		<?php include EK_DIR . 'templates/partials/basic-fields.php'; ?>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Business type cannot be changed here. Contact us if it is wrong.', 'explore-katsina' ); ?></p>
	</section>
	<section class="ek-card ek-stack">
		<h2><?php esc_html_e( 'Location', 'explore-katsina' ); ?></h2>
		<?php include EK_DIR . 'templates/partials/address-field.php'; ?>
		<?php include EK_DIR . 'templates/partials/map-field.php'; ?>
	</section>
	<section class="ek-card ek-stack">
		<h2><?php esc_html_e( 'Contact', 'explore-katsina' ); ?></h2>
		<?php include EK_DIR . 'templates/partials/contact-fields.php'; ?>
	</section>
	<section class="ek-card ek-stack">
		<h2><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?></h2>
		<?php include EK_DIR . 'templates/partials/hours-field.php'; ?>
	</section>
	<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save profile', 'explore-katsina' ); ?></button></div>
</form>
