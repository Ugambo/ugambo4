<?php
/**
 * Brand defaults for Kadence: colours, fonts, header, footer. These are *defaults*: anything changed
 * later in Appearance → Customize wins, and nothing is written to the database.
 *
 * Palette (Durbar Regalia):
 *   1 Royal Crimson #8E1B2C (buttons, links) · 2 Crimson dark #6E1422 (hover) · 3 Night Indigo #141B3A
 *   (headings) · 4 Ink #1C1A22 (text) · 5 #3E3B47 · 6 Muted #5B5965 · 7 Sand #F3EDE1 · 8 Ivory #FBF7EF
 *   (page background) · 9 White · 10 Brass #D2A03A · 11 Emerald #1F6B52 (success)
 *
 * @package ExploreKatsinaTheme
 */

defined( 'ABSPATH' ) || exit;

add_filter(
	'kadence_global_palette_defaults',
	static function () {
		$p = array(
			'#8E1B2C', '#6E1422', '#141B3A', '#1C1A22', '#3E3B47', '#5B5965', '#F3EDE1', '#FBF7EF', '#FFFFFF',
			'#D2A03A', '#1F6B52', '#222B52', '#B3261E', '#B07F1C', '#D2A03A',
		);
		$names = array( 'Royal Crimson', 'Crimson Dark', 'Night Indigo', 'Ink', 'Ink Soft', 'Muted', 'Sand', 'Ivory', 'White', 'Brass', 'Emerald (success)', 'Night 2 (info)', 'Alert', 'Warning', 'Rating' );
		$list  = array();
		foreach ( $p as $i => $c ) {
			$list[] = array( 'color' => $c, 'slug' => 'palette' . ( $i + 1 ), 'name' => $names[ $i ] );
		}
		return wp_json_encode( array( 'palette' => $list, 'second-palette' => $list, 'third-palette' => $list, 'active' => 'palette' ) );
	}
);

