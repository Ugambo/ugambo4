<?php
/**
 * Full-screen layout for the Katsina Map page (replaces the theme on this page only).
 */
defined( 'ABSPATH' ) || exit;
?><!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
	<meta name="theme-color" content="#141B3A">
	<?php wp_head(); ?>
</head>
<body <?php body_class( 'ek-kmap-body' ); ?>>
<?php wp_body_open(); ?>
<?php
while ( have_posts() ) :
	the_post();
	echo do_shortcode( get_the_content() ); // phpcs:ignore WordPress.Security.EscapeOutput
endwhile;
?>
<?php wp_footer(); ?>
</body>
</html>
