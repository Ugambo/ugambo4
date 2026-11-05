<?php
/**
 * Dashboard: trying to open someone else's business.
 */
use EK\Install;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-app">
	<header class="ek-app-top"><div class="ek-app-top-inner"><a class="ek-brand" href="<?php echo esc_url( home_url( '/' ) ); ?>">EXPLORE KATSINA <span><?php esc_html_e( 'Business', 'explore-katsina' ); ?></span></a></div></header>
	<main class="ek-app-main" id="main">
		<div class="ek-card ek-login">
			<h1><?php esc_html_e( 'Not available', 'explore-katsina' ); ?></h1>
			<p><?php esc_html_e( 'You can only open the dashboard of a business you own.', 'explore-katsina' ); ?></p>
			<a class="ek-btn" href="<?php echo esc_url( Install::page_url( 'dashboard' ) ); ?>"><?php esc_html_e( 'Go to my dashboard', 'explore-katsina' ); ?></a>
		</div>
	</main>
</div>