add_filter(
	'kadence_theme_options_defaults',
	static function ( $d ) {
		$body    = '"Overpass", "Segoe UI", Roboto, Arial, sans-serif';
		$display = '"Unbounded", "Arial Black", "Helvetica Neue", sans-serif';
		$d['base_font']    = array(
			'size'       => array( 'desktop' => 17, 'tablet' => 17, 'mobile' => 16 ),
			'lineHeight' => array( 'desktop' => 1.6 ),
			'family'     => $body,
			'google'     => false,
			'weight'     => '400',
			'variant'    => 'regular',
			'color'      => 'palette4',
		);
		$d['heading_font'] = array( 'family' => $display, 'google' => false );
		$sizes             = array( 1 => array( 40, 30 ), 2 => array( 28, 23 ), 3 => array( 22, 19 ), 4 => array( 19, 17 ), 5 => array( 17, 16 ), 6 => array( 15, 15 ) );
		foreach ( $sizes as $h => $s ) {
			$d[ "h{$h}_font" ] = array(
				'size'       => array( 'desktop' => $s[0], 'mobile' => $s[1] ),
				'lineHeight' => array( 'desktop' => 1.2 ),
				'family'     => 'inherit',
				'google'     => false,
				'weight'     => $h <= 2 ? '700' : '600',
				'variant'    => $h <= 2 ? '700' : '600',
				'color'      => 'palette3',
			);
		}
		$d['load_fonts_local'] = false; // Fonts are self-hosted by the plugin (assets/fonts).

		// Layout.
		$d['content_width']           = array( 'size' => 1240, 'unit' => 'px' );
		$d['site_background']         = array( 'desktop' => array( 'color' => 'palette8' ) );
		$d['content_background']      = array( 'desktop' => array( 'color' => 'palette9' ) );
		$d['buttons_background']      = array( 'color' => 'palette1', 'hover' => 'palette2' );
		$d['buttons_color']           = array( 'color' => 'palette9', 'hover' => 'palette9' );
		$d['buttons_border_radius']   = array( 'size' => array( 'desktop' => 8 ), 'unit' => array( 'desktop' => 'px' ) );
		$d['link_color']              = array( 'highlight' => 'palette1', 'highlight-alt' => 'palette2', 'style' => 'standard' );
		$d['scroll_up']               = false; // The mobile bottom bar takes that corner.

		// Header: logo + menu + language + "List your business" on a night-indigo bar.
		$d['header_desktop_items']        = array(
			'top'    => array( 'top_left' => array(), 'top_left_center' => array(), 'top_center' => array(), 'top_right_center' => array(), 'top_right' => array() ),
			'main'   => array( 'main_left' => array( 'logo' ), 'main_left_center' => array(), 'main_center' => array(), 'main_right_center' => array(), 'main_right' => array( 'navigation', 'html', 'button' ) ),
			'bottom' => array( 'bottom_left' => array(), 'bottom_left_center' => array(), 'bottom_center' => array(), 'bottom_right_center' => array(), 'bottom_right' => array() ),
		);
		$d['header_mobile_items']         = array(
			'popup'  => array( 'popup_content' => array( 'mobile-navigation', 'mobile-html', 'mobile-button' ) ),
			'top'    => array( 'top_left' => array(), 'top_center' => array(), 'top_right' => array() ),
			'main'   => array( 'main_left' => array( 'mobile-logo' ), 'main_center' => array(), 'main_right' => array( 'popup-toggle' ) ),
			'bottom' => array( 'bottom_left' => array(), 'bottom_center' => array(), 'bottom_right' => array() ),
		);
		$d['header_wrap_background']      = array( 'desktop' => array( 'color' => 'palette3' ) );
		$d['header_main_background']      = array( 'desktop' => array( 'color' => 'palette3' ) );
		$d['header_main_height']          = array( 'size' => array( 'mobile' => 60, 'tablet' => 64, 'desktop' => 76 ), 'unit' => array( 'mobile' => 'px', 'tablet' => 'px', 'desktop' => 'px' ) );
		$d['header_sticky']               = 'main';
		$d['mobile_header_sticky']        = 'main';
		$d['header_html_content']         = '[ek_account_link][ek_lang_switch]';
		$d['mobile_html_content']         = '[ek_lang_switch]';
		$d['header_html_wpautop']         = false;
		$d['mobile_html_wpautop']         = false;
		$d['header_button_label']         = __( 'List your business', 'explore-katsina-theme' );
		$d['header_button_link']          = '[ek_page_url key="list_business"]'; // Follows the page's address and language.
		$d['header_button_style']         = 'filled';
		$d['mobile_button_label']         = __( 'List your business', 'explore-katsina-theme' );
		$d['mobile_button_link']          = '[ek_page_url key="list_business"]';
		$d['primary_navigation_color']    = array( 'color' => '#F3EDE1', 'hover' => 'palette10', 'active' => 'palette10' );
		$d['primary_navigation_background'] = array( 'color' => '', 'hover' => '', 'active' => '' );
		$d['header_popup_background']     = array( 'desktop' => array( 'color' => 'palette3' ) );
		$d['mobile_navigation_color']     = array( 'color' => '#F3EDE1', 'hover' => 'palette10', 'active' => 'palette10' );
		$d['mobile_trigger_color']        = array( 'color' => '#F3EDE1', 'hover' => 'palette10' );
		$d['brand_typography']            = array(
			'size'    => array( 'desktop' => 18, 'mobile' => 16 ),
			'family'  => $display,
			'google'  => false,
			'weight'  => '700',
			'variant' => '700',
			'color'   => 'palette10',
		);

		// Footer: three columns on night indigo, then the copyright line.
		$d['footer_items']            = array(
			'top'    => array( 'top_1' => array(), 'top_2' => array(), 'top_3' => array(), 'top_4' => array(), 'top_5' => array() ),
			'middle' => array( 'middle_1' => array( 'footer-widget1' ), 'middle_2' => array( 'footer-navigation' ), 'middle_3' => array( 'footer-widget2' ), 'middle_4' => array( 'footer-widget3' ), 'middle_5' => array() ),
			'bottom' => array( 'bottom_1' => array( 'footer-html' ), 'bottom_2' => array(), 'bottom_3' => array(), 'bottom_4' => array(), 'bottom_5' => array() ),
		);
		$d['footer_middle_columns']   = '4';
		$d['footer_wrap_background']  = array( 'desktop' => array( 'color' => 'palette3' ) );
		$d['footer_middle_background'] = array( 'desktop' => array( 'color' => 'palette3' ) );
		$d['footer_bottom_background'] = array( 'desktop' => array( 'color' => '#0E1430' ) );
		$d['footer_html_content']     = '© {year} Explore Katsina · <a href="mailto:info@explorekatsina.com.ng">info@explorekatsina.com.ng</a> · @explorekatsina';
		$d['footer_navigation_color'] = array( 'color' => '#F3EDE1', 'hover' => 'palette10', 'active' => 'palette10' );
		$d['footer_navigation_stretch'] = false;

		// Titles: pages keep their title, no author/date lines anywhere except stories.
		$d['page_title_elements']        = array( 'title' );
		$d['page_title_layout']          = 'normal';
		$d['post_title_element_meta']    = array_merge( (array) ( $d['post_title_element_meta'] ?? array() ), array( 'enabled' => true, 'author' => false, 'date' => true ) );
		$d['post_title_element_categories'] = array_merge( (array) ( $d['post_title_element_categories'] ?? array() ), array( 'enabled' => true ) );
		$d['post_author_box']            = false;
		$d['post_related']               = true;
		return $d;
	},
	20
);
