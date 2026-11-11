<?php
/**
 * Phase 13 pages: Home, Directory, Pricing, Guides, About, two FAQs and the legal drafts (Booking &
 * Cancellation, Refunds, Review Guidelines, Privacy (NDPA 2023), Terms). Text lives in
 * content/pages/*.html; legal pages carry a "DRAFT – for legal review" notice. Links between pages are
 * written as {{url:key}} and filled in when the page is created.
 *
 * Shortcodes: [ek_directory] (every listed business, by category and LGA), [ek_pricing] (plans,
 * commission, Verified, setup: all from Settings), [ek_guides] (digital guides from the shop),
 * [ek_legal_links] (footer line).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Pages {

	/** page key => [title, slug, content file or shortcode]. Legal pages are marked. */
	public static function list() {
		return array(
			'home'              => array( __( 'Home', 'explore-katsina' ), 'home', '' ),
			'directory'         => array( __( 'Directory', 'explore-katsina' ), 'directory', '[ek_directory]' ),
			'pricing'           => array( __( 'Pricing for businesses', 'explore-katsina' ), 'pricing', '[ek_pricing]' ),
			'guides'            => array( __( 'Guides & maps', 'explore-katsina' ), 'guides', '[ek_guides]' ),
			'about'             => array( __( 'About Explore Katsina', 'explore-katsina' ), 'about', 'about' ),
			'faq_travellers'    => array( __( 'FAQ for travellers', 'explore-katsina' ), 'faq-travellers', 'faq-travellers' ),
			'faq_businesses'    => array( __( 'FAQ for businesses', 'explore-katsina' ), 'faq-businesses', 'faq-businesses' ),
			'booking_policy'    => array( __( 'Booking & Cancellation Policy', 'explore-katsina' ), 'booking-cancellation-policy', 'booking-cancellation-policy' ),
			'refund_policy'     => array( __( 'Refund Policy', 'explore-katsina' ), 'refund-policy', 'refund-policy' ),
			'review_guidelines' => array( __( 'Review Guidelines', 'explore-katsina' ), 'review-guidelines', 'review-guidelines' ),
			'privacy'           => array( __( 'Privacy Policy', 'explore-katsina' ), 'privacy-policy', 'privacy-policy' ),
			'terms'             => array( __( 'Terms of Use', 'explore-katsina' ), 'terms-of-use', 'terms-of-use' ),
		);
	}

	const LEGAL = array( 'booking_policy', 'refund_policy', 'review_guidelines', 'privacy', 'terms' );

	public static function init() {
		add_shortcode( 'ek_directory', array( __CLASS__, 'directory' ) );
		add_shortcode( 'ek_pricing', array( __CLASS__, 'pricing' ) );
		add_shortcode( 'ek_guides', array( __CLASS__, 'guides' ) );
		add_shortcode( 'ek_legal_links', array( __CLASS__, 'legal_links' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'styles' ) );
	}

	/** Page definitions for Install::add_pages(). */
	public static function definitions() {
		$out = array();
		foreach ( self::list() as $key => $p ) {
			$content = $p[2];
			if ( $content && '[' !== $content[0] ) {
				$content = (string) file_get_contents( EK_DIR . 'content/pages/' . $content . '.html' );
				$content = str_replace( '{{legal_notice}}', (string) file_get_contents( EK_DIR . 'content/pages/_legal-notice.html' ), $content );
			} elseif ( $content ) {
				$content = '<!-- wp:shortcode -->' . $content . '<!-- /wp:shortcode -->';
			}
			$out[ $key ] = array( 'title' => $p[0], 'slug' => $p[1], 'content' => $content );
		}
		return $out;
	}

	/** {{url:key}} → the page's address (our pages, plus a few guide pages). */
	public static function resolve_links( $html ) {
		return preg_replace_callback(
			'/\{\{url:([a-z_]+)\}\}/',
			static function ( $m ) {
				if ( 'safety' === $m[1] ) {
					$p = get_page_by_path( 'plan-your-trip/safety-and-travel-tips' );
					return esc_url( $p ? get_permalink( $p ) : home_url( '/plan-your-trip/' ) );
				}
				return esc_url( Install::page_url( $m[1] ) );
			},
			(string) $html
		);
	}

	/** After pages are created: fill in links, make Home the front page, the privacy page WordPress's own. */
	public static function after_install() {
		// WordPress makes its own sample "Privacy Policy" page (a draft of "Suggested text: …") at the same
		// address. Replace that template, and only that, with our NDPA draft.
		$priv = Install::page_id( 'privacy' );
		if ( $priv && false !== strpos( (string) get_post_field( 'post_content', $priv ), 'Suggested text:' ) ) {
			$def = self::definitions()['privacy'];
			wp_update_post( array( 'ID' => $priv, 'post_title' => $def['title'], 'post_content' => $def['content'], 'post_status' => 'publish' ) );
		}
		foreach ( array_keys( self::list() ) as $key ) {
			$id = Install::page_id( $key );
			if ( $id && false !== strpos( (string) get_post_field( 'post_content', $id ), '{{url:' ) ) {
				wp_update_post( array( 'ID' => $id, 'post_content' => self::resolve_links( get_post_field( 'post_content', $id ) ) ) );
			}
		}
		$home = Install::page_id( 'home' );
		if ( $home && 'page' !== get_option( 'show_on_front' ) ) {
			update_option( 'show_on_front', 'page' );
			update_option( 'page_on_front', $home );
		}
		if ( Install::page_id( 'privacy' ) ) {
			update_option( 'wp_page_for_privacy_policy', Install::page_id( 'privacy' ) );
		}
		$events = Install::page_id( 'events' );
		if ( $events && 'Events' === get_the_title( $events ) ) {
			wp_update_post( array( 'ID' => $events, 'post_title' => __( 'Festivals & Events', 'explore-katsina' ) ) );
		}
	}

	public static function styles() {
		if ( ! is_page() ) {
			return;
		}
		foreach ( array_keys( self::list() ) as $key ) {
			if ( Install::is_page( $key ) ) {
				wp_enqueue_style( 'ek' );
				return;
			}
		}
	}

	/* ---------------- Directory ---------------- */

	public static function directory() {
		wp_enqueue_style( 'ek' );
		$types = Business::types();
		$type  = isset( $_GET['type'], $types[ sanitize_key( wp_unslash( $_GET['type'] ) ) ] ) ? sanitize_key( wp_unslash( $_GET['type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$lga   = absint( $_GET['lga'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification
		$q     = sanitize_text_field( wp_unslash( $_GET['q'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
		$res   = Map_Index::query( array( 'types' => $type ? array( $type ) : array_keys( $types ), 'lga' => $lga, 'limit' => 600 ) );
		$pins  = array_values( array_filter( $res['pins'], static fn( $p ) => 'business' === $p['kind'] && ( '' === $q || false !== stripos( $p['title'], $q ) ) ) );
		usort( $pins, static fn( $a, $b ) => strcasecmp( $a['title'], $b['title'] ) );
		$groups = array();
		foreach ( $pins as $p ) {
			$groups[ $p['type'] ][] = $p;
		}
		return View::render( 'public/directory', array( 'groups' => $groups, 'types' => $types, 'type' => $type, 'lga' => $lga, 'q' => $q, 'total' => count( $pins ) ) );
	}

	/* ---------------- Pricing ---------------- */

	public static function pricing() {
		wp_enqueue_style( 'ek' );
		return View::render( 'public/pricing', array() );
	}

	/* ---------------- Guides ---------------- */

	public static function guides() {
		wp_enqueue_style( 'ek' );
		$intro = '<p class="ek-muted">' . esc_html__( 'Printable and phone-friendly guides and maps to Katsina State, delivered instantly as a download after payment.', 'explore-katsina' ) . '</p>';
		if ( ! shortcode_exists( 'products' ) ) {
			return '<div class="ek">' . $intro . '<p>' . esc_html__( 'Guides are coming soon.', 'explore-katsina' ) . '</p></div>';
		}
		$list = do_shortcode( '[products category="guides" columns="3" limit="12"]' );
		if ( false === strpos( $list, 'product' ) ) {
			$list = '<p>' . esc_html__( 'Guides are coming soon.', 'explore-katsina' ) . '</p>';
		}
		return '<div class="ek ek-guides">' . $intro . '</div>' . $list;
	}

	/* ---------------- Footer ---------------- */

	public static function legal_links() {
		$links = array();
		foreach ( array( 'about', 'faq_travellers', 'faq_businesses', 'pricing', 'booking_policy', 'refund_policy', 'review_guidelines', 'privacy', 'terms', 'agreement' ) as $key ) {
			$id = Install::page_id( $key );
			if ( $id ) {
				$links[] = '<a href="' . esc_url( Install::page_url( $key ) ) . '">' . esc_html( get_the_title( Languages::translated( $id ) ) ) . '</a>';
			}
		}
		return '<nav class="ek-legal-links" aria-label="' . esc_attr__( 'Help and policies', 'explore-katsina' ) . '">' . implode( ' · ', $links ) . '</nav>';
	}
}
