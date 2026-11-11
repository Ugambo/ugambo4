<?php
/**
 * Phase 11 checks: the Kadence child theme and brand (palette, fonts, header/footer, menus),
 * colour contrast of the brand pairs (WCAG AA), homepage sections and tabbed search, mobile bottom
 * navigation, the Explore hub, English/Hausa with Polylang (Hausa copies marked "needs translation",
 * hidden from search engines, never machine-translated, links follow the visitor's language), the
 * branded wp-admin colour scheme.
 * Run: wp eval-file ek-tests/phase11-theme.php
 */

use EK\Explore;
use EK\Install;
use EK\Languages;

$GLOBALS['ek_fail'] = 0;
function ek11( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
function ek11_lum( $hex ) {
	$c = array_map( static fn( $x ) => hexdec( $x ) / 255, str_split( ltrim( $hex, '#' ), 2 ) );
	$c = array_map( static fn( $v ) => $v <= 0.03928 ? $v / 12.92 : ( ( $v + 0.055 ) / 1.055 ) ** 2.4, $c );
	return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
}
function ek11_contrast( $a, $b ) {
	$l = array( ek11_lum( $a ), ek11_lum( $b ) );
	return ( max( $l ) + 0.05 ) / ( min( $l ) + 0.05 );
}
function ek11_on( $id ) {
	$GLOBALS['wp_query']     = new WP_Query( array( 'page_id' => $id ) );
	$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
}

WP_CLI::line( 'Theme and brand' );
ek11( 'explore-katsina' === get_stylesheet() && 'kadence' === get_template(), 'Active theme: "Explore Katsina", a child of Kadence (free)' );
$k       = \Kadence\kadence();
$palette = (string) $k->get_palette();
foreach ( array( '#8E1B2C', '#D2A03A', '#141B3A', '#1F6B52', '#FBF7EF', '#1C1A22' ) as $hex ) {
	ek11( false !== stripos( $palette, $hex ), "Brand colour in the theme palette: {$hex}" );
}
ek11( false === stripos( $palette, '#2B6CB0' ), 'No generic travel-site blue left in the palette' );
ek11( false !== strpos( (string) $k->option( 'base_font' )['family'], 'Overpass' ) && false !== strpos( (string) $k->option( 'heading_font' )['family'], 'Unbounded' ), 'Fonts: Overpass (text) and Unbounded (headings), self-hosted' );
ek11( in_array( 'navigation', $k->option( 'header_desktop_items' )['main']['main_right'], true ) && in_array( 'html', $k->option( 'header_desktop_items' )['main']['main_right'], true ), 'Header: menu, language switcher and "List your business" button' );
ek11( false !== strpos( do_shortcode( (string) $k->option( 'header_button_link' ) ), '/list-your-business/' ), 'Header button goes to "List your business"' );

WP_CLI::line( 'Colour contrast (WCAG AA: 4.5 for text, 3 for large text and icons)' );
$pairs = array(
	array( '#1C1A22', '#FBF7EF', 4.5, 'Ink text on ivory page' ),
	array( '#5B5965', '#FBF7EF', 4.5, 'Muted text on ivory' ),
	array( '#5B5965', '#FFFFFF', 4.5, 'Muted text on white cards' ),
	array( '#8E1B2C', '#FFFFFF', 4.5, 'Crimson links on white' ),
	array( '#FFFFFF', '#8E1B2C', 4.5, 'White text on crimson buttons' ),
	array( '#D2A03A', '#141B3A', 4.5, 'Brass on night indigo (logo, active menu, bottom bar)' ),
	array( '#F3EDE1', '#141B3A', 4.5, 'Menu text on night indigo' ),
	array( '#C9CDE0', '#141B3A', 4.5, 'Bottom-bar labels on night indigo' ),
	array( '#141B3A', '#D2A03A', 4.5, 'Night text on brass buttons' ),
	array( '#1F6B52', '#FFFFFF', 4.5, 'Emerald (dates, "open") on white' ),
	array( '#D2A03A', '#141B3A', 3.0, 'Keyboard focus ring (brass) against night' ),
);
foreach ( $pairs as $p ) {
	$r = ek11_contrast( $p[0], $p[1] );
	ek11( $r >= $p[2], sprintf( '%s: %.1f:1', $p[3], $r ) );
}
$css = (string) file_get_contents( get_stylesheet_directory() . '/assets/css/theme.css' );
ek11( false !== strpos( $css, 'prefers-reduced-motion: reduce' ) && false !== strpos( $css, ':focus-visible' ), 'Styles: visible keyboard focus and reduced motion respected' );

WP_CLI::line( 'Menus and footer' );
$loc = get_theme_mod( 'nav_menu_locations' );
$items = array_map( 'wp_specialchars_decode', wp_list_pluck( (array) wp_get_nav_menu_items( $loc['primary'] ?? 0 ), 'title' ) );
foreach ( array( 'Hotels', 'Restaurants', 'Event centres', 'Things to do', 'Festivals & Events', 'Map', 'Plan your trip' ) as $t ) {
	ek11( in_array( $t, $items, true ), "Main menu: {$t}" );
}
ek11( ! empty( $loc['footer'] ) && ! empty( get_option( 'sidebars_widgets' )['footer1'] ), 'Footer menu and footer text set up' );
ekt_setup_content();
ek11( count( (array) wp_get_nav_menu_items( $loc['primary'] ) ) === count( $items ), 'Theme setup is safe to re-run (menu not duplicated)' );

WP_CLI::line( 'Homepage' );
ob_start();
foreach ( ekt_home_sections() as $s ) {
	call_user_func( $s );
}
$home = ob_get_clean();
ek11( 4 === substr_count( $home, 'role="tab"' ) && 1 === substr_count( $home, 'aria-selected="true"' ), 'Hero search with 4 tabs: Hotels, Restaurants, Event centres, Things to do' );
foreach ( array( 'hotels' => 'hotels', 'restaurants' => 'restaurants', 'venues' => 'event_centres', 'todo' => 'things_to_do' ) as $panel => $page ) {
	ek11( (bool) preg_match( '#id="ekt-panel-' . $panel . '"[^>]*action="' . preg_quote( esc_url( Install::page_url( $page ) ), '#' ) . '"#', $home ), "Tab \"{$panel}\" searches the right page" );
}
foreach ( array( 'ekt-near' => 'Near you', 'ekt-attr' => 'Things to do', 'ekt-map' => 'Map preview', 'ekt-events' => 'Upcoming festivals', 'ekt-top' => 'Top-ranked', 'ekt-stories' => 'Stories' ) as $id => $label ) {
	ek11( false !== strpos( $home, 'id="' . $id . '"' ), "Section: {$label}" );
}
ek11( false !== strpos( $home, 'Sallah Durbar' ), 'Upcoming festivals include the Sallah Durbar' );
ek11( false !== strpos( $home, 'List your business' ) && false !== strpos( $home, 'Advertise with us' ), '"List your business" and "Advertise with us" banners' );
ek11( (bool) preg_match( '/data-pins="\[\{/', $home ), 'Map preview carries the real pins' );
ek11( false !== strpos( $home, 'public domain' ), 'Hero photo credited' );

WP_CLI::line( 'Bottom navigation and Explore' );
$nav = ekt_bottom_nav_items();
ek11( array( 'home', 'explore', 'map', 'bookings', 'account' ) === array_keys( $nav ), 'Bottom bar: Home, Explore, Map, Bookings, Account' );
ek11( false !== strpos( $nav['explore'][1], '/explore/' ) && false !== strpos( $nav['bookings'][1], 'tab=bookings' ) && false !== strpos( $nav['map'][1], '/map/' ), 'Bottom bar links: Explore page, my bookings, Katsina Map' );
ek11( (bool) Install::page_id( 'explore' ) && 10 === substr_count( do_shortcode( '[ek_explore]' ), 'ek-explore-tile ' ), 'Explore page with 10 tiles' );

WP_CLI::line( 'English and Hausa (Polylang)' );
ek11( function_exists( 'pll_languages_list' ) && array( 'en', 'ha' ) === pll_languages_list(), 'Languages: English (default) and Hausa' );
$again = Languages::setup();
ek11( ! is_wp_error( $again ) && 0 === $again['copies'] && 0 === $again['languages'], 'Language setup is safe to re-run' );
$ok = true;
$ha_ids = array();
foreach ( Languages::PAGES as $key ) {
	$en = Install::page_id( $key );
	$ha = $en ? (int) pll_get_post( $en, 'ha' ) : 0;
	$ok = $ok && $ha && 'publish' === get_post_status( $ha ) && Languages::needs_translation( $ha ) && 'ha' === pll_get_post_language( $ha );
	$ha_ids[ $key ] = $ha;
}
ek11( $ok, 'Every main page has a Hausa version, marked "Needs Hausa translation"' );
$en_h = get_post( Install::page_id( 'hotels' ) );
$ha_h = get_post( $ha_ids['hotels'] );
ek11( $en_h->post_content === $ha_h->post_content && $en_h->post_title === $ha_h->post_title, 'Hausa versions keep the English text (no machine translation)' );
ek11( ! Languages::needs_translation( $en_h->ID ), 'English pages are not marked' );
$trip_kids = get_pages( array( 'child_of' => $ha_ids['plan_trip'], 'lang' => '' ) );
ek11( 6 === count( $trip_kids ), 'Plan your trip: 6 Hausa sub-pages' );
ek11( 'Needs Hausa translation' === ( Languages::post_state( array(), $ha_h )['ek_needs_translation'] ?? '' ), 'wp-admin Pages list labels them "Needs Hausa translation"' );
ek11_on( $ha_ids['hotels'] );
ek11( ! empty( Languages::robots( array() )['noindex'] ), 'Untranslated Hausa pages are hidden from search engines' );
ek11( Install::is_page( 'hotels' ) && ! Install::is_page( 'map' ), 'Our pages are recognised in both languages' );
ek11_on( $ha_ids['map'] );
ek11( Install::is_page( 'map' ), 'The Hausa map page uses the full-screen map' );
PLL()->curlang = PLL()->model->languages->get( 'ha' );
ek11( false !== strpos( Install::page_url( 'hotels' ), '/ha/' ) && false !== strpos( Install::page_url( 'explore' ), '/ha/' ), 'Links follow the visitor\'s language (Hausa → Hausa pages)' );
$sw = do_shortcode( '[ek_lang_switch]' );
ek11( false !== strpos( $sw, 'hreflang="en"' ) && false !== strpos( $sw, 'hreflang="ha"' ), 'Language switcher: English | Hausa' );
PLL()->curlang = PLL()->model->languages->get( 'en' );
ek11( false === strpos( Install::page_url( 'hotels' ), '/ha/' ), 'English visitors get English pages' );
$ha_menu = get_theme_mod( 'nav_menu_locations' )['primary___ha'] ?? 0;
$ha_links = wp_list_pluck( (array) wp_get_nav_menu_items( $ha_menu ), 'url' );
ek11( $ha_menu && $ha_links && count( array_filter( $ha_links, static fn( $u ) => false !== strpos( $u, '/ha/' ) ) ) >= 7, 'Hausa main menu points to the Hausa pages' );
ek11( (bool) get_option( 'woocommerce_shop_page_id' ) || ! class_exists( 'WooCommerce' ) ? ! pll_get_post( (int) get_option( 'woocommerce_checkout_page_id' ), 'ha' ) : true, 'Shop and checkout stay English-only (owner decision)' );

WP_CLI::line( 'wp-admin' );
wp_set_current_user( 1 );
$saved = get_user_meta( 1, 'admin_color', true );
update_user_meta( 1, 'admin_color', 'modern' );
ek11( Explore::ADMIN_SCHEME === get_user_option( 'admin_color', 1 ), 'wp-admin uses the Durbar Regalia colour scheme by default' );
update_user_meta( 1, 'admin_color', 'ocean' );
ek11( 'ocean' === get_user_option( 'admin_color', 1 ), 'A colour scheme someone picks for themselves is kept' );
update_user_meta( 1, 'admin_color', $saved );
ek11( file_exists( EK_DIR . 'assets/css/admin-colors.css' ) && false !== stripos( (string) file_get_contents( EK_DIR . 'assets/css/admin-colors.css' ), '#141b3a' ), 'Admin colour scheme stylesheet built from WordPress\'s own scheme' );

WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 11 checks passed.' );
