<?php
/**
 * Explore Katsina child theme (parent: Kadence, free).
 *  - Brand defaults for Kadence (colours, fonts, header, footer): inc/defaults.php
 *  - Homepage sections: front-page.php + inc/home.php
 *  - Mobile bottom navigation (Home, Explore, Map, Bookings, Account)
 *  - Language switcher [ek_lang_switch] (Polylang, English / Hausa)
 *  - First-time setup of menus and footer text (re-run safe): ekt_setup_content()
 *
 * @package ExploreKatsinaTheme
 */

defined( 'ABSPATH' ) || exit;

define( 'EKT_VERSION', '1.0.0' );
define( 'EKT_DIR', get_stylesheet_directory() . '/' );
define( 'EKT_URL', get_stylesheet_directory_uri() . '/' );

require EKT_DIR . 'inc/defaults.php';
require EKT_DIR . 'inc/home.php';

/** Is our plugin active? The theme still works (plainly) without it. */
function ekt_has_plugin() {
	return class_exists( '\EK\Install' );
}

/** URL of one of the plugin's pages (in the visitor's language when Polylang is on). */
function ekt_page_url( $key ) {
	if ( ! ekt_has_plugin() ) {
		return home_url( '/' );
	}
	return \EK\Install::page_url( $key );
}

function ekt_asset_ver( $rel ) {
	$f = EKT_DIR . $rel;
	return EKT_VERSION . '.' . ( file_exists( $f ) ? filemtime( $f ) : 0 );
}

add_action(
	'wp_enqueue_scripts',
	static function () {
		if ( wp_style_is( 'ek-fonts', 'registered' ) ) {
			wp_enqueue_style( 'ek-fonts' );
		}
		wp_enqueue_style( 'ekt', EKT_URL . 'assets/css/theme.css', array(), ekt_asset_ver( 'assets/css/theme.css' ) );
		if ( is_front_page() ) {
			if ( wp_style_is( 'ek', 'registered' ) ) {
				wp_enqueue_style( 'ek' );
			}
			wp_enqueue_script( 'ekt-home', EKT_URL . 'assets/js/home.js', array(), ekt_asset_ver( 'assets/js/home.js' ), array( 'in_footer' => true, 'strategy' => 'defer' ) );
			wp_localize_script(
				'ekt-home',
				'ektHome',
				array(
					'api'     => esc_url_raw( rest_url( 'ek/v1/map' ) ),
					'mapCfg'  => ekt_has_plugin() ? \EK\Assets::map_config() : array(),
					'leaflet' => array(
						'js'  => ekt_has_plugin() ? EK_URL . 'assets/vendor/leaflet/leaflet.js' : '',
						'css' => ekt_has_plugin() ? EK_URL . 'assets/vendor/leaflet/leaflet.css' : '',
					),
					'i18n'    => array(
						'locating' => __( 'Finding places near you…', 'explore-katsina-theme' ),
						'denied'   => __( 'We could not get your location. You can still browse by LGA or open the Katsina Map.', 'explore-katsina-theme' ),
						'none'     => __( 'Nothing listed within 15 km yet. Try the Katsina Map.', 'explore-katsina-theme' ),
						'error'    => __( 'Something went wrong. Please try again.', 'explore-katsina-theme' ),
						'away'     => __( '%s away', 'explore-katsina-theme' ),
					),
				)
			);
		}
	},
	20
);

/** Preload the two main font files (the plugin self-hosts them). */
add_action(
	'wp_head',
	static function () {
		if ( ! defined( 'EK_URL' ) ) {
			return;
		}
		foreach ( array( 'overpass-latin.woff2', 'unbounded-latin.woff2' ) as $f ) {
			echo '<link rel="preload" href="' . esc_url( EK_URL . 'assets/fonts/' . $f ) . '" as="font" type="font/woff2" crossorigin>' . "\n";
		}
		echo '<meta name="theme-color" content="#141B3A">' . "\n";
	},
	2
);

/* ---------------- Shortcodes used in the header ---------------- */

/** [ek_page_url key="list_business"]: address of one of our pages, used by the header button. */
add_shortcode( 'ek_page_url', static fn( $a ) => esc_url( ekt_page_url( sanitize_key( $a['key'] ?? '' ) ) ) );

