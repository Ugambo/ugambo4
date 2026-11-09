<?php
/**
 * My Account (logged out): log in or create an account.
 *
 * @var array $errors
 * @var array $v
 */
use EK\Account;
use EK\View;

defined( 'ABSPATH' ) || exit;
$redirect = isset( $_GET['redirect_to'] ) ? esc_url_raw( wp_unslash( $_GET['redirect_to'] ) ) : Account::url( 'bookings' ); // phpcs:ignore
?>
<div class="ek ek-account">
	<h1><?php esc_html_e( 'My Account', 'explore-katsina' ); ?></h1>
	<p class="ek-muted"><?php esc_html_e( 'See your bookings, reservations and orders in one place, save favourite places, and review where you stayed or ate.', 'explore-katsina' ); ?></p>
	<?php if ( ! empty( $errors['_form'] ) ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $errors['_form'] ); ?></div><?php endif; ?>
	<div class="ek-grid ek-grid--2">
		<section class="ek-card ek-login" aria-labelledby="li-h" style="margin:0">
			<h2 id="li-h"><?php esc_html_e( 'Log in', 'explore-katsina' ); ?></h2>
			<?php wp_login_form( array( 'redirect' => $redirect, 'label_username' => __( 'Email or username', 'explore-katsina' ), 'label_log_in' => __( 'Log in', 'explore-katsina' ), 'id_username' => 'ek-li-user', 'id_password' => 'ek-li-pass', 'id_submit' => 'ek-li-submit' ) ); ?>
			<p class="ek-small"><a href="<?php echo esc_url( wp_lostpassword_url( $redirect ) ); ?>"><?php esc_html_e( 'Forgot your password?', 'explore-katsina' ); ?></a></p>
		</section>
		<form class="ek-card ek-stack" method="post" novalidate aria-labelledby="reg-h" style="margin:0">
			<h2 id="reg-h" style="margin:0"><?php esc_html_e( 'Create an account', 'explore-katsina' ); ?></h2>
			<input type="hidden" name="ek_action" value="acct_register">
			<?php wp_nonce_field( 'ek_acct_register', '_ek_nonce' ); ?>
			<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'reg_name' ) ); ?>"><label for="reg-name"><?php esc_html_e( 'Full name', 'explore-katsina' ); ?></label><input type="text" id="reg-name" name="reg_name" autocomplete="name" required value="<?php echo esc_attr( $v['reg_name'] ?? '' ); ?>"><?php echo View::error( $errors, 'reg_name' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'reg_email' ) ); ?>"><label for="reg-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="reg-email" name="reg_email" autocomplete="email" required value="<?php echo esc_attr( $v['reg_email'] ?? '' ); ?>"><?php echo View::error( $errors, 'reg_email' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'reg_phone' ) ); ?>"><label for="reg-phone"><?php esc_html_e( 'Phone (optional)', 'explore-katsina' ); ?></label><input type="tel" id="reg-phone" name="reg_phone" autocomplete="tel" placeholder="0803 123 4567" value="<?php echo esc_attr( $v['reg_phone'] ?? '' ); ?>"><?php echo View::error( $errors, 'reg_phone' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'reg_password' ) ); ?>"><label for="reg-pass"><?php esc_html_e( 'Password', 'explore-katsina' ); ?></label><input type="password" id="reg-pass" name="reg_password" autocomplete="new-password" minlength="8" required><span class="ek-hint"><?php esc_html_e( 'At least 8 characters.', 'explore-katsina' ); ?></span><?php echo View::error( $errors, 'reg_password' ); // phpcs:ignore ?></div>
			<div><button class="ek-btn ek-btn--block" type="submit"><?php esc_html_e( 'Create account', 'explore-katsina' ); ?></button></div>
		</form>
	</div>
	<p class="ek-small ek-muted"><?php esc_html_e( 'Booked without an account? You can still manage it with the link in your confirmation email.', 'explore-katsina' ); ?></p>
</div>
