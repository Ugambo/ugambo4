<?php
/**
 * Banner ads (built in, no paid plugin): zones on the homepage, search results, the Katsina Map,
 * the sidebar and inside articles. Each ad has an image, a link, start/end dates and daily view and
 * click counts. Clicks go through /?ek_ad=ID so they can be counted (links are marked "sponsored").
 *
 * Google AdSense: placeholder slots that stay OFF until you add your publisher code in Settings.
 * When on, a zone with no booked banner shows the AdSense unit instead.
 *
 * Sponsored content: tick "Sponsored" on a post to show a clear "Sponsored" label (and the sponsor's
 * name), and mark its links rel="sponsored".
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Ads {

	private static $shown = array();

	public static function zones() {
		return array(
			'home'    => __( 'Homepage', 'explore-katsina' ),
			'search'  => __( 'Search results (hotels, restaurants, event centres)', 'explore-katsina' ),
			'map'     => __( 'Katsina Map (list panel)', 'explore-katsina' ),
			'sidebar' => __( 'Sidebar', 'explore-katsina' ),
			'article' => __( 'Inside articles', 'explore-katsina' ),
		);
	}

	public static function init() {
		add_shortcode( 'ek_ad', static fn( $a ) => self::zone( shortcode_atts( array( 'zone' => 'sidebar' ), $a )['zone'] ) );
		add_action( 'template_redirect', array( __CLASS__, 'click' ), 1 );
		add_filter( 'the_content', array( __CLASS__, 'in_article' ), 20 );
		add_filter( 'the_content', array( __CLASS__, 'sponsored_label' ), 5 );
		add_action( 'init', array( __CLASS__, 'register_meta' ) );
		add_action( 'add_meta_boxes', array( __CLASS__, 'sponsored_box' ) );
		add_action( 'save_post_post', array( __CLASS__, 'save_sponsored' ) );
		add_action( 'wp_head', array( __CLASS__, 'adsense_script' ) );
	}

	public static function get( $id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_ads WHERE id = %d", $id ) );
	}

	public static function all() {
		global $wpdb;
		return $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}ek_ads ORDER BY id DESC" );
	}

	/** @return int|\WP_Error */
	public static function save( array $in, $id = 0 ) {
		global $wpdb;
		$zone = sanitize_key( $in['zone'] ?? '' );
		$url  = View::valid_url( $in['link_url'] ?? '' );
		if ( '' === trim( (string) ( $in['title'] ?? '' ) ) || ! isset( self::zones()[ $zone ] ) || ! absint( $in['image_id'] ?? 0 ) || ! View::valid_url( $url ) ) {
			return new \WP_Error( 'fields', __( 'An ad needs a name, a zone, an image and a valid link (https://…).', 'explore-katsina' ) );
		}
		$row = array(
			'title'      => mb_substr( sanitize_text_field( $in['title'] ), 0, 190 ),
			'advertiser' => mb_substr( sanitize_text_field( $in['advertiser'] ?? '' ), 0, 190 ),
			'zone'       => $zone,
			'image_id'   => absint( $in['image_id'] ),
			'link_url'   => $url,
			'alt_text'   => mb_substr( sanitize_text_field( $in['alt_text'] ?? '' ), 0, 190 ),
			'starts_on'  => Availability::valid_date( $in['starts_on'] ?? '' ) ? $in['starts_on'] : null,
			'ends_on'    => Availability::valid_date( $in['ends_on'] ?? '' ) ? $in['ends_on'] : null,
			'active'     => empty( $in['active'] ) ? 0 : 1,
		);
		if ( $id ) {
			$wpdb->update( $wpdb->prefix . 'ek_ads', $row, array( 'id' => (int) $id ) );
		} else {
			$wpdb->insert( $wpdb->prefix . 'ek_ads', $row + array( 'created_at' => current_time( 'mysql', true ) ) );
			$id = (int) $wpdb->insert_id;
		}
		return (int) $id;
	}

	/** Ads that may show in a zone today. */
	public static function live( $zone ) {
		global $wpdb;
		$today = Availability::today();
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_ads WHERE zone = %s AND active = 1 AND (starts_on IS NULL OR starts_on <= %s) AND (ends_on IS NULL OR ends_on >= %s)", $zone, $today, $today ) );
	}

	private static function bump( $ad_id, $col ) {
		global $wpdb;
		$col = 'clicks' === $col ? 'clicks' : 'views';
		$wpdb->query( $wpdb->prepare( "INSERT INTO {$wpdb->prefix}ek_ad_stats (ad_id, day, {$col}) VALUES (%d, %s, 1) ON DUPLICATE KEY UPDATE {$col} = {$col} + 1", $ad_id, Availability::today() ) ); // phpcs:ignore
	}

	public static function stats( $ad_id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT COALESCE(SUM(views),0) views, COALESCE(SUM(clicks),0) clicks FROM {$wpdb->prefix}ek_ad_stats WHERE ad_id = %d", $ad_id ) );
	}

	/** One banner for a zone (rotates between booked ads), or the AdSense slot, or nothing. */
	public static function zone( $zone ) {
		if ( ! isset( self::zones()[ $zone ] ) ) {
			return '';
		}
		$ads = array_filter( self::live( $zone ), static fn( $a ) => ! in_array( (int) $a->id, self::$shown, true ) );
		if ( $ads ) {
			$ad             = $ads[ array_rand( $ads ) ];
			self::$shown[]  = (int) $ad->id;
			do_action( 'ek_ad_shown', (int) $ad->id ); // Not cached, so each view is counted.
			$is_bot         = (bool) preg_match( '/bot|crawl|spider|slurp|headless/i', (string) ( $_SERVER['HTTP_USER_AGENT'] ?? '' ) ); // phpcs:ignore
			if ( ! $is_bot ) {
				self::bump( $ad->id, 'views' );
			}
			wp_enqueue_style( 'ek' );
			$img = wp_get_attachment_image( (int) $ad->image_id, 'large', false, array( 'alt' => $ad->alt_text ? $ad->alt_text : $ad->title, 'loading' => 'lazy' ) );
			return '<aside class="ek ek-ad ek-ad--' . esc_attr( $zone ) . '" aria-label="' . esc_attr__( 'Advertisement', 'explore-katsina' ) . '"><span class="ek-ad-label">' . esc_html__( 'Advertisement', 'explore-katsina' ) . '</span><a href="' . esc_url( add_query_arg( 'ek_ad', (int) $ad->id, home_url( '/' ) ) ) . '" rel="sponsored nofollow noopener" target="_blank">' . $img . '</a></aside>';
		}
		return self::adsense( $zone );
	}

	/** /?ek_ad=ID → count the click → go to the advertiser. */
	public static function click() {
		if ( empty( $_GET['ek_ad'] ) ) { // phpcs:ignore
			return;
		}
		$ad = self::get( absint( $_GET['ek_ad'] ) ); // phpcs:ignore
		if ( ! $ad || ! $ad->active ) {
			wp_safe_redirect( home_url( '/' ) );
			exit;
		}
		self::bump( $ad->id, 'clicks' );
		wp_redirect( $ad->link_url, 302, 'Explore Katsina' ); // phpcs:ignore WordPress.Security.SafeRedirect -- advertiser link set by admin.
		exit;
	}

	/** Articles: one banner after the second paragraph. */
	public static function in_article( $content ) {
		if ( ! is_singular( 'post' ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$ad = self::zone( 'article' );
		if ( ! $ad ) {
			return $content;
		}
		$parts = explode( '</p>', $content );
		if ( count( $parts ) < 3 ) {
			return $content . $ad;
		}
		$parts[1] .= '</p>' . $ad;
		return implode( '</p>', $parts );
	}

	/* ---------------- AdSense (off by default) ---------------- */

	public static function adsense_on() {
		return (bool) Settings::get( 'adsense_enabled' ) && preg_match( '/^ca-pub-\d{10,20}$/', (string) Settings::get( 'adsense_client' ) );
	}

	public static function adsense_script() {
		if ( self::adsense_on() ) {
			echo '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' . esc_attr( Settings::get( 'adsense_client' ) ) . '" crossorigin="anonymous"></script>' . "\n"; // phpcs:ignore WordPress.WP.EnqueuedResources
		}
	}

	private static function adsense( $zone ) {
		$slot = (string) ( ( (array) Settings::get( 'adsense_slots' ) )[ $zone ] ?? '' );
		if ( ! self::adsense_on() || ! preg_match( '/^\d{5,20}$/', $slot ) ) {
			return '';
		}
		return '<aside class="ek ek-ad ek-ad--' . esc_attr( $zone ) . '" aria-label="' . esc_attr__( 'Advertisement', 'explore-katsina' ) . '"><span class="ek-ad-label">' . esc_html__( 'Advertisement', 'explore-katsina' ) . '</span><ins class="adsbygoogle" style="display:block" data-ad-client="' . esc_attr( Settings::get( 'adsense_client' ) ) . '" data-ad-slot="' . esc_attr( $slot ) . '" data-ad-format="auto" data-full-width-responsive="true"></ins><script>(adsbygoogle=window.adsbygoogle||[]).push({});</script></aside>';
	}

	/* ---------------- Sponsored articles ---------------- */

	public static function register_meta() {
		register_post_meta( 'post', '_ek_sponsored', array( 'type' => 'boolean', 'single' => true, 'show_in_rest' => false ) );
		register_post_meta( 'post', '_ek_sponsor', array( 'type' => 'string', 'single' => true, 'show_in_rest' => false ) );
	}

	public static function sponsored_box() {
		add_meta_box( 'ek-sponsored', __( 'Sponsored content', 'explore-katsina' ), array( __CLASS__, 'render_sponsored' ), 'post', 'side' );
	}

	public static function render_sponsored( $post ) {
		wp_nonce_field( 'ek_sponsored', 'ek_sponsored_nonce' );
		echo '<p><label><input type="checkbox" name="ek_sponsored" value="1" ' . checked( (bool) get_post_meta( $post->ID, '_ek_sponsored', true ), true, false ) . '> ' . esc_html__( 'This article is paid for (shows a "Sponsored" label)', 'explore-katsina' ) . '</label></p>';
		echo '<p><label>' . esc_html__( 'Sponsor name', 'explore-katsina' ) . '<br><input type="text" name="ek_sponsor" class="widefat" value="' . esc_attr( get_post_meta( $post->ID, '_ek_sponsor', true ) ) . '"></label></p>';
	}

	public static function save_sponsored( $id ) {
		if ( ! isset( $_POST['ek_sponsored_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ek_sponsored_nonce'] ) ), 'ek_sponsored' ) || ! current_user_can( 'edit_post', $id ) ) {
			return;
		}
		update_post_meta( $id, '_ek_sponsored', empty( $_POST['ek_sponsored'] ) ? 0 : 1 );
		update_post_meta( $id, '_ek_sponsor', sanitize_text_field( wp_unslash( $_POST['ek_sponsor'] ?? '' ) ) );
	}

	public static function is_sponsored( $post_id ) {
		return (bool) get_post_meta( $post_id, '_ek_sponsored', true );
	}

	/** Clear label at the top of sponsored articles; their links are marked rel="sponsored". */
	public static function sponsored_label( $content ) {
		$id = get_the_ID();
		if ( ! $id || 'post' !== get_post_type( $id ) || ! self::is_sponsored( $id ) ) {
			return $content;
		}
		wp_enqueue_style( 'ek' );
		$by      = (string) get_post_meta( $id, '_ek_sponsor', true );
		$label   = '<p class="ek ek-sponsored-label"><span class="ek-badge ek-badge--sponsored">' . esc_html__( 'Sponsored', 'explore-katsina' ) . '</span>' . ( $by ? ' ' . esc_html( sprintf( /* translators: %s: sponsor */ __( 'Paid for by %s', 'explore-katsina' ), $by ) ) : '' ) . '</p>';
		$content = preg_replace_callback(
			'/<a\s([^>]*href=[^>]*)>/i',
			static function ( $m ) {
				if ( preg_match( '/\srel=("|\')([^"\']*)\1/i', ' ' . $m[1], $r ) ) {
					return false === stripos( $r[2], 'sponsored' ) ? '<a ' . preg_replace( '/rel=("|\')([^"\']*)\1/i', 'rel=$1$2 sponsored$1', $m[1] ) . '>' : $m[0];
				}
				return '<a ' . $m[1] . ' rel="sponsored">';
			},
			$content
		);
		return $label . $content;
	}
}
