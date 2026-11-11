<?php
/**
 * Homepage (English and, with Polylang, the Hausa homepage too). Sections: inc/home.php.
 *
 * @package ExploreKatsinaTheme
 */

defined( 'ABSPATH' ) || exit;

get_header();
?>
<div id="primary" class="content-area ekt-home">
	<main id="main" class="site-main">
		<?php
		foreach ( ekt_home_sections() as $section ) {
			if ( is_callable( $section ) ) {
				call_user_func( $section );
			}
		}
		?>
	</main>
</div>
<?php
get_footer();