/** [ek_lang_switch]: "English | Hausa" links (Polylang). Nothing when Polylang is off. */
add_shortcode(
	'ek_lang_switch',
	static function () {
		if ( ! function_exists( 'pll_the_languages' ) ) {
			return '';
		}
		$langs = pll_the_languages( array( 'raw' => 1, 'hide_if_empty' => 0, 'hide_if_no_translation' => 0 ) );
		if ( ! $langs || count( $langs ) < 2 ) {
			return '';
		}
		$labels = array( 'en' => 'English', 'ha' => 'Hausa' );
		$out    = '<nav class="ekt-lang" aria-label="' . esc_attr__( 'Language', 'explore-katsina-theme' ) . '"><ul>';
		foreach ( $langs as $l ) {
			$label = $labels[ $l['slug'] ] ?? $l['name'];
			$out  .= '<li><a href="' . esc_url( $l['url'] ) . '" hreflang="' . esc_attr( $l['slug'] ) . '" lang="' . esc_attr( $l['slug'] ) . '"' . ( $l['current_lang'] ? ' aria-current="true" class="is-current"' : '' ) . '>' . esc_html( $label ) . '</a></li>';
		}
		return $out . '</ul></nav>';
	}
);

/* ---------------- Mobile bottom navigation ---------------- */

