<?php
/**
 * Dashboard: logged in, no business yet.
 */
use EK\Install;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-app">
	<header class="ek-app-top"><div class="ek-app-top-inner"><a class="ek-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>">EXPLORE KATSINA <span><?php esc_html_e( 'Business', 'explore-katsina' ); ?></span></a><div class="ek-top-actions"><a href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>"><?php esc_html_e( 'Log out', 'explore-katsina' ); ?></a></div></div></header>
	<main class="ek-app-main" id="main">
		<div class="ek-card ek-login">
			<h1><?php esc_html_e( 'You have no business listed yet', 'explore-katsina' ); ?></h1>
			<p><?php esc_html_e( 'List your hotel, restaurant, event centre or shop to start receiving visitors.', 'explore-katsina' ); ?></p>
			<a class="ek-btn ek-btn--block" href="<?php echo esc_url( Install::page_url( 'list_business' ) ); ?>"><?php esc_html_e( 'List your business', 'explore-katsina' ); ?></a>
		</div>
	</main>
</div>
