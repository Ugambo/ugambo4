<?php
/**
 * English / Hausa with Polylang (free). Owner decision (Phase 11): the shop and checkout stay
 * English-only at launch (no paid "Polylang for WooCommerce").
 *
 *  - `wp ek languages` (run by setup.sh) creates English (default, normal addresses) and Hausa
 *    (addresses start with /ha/), puts existing content in English, and creates a Hausa copy of each
 *    main visitor page. Re-run safe.
 *  - Hausa copies are **not machine-translated**: they hold the English text, are marked
 *    "Needs Hausa translation" (a tick box on the page and a label in the Pages list), show visitors a
 *    short notice, and are hidden from search engines until a translator unticks the box.
 *  - Listings, attractions, events and tours are shown in both languages (not duplicated), so the map,
 *    rankings and bookings stay single and accurate.
 *  - Links to our pages (Install::page_url) follow the visitor's language.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Languages {

	const META = '_ek_needs_translation';

	/** Pages that get a Hausa copy (keys from Install's page list; plan_trip includes its sub-pages). */
	const PAGES = array( 'explore', 'hotels', 'restaurants', 'event_centres', 'things_to_do', 'events', 'tours', 'map', 'stories', 'top_hotels', 'top_restaurants', 'top_event_centres', 'plan_trip', 'list_business', 'advertise', 'contact', 'home', 'directory', 'pricing', 'guides', 'about', 'faq_travellers', 'faq_businesses', 'booking_policy', 'refund_policy', 'review_guidelines', 'privacy', 'terms' );

	public static function active() {
		return function_exists( 'pll_get_post' ) && function_exists( 'PLL' );
	}

	public static function init() {
		add_filter( 'wp_robots', array( __CLASS__, 'robots' ) );
		add_filter( 'the_content', array( __CLASS__, 'notice' ), 1 );
		add_filter( 'display_post_states', array( __CLASS__, 'post_state' ), 10, 2 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'meta_box' ) );
		add_action( 'save_post', array( __CLASS__, 'save' ), 10, 2 );
	}

	/** Translation of a post in the visitor's language (or the post itself). */
	public static function translated( $post_id ) {
		if ( ! $post_id || ! self::active() ) {
			return (int) $post_id;
		}
		$t = pll_get_post( (int) $post_id );
		return $t ? (int) $t : (int) $post_id;
	}

	public static function needs_translation( $post_id ) {
		return (bool) get_post_meta( (int) $post_id, self::META, true );
	}

	/* ---------------- Visitors ---------------- */

	public static function robots( $robots ) {
		if ( is_singular() && self::needs_translation( get_queried_object_id() ) ) {
			$robots['noindex'] = true;
			$robots['follow']  = true;
		}
		return $robots;
	}

	public static function notice( $content ) {
		if ( ! is_singular() || ! in_the_loop() || ! is_main_query() || ! self::needs_translation( get_the_ID() ) ) {
			return $content;
		}
		wp_enqueue_style( 'ek' );
		$msg = apply_filters( 'ek_needs_translation_notice', __( 'This page has not been translated into Hausa yet, so it is shown in English.', 'explore-katsina' ) );
		return '<p class="ek ek-notice ek-notice--info ek-needs-translation" lang="en" role="note">' . esc_html( $msg ) . '</p>' . $content;
	}

	/* ---------------- wp-admin ---------------- */

	public static function post_state( $states, $post ) {
		if ( self::needs_translation( $post->ID ) ) {
			$states['ek_needs_translation'] = __( 'Needs Hausa translation', 'explore-katsina' );
		}
		return $states;
	}

	public static function meta_box() {
		foreach ( array( 'page', 'post' ) as $type ) {
			add_meta_box( 'ek-translation', __( 'Translation', 'explore-katsina' ), array( __CLASS__, 'render_box' ), $type, 'side' );
		}
	}

	public static function render_box( $post ) {
		wp_nonce_field( 'ek_translation', 'ek_translation_nonce' );
		echo '<p><label><input type="checkbox" name="ek_needs_translation" value="1" ' . checked( self::needs_translation( $post->ID ), true, false ) . '> ' . esc_html__( 'Needs Hausa translation', 'explore-katsina' ) . '</label></p>';
		echo '<p class="description">' . esc_html__( 'While ticked, visitors see a note that the page is in English, and search engines skip it. Untick once a fluent Hausa writer has translated it. Please do not use machine translation.', 'explore-katsina' ) . '</p>';
	}

	public static function save( $id, $post ) {
		if ( ! isset( $_POST['ek_translation_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ek_translation_nonce'] ) ), 'ek_translation' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
			return;
		}
		if ( empty( $_POST['ek_needs_translation'] ) ) {
			delete_post_meta( $id, self::META );
		} else {
			update_post_meta( $id, self::META, 1 );
		}
	}

	/* ---------------- Setup (wp ek languages) ---------------- */

	/** @return array|\WP_Error What was done. */
	public static function setup() {
		if ( ! self::active() ) {
			return new \WP_Error( 'polylang', 'Polylang is not active.' );
		}
		$model = PLL()->model;
		$out   = array( 'languages' => 0, 'copies' => 0, 'menus' => 0 );
		foreach ( array( array( 'locale' => 'en_US', 'slug' => 'en', 'name' => 'English', 'term_group' => 0, 'flag' => 'gb' ), array( 'locale' => 'hau', 'slug' => 'ha', 'name' => 'Hausa', 'term_group' => 1, 'flag' => 'ng' ) ) as $l ) {
			if ( ! $model->languages->get( $l['slug'] ) ) {
				$r = $model->languages->add( $l );
				if ( is_wp_error( $r ) ) {
					return $r;
				}
				$out['languages']++;
			}
		}
		$model->clean_languages_cache();
		$opts = get_option( 'polylang' );
		if ( 'en' !== ( $opts['default_lang'] ?? '' ) ) {
			$opts['default_lang'] = 'en';
			update_option( 'polylang', $opts );
		}

		// Everything that has no language yet is English.
		$model->set_language_in_mass();

		// Hausa copies of the main pages (and the Plan your trip sub-pages).
		$keys = array();
		foreach ( self::PAGES as $k ) {
			$id = Install::page_id( $k );
			if ( ! $id ) {
				continue;
			}
			$keys[] = $id;
			if ( 'plan_trip' === $k ) {
				foreach ( get_pages( array( 'child_of' => $id, 'post_status' => 'publish', 'lang' => '' ) ) as $child ) {
					$keys[] = (int) $child->ID;
				}
			}
		}
		foreach ( $keys as $en ) {
			if ( self::hausa_copy( $en ) ) {
				$out['copies']++;
			}
		}
		$out['menus'] = self::hausa_menus();
		flush_rewrite_rules( false );
		return $out;
	}

	/** Create the Hausa copy of an English page (once). Returns true when created. */
	public static function hausa_copy( $en_id ) {
		$en = get_post( $en_id );
		if ( ! $en || pll_get_post( $en_id, 'ha' ) ) {
			return false;
		}
		if ( ! pll_get_post_language( $en_id ) ) {
			pll_set_post_language( $en_id, 'en' );
		}
		$parent = $en->post_parent ? (int) pll_get_post( $en->post_parent, 'ha' ) : 0;
		$id     = wp_insert_post(
			wp_slash(
				array(
					'post_type'    => $en->post_type,
					'post_status'  => 'publish',
					'post_title'   => $en->post_title,
					'post_name'    => $en->post_name . '-ha',
					'post_content' => $en->post_content,
					'post_excerpt' => $en->post_excerpt,
					'post_parent'  => $parent,
					'menu_order'   => $en->menu_order,
				)
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return false;
		}
		update_post_meta( $id, self::META, 1 );
		pll_set_post_language( $id, 'ha' );
		pll_save_post_translations( array( 'en' => (int) $en_id, 'ha' => (int) $id ) );
		return true;
	}

	/** Hausa versions of the theme's menus, pointing at the Hausa pages. Returns how many were made. */
	public static function hausa_menus() {
		$locations = get_theme_mod( 'nav_menu_locations', array() );
		$made      = 0;
		foreach ( array( 'primary', 'mobile', 'footer' ) as $loc ) {
			$en_menu = (int) ( $locations[ $loc ] ?? 0 );
			$ha_loc  = $loc . '___ha';
			if ( ! $en_menu || ! empty( $locations[ $ha_loc ] ) ) {
				continue;
			}
			$en_obj = wp_get_nav_menu_object( $en_menu );
			$name   = $en_obj->name . ' (Hausa)';
			$exist  = wp_get_nav_menu_object( $name );
			$ha     = $exist ? $exist->term_id : wp_create_nav_menu( $name );
			if ( is_wp_error( $ha ) ) {
				continue;
			}
			if ( ! $exist ) {
				$map = array();
				foreach ( (array) wp_get_nav_menu_items( $en_menu ) as $item ) {
					$obj      = 'post_type' === $item->type ? (int) pll_get_post( (int) $item->object_id, 'ha' ) : 0;
					$args     = array(
						'menu-item-title'     => $item->title,
						'menu-item-status'    => 'publish',
						'menu-item-parent-id' => $map[ (int) $item->menu_item_parent ] ?? 0,
					);
					$args     = $obj ? $args + array( 'menu-item-object' => $item->object, 'menu-item-object-id' => $obj, 'menu-item-type' => 'post_type' ) : $args + array( 'menu-item-type' => 'custom', 'menu-item-url' => $item->url );
					$map[ (int) $item->ID ] = wp_update_nav_menu_item( $ha, 0, $args );
				}
			}
			$locations[ $ha_loc ] = $ha;
			$made++;
		}
		set_theme_mod( 'nav_menu_locations', $locations );
		// Polylang keeps its own record of which menu goes where per language.
		$opts  = get_option( 'polylang' );
		$theme = get_option( 'stylesheet' );
		foreach ( array( 'primary', 'mobile', 'footer' ) as $loc ) {
			if ( ! empty( $locations[ $loc ] ) ) {
				$opts['nav_menus'][ $theme ][ $loc ]['en'] = (int) $locations[ $loc ];
			}
			if ( ! empty( $locations[ $loc . '___ha' ] ) ) {
				$opts['nav_menus'][ $theme ][ $loc ]['ha'] = (int) $locations[ $loc . '___ha' ];
			}
		}
		update_option( 'polylang', $opts );
		return $made;
	}
}
