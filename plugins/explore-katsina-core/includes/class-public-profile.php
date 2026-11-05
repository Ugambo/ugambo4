<?php
/**
 * Public business page (basic version). Hotels, restaurants and event centres
 * add their rooms, menus and halls to this page in Phases 3–5.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Public_Profile {

	public static function init() {
		add_filter( 'the_content', array( __CLASS__, 'content' ), 20 );
		add_action( 'init', array( __CLASS__, 'block_template' ) );
	}

	/**
	 * For block themes: a clean business page (no "Written by", no blog navigation).
	 * Classic themes such as Kadence get their own template in Phase 11.
	 */
	public static function block_template() {
		if ( ! function_exists( 'register_block_template' ) ) {
			return;
		}
		register_block_template(
			'explore-katsina-core//single-' . Post_Types::BUSINESS,
			array(
				'title'       => __( 'Business page', 'explore-katsina' ),
				'description' => __( 'Public page for a hotel, restaurant, event centre or other business.', 'explore-katsina' ),
				'post_types'  => array( Post_Types::BUSINESS ),
				'content'     => '<!-- wp:template-part {"slug":"header","area":"header"} /-->'
					. '<!-- wp:group {"tagName":"main","layout":{"type":"constrained","wideSize":"1100px"},"style":{"spacing":{"padding":{"left":"var:preset|spacing|50","right":"var:preset|spacing|50","top":"var:preset|spacing|40","bottom":"var:preset|spacing|60"}}}} -->'
					. '<main class="wp-block-group" style="padding-top:var(--wp--preset--spacing--40);padding-right:var(--wp--preset--spacing--50);padding-bottom:var(--wp--preset--spacing--60);padding-left:var(--wp--preset--spacing--50)">'
					. '<!-- wp:post-title {"level":1,"align":"wide"} /-->'
					. '<!-- wp:post-content {"align":"wide","layout":{"type":"default"}} /-->'
					. '</main><!-- /wp:group -->'
					. '<!-- wp:template-part {"slug":"footer","area":"footer"} /-->',
			)
		);
	}

	public static function content( $content ) {
		if ( ! is_singular( Post_Types::BUSINESS ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$id = get_the_ID();
		if ( 'publish' !== get_post_status( $id ) ) {
			return $content;
		}
		wp_enqueue_style( 'ek' );
		wp_enqueue_style( 'leaflet' );
		wp_enqueue_script( 'ek-mini-map' );
		wp_enqueue_script( 'ek-search' );

		$uid   = get_current_user_id();
		$track = ! ( $uid && ( (int) get_post_field( 'post_author', $id ) === $uid || user_can( $uid, 'edit_posts' ) ) );
		if ( $track ) {
			wp_enqueue_script( 'ek-track' );
		}

		return View::render(
			'public-business',
			array(
				'b'     => Business::profile( $id ),
				'track' => $track,
			)
		);
	}
}