function ekt_bottom_nav_items() {
	$items = array(
		'home'     => array( __( 'Home', 'explore-katsina-theme' ), function_exists( 'pll_home_url' ) ? pll_home_url() : home_url( '/' ), 'M4 11 12 4l8 7v9h-5v-6H9v6H4z' ),
		'explore'  => array( __( 'Explore', 'explore-katsina-theme' ), ekt_page_url( 'explore' ), 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm3.5 5.5-2 5-5 2 2-5z' ),
		'map'      => array( __( 'Map', 'explore-katsina-theme' ), ekt_page_url( 'map' ), 'M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z' ),
		'bookings' => array( __( 'Bookings', 'explore-katsina-theme' ), ekt_has_plugin() ? \EK\Account::url( 'bookings' ) : home_url( '/' ), 'M7 3v2H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2V3h-2v2H9V3zm-1 7h12v9H6zm2 2v2h3v-2z' ),
		'account'  => array( __( 'Account', 'explore-katsina-theme' ), ekt_page_url( 'account' ), 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0 2c-4.4 0-8 2.2-8 5v2h16v-2c0-2.8-3.6-5-8-5z' ),
	);
	return apply_filters( 'ekt_bottom_nav_items', $items );
}

function ekt_bottom_nav_current() {
	if ( is_front_page() ) {
		return 'home';
	}
	if ( ! ekt_has_plugin() || ! is_page() ) {
		return '';
	}
	foreach ( array( 'explore', 'map', 'account' ) as $item ) {
		if ( \EK\Install::is_page( $item ) ) {
			return 'account' === $item && 'bookings' === sanitize_key( wp_unslash( $_GET['tab'] ?? 'bookings' ) ) && is_user_logged_in() ? 'bookings' : $item; // phpcs:ignore WordPress.Security.NonceVerification
		}
	}
	return '';
}

add_action(
	'wp_footer',
	static function () {
		if ( apply_filters( 'ekt_hide_bottom_nav', false ) ) {
			return;
		}
		$current = ekt_bottom_nav_current();
		echo '<nav class="ekt-bottom-nav" aria-label="' . esc_attr__( 'Quick links', 'explore-katsina-theme' ) . '"><ul>';
		foreach ( ekt_bottom_nav_items() as $key => $it ) {
			$is = $key === $current;
			echo '<li><a href="' . esc_url( $it[1] ) . '" data-ekt-nav="' . esc_attr( $key ) . '"' . ( $is ? ' aria-current="page" class="is-current"' : '' ) . '><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="' . esc_attr( $it[2] ) . '" fill="currentColor"/></svg><span>' . esc_html( $it[0] ) . '</span></a></li>';
		}
		echo '</ul></nav>';
	},
	5
);

/** The full-screen map, the business dashboard and ticket check-in have their own navigation. */
add_filter(
	'ekt_hide_bottom_nav',
	static function ( $hide ) {
		if ( ! ekt_has_plugin() || ! is_page() ) {
			return $hide;
		}
		foreach ( array( 'dashboard', 'checkin', 'map' ) as $k ) {
			if ( \EK\Install::is_page( $k ) ) {
				return true;
			}
		}
		return $hide;
	}
);

add_filter( 'body_class', static fn( $c ) => array_merge( $c, array( 'ekt' ), apply_filters( 'ekt_hide_bottom_nav', false ) ? array() : array( 'ekt-has-bottom-nav' ) ) );

/* ---------------- First-time setup (menus, footer text) ---------------- */

/**
 * Creates the header and footer menus and the footer text the first time the theme is switched on
 * (and from `setup.sh`). Never overwrites menus or widgets you have changed.
 */
function ekt_setup_content() {
	if ( ! ekt_has_plugin() ) {
		return;
	}
	$locations = get_theme_mod( 'nav_menu_locations', array() );
	$page      = static fn( $key ) => \EK\Install::page_id( $key );
	$add       = static function ( $menu_id, $title, $page_id, $parent = 0 ) {
		if ( ! $page_id ) {
			return 0;
		}
		return wp_update_nav_menu_item(
			$menu_id,
			0,
			array( 'menu-item-title' => $title, 'menu-item-object' => 'page', 'menu-item-object-id' => $page_id, 'menu-item-type' => 'post_type', 'menu-item-status' => 'publish', 'menu-item-parent-id' => $parent )
		);
	};

	if ( empty( $locations['primary'] ) ) {
		$menu = wp_get_nav_menu_object( 'Main menu' );
		$id   = $menu ? $menu->term_id : wp_create_nav_menu( 'Main menu' );
		if ( ! is_wp_error( $id ) && ! wp_get_nav_menu_items( $id ) ) {
			$add( $id, __( 'Hotels', 'explore-katsina-theme' ), $page( 'hotels' ) );
			$add( $id, __( 'Restaurants', 'explore-katsina-theme' ), $page( 'restaurants' ) );
			$add( $id, __( 'Event centres', 'explore-katsina-theme' ), $page( 'event_centres' ) );
			$add( $id, __( 'Things to do', 'explore-katsina-theme' ), $page( 'things_to_do' ) );
			$add( $id, __( 'Events', 'explore-katsina-theme' ), $page( 'events' ) );
			$add( $id, __( 'Map', 'explore-katsina-theme' ), $page( 'map' ) );
			$trip = $add( $id, __( 'Plan your trip', 'explore-katsina-theme' ), $page( 'plan_trip' ) );
			foreach ( get_pages( array( 'parent' => $page( 'plan_trip' ), 'sort_column' => 'menu_order,ID' ) ) as $child ) {
				$add( $id, $child->post_title, $child->ID, $trip );
			}
		}
		if ( ! is_wp_error( $id ) ) {
			$locations['primary'] = $id;
			$locations['mobile']  = $id;
		}
	}
	if ( empty( $locations['footer'] ) ) {
		$menu = wp_get_nav_menu_object( 'Footer menu' );
		$id   = $menu ? $menu->term_id : wp_create_nav_menu( 'Footer menu' );
		if ( ! is_wp_error( $id ) && ! wp_get_nav_menu_items( $id ) ) {
			foreach ( array( 'tours' => __( 'Tours', 'explore-katsina-theme' ), 'stories' => __( 'Stories', 'explore-katsina-theme' ), 'top_hotels' => __( 'Top 10 hotels', 'explore-katsina-theme' ), 'list_business' => __( 'List your business', 'explore-katsina-theme' ), 'advertise' => __( 'Advertise with us', 'explore-katsina-theme' ), 'agreement' => __( 'Listing & Partner Agreement', 'explore-katsina-theme' ) ) as $k => $t ) {
				$add( $id, $t, $page( $k ) );
			}
		}
		if ( ! is_wp_error( $id ) ) {
			$locations['footer'] = $id;
		}
	}
	set_theme_mod( 'nav_menu_locations', $locations );

	// Footer columns 1 and 3 (Appearance → Widgets). Only filled while still empty.
	$sidebars = get_option( 'sidebars_widgets', array() );
	$blocks   = get_option( 'widget_block', array() );
	$fill     = array(
		'footer1' => '<!-- wp:html --><p class="ekt-foot-brand">Explore Katsina</p><p>' . esc_html__( 'Hotels, restaurants, event centres, festivals and things to do across Katsina State, with honest rankings from verified guests.', 'explore-katsina-theme' ) . '</p><!-- /wp:html -->',
		'footer2' => '<!-- wp:html --><p><strong>' . esc_html__( 'Contact (placeholder)', 'explore-katsina-theme' ) . '</strong></p><p><a href="mailto:info@explorekatsina.com.ng">info@explorekatsina.com.ng</a><br>+234 800 000 0000<br>@explorekatsina</p><!-- /wp:html -->',
	);
	foreach ( $fill as $sidebar => $html ) {
		if ( ! empty( $sidebars[ $sidebar ] ) ) {
			continue;
		}
		$n                    = max( array_merge( array( 1 ), array_filter( array_keys( $blocks ), 'is_int' ) ) ) + 1;
		$blocks[ $n ]         = array( 'content' => $html );
		$sidebars[ $sidebar ] = array( 'block-' . $n );
	}
	$blocks['_multiwidget'] = 1;
	update_option( 'widget_block', $blocks );
	update_option( 'sidebars_widgets', $sidebars );
}
add_action( 'after_switch_theme', 'ekt_setup_content' );
