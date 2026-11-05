<?php
/**
 * Dashboard: logged-out view.
 */
use EK\Install;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-app">
	<header class="ek-app-top"><div class="ek-app-top-inner"><a class="ek-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>">EXPLORE KATSINA <span><?php esc_html_e( 'Business', 'explore-katsina' ); ?></span></a></div></header>
	<main class="ek-app-main" id="main">
		<div class="ek-card ek-login">
			<h1><?php esc_html_e( 'Business login', 'explore-katsina' ); ?></h1>
			<p class="ek-muted"><?php esc_html_e( 'Manage your listing, bookings, earnings and reviews.', 'explore-katsina' ); ?></p>
			<?php
			wp_login_form(
				array(
					'redirect'       => Install::page_url( 'dashboard' ),
					'label_username' => __( 'Email or username', 'explore-katsina' ),
					'label_log_in'   => __( 'Log in', 'explore-katsina' ),
					'remember'       => true,
				)
			);
			?>
			<p class="ek-small"><a href="<?php echo esc_url( wp_lostpassword_url( Install::page_url( 'dashboard' ) ) ); ?>"><?php esc_html_e( 'Forgot your password?', 'explore-katsina' ); ?></a></p>
			<hr style="border:0;border-top:1px solid var(--ek-line);margin:18px 0">
			<p><?php esc_html_e( 'New to Explore Katsina?', 'explore-katsina' ); ?></p>
			<a class="ek-btn ek-btn--ghost ek-btn--block" href="<?php echo esc_url( Install::page_url( 'list_business' ) ); ?>"><?php esc_html_e( 'List your business (free)', 'explore-katsina' ); ?></a>
		</div>
	</main>
</div>
