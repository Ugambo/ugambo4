<?php
/**
 * Stories (the blog): ordinary WordPress posts, listed on the "Stories" page ([ek_stories]), in five categories:
 * History, Culture, Food, Crafts, Travel guides. In wp-admin, "Posts" is renamed "Stories".
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Stories {

	public static function categories() {
		return array(
			'history'       => __( 'History', 'explore-katsina' ),
			'culture'       => __( 'Culture', 'explore-katsina' ),
			'food'          => __( 'Food', 'explore-katsina' ),
			'crafts'        => __( 'Crafts', 'explore-katsina' ),
			'travel-guides' => __( 'Travel guides', 'explore-katsina' ),
		);
	}

	public static function init() {
		add_filter( 'post_type_labels_post', array( __CLASS__, 'labels' ) );
		add_shortcode( 'ek_stories', array( __CLASS__, 'list_page' ) );
		add_filter( 'the_content', array( __CLASS__, 'sources' ), 20 );
		add_action( 'add_meta_boxes_post', array( __CLASS__, 'meta_box' ) );
		add_action( 'save_post_post', array( __CLASS__, 'save' ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'guide_page_styles' ) );
	}

	/** "Plan your trip" and its sub-pages use a few plugin styles (e.g. the "Things change" note). */
	public static function guide_page_styles() {
		$trips = Install::page_ids_all( 'plan_trip' );
		if ( $trips && is_page() && ( in_array( get_queried_object_id(), $trips, true ) || array_intersect( $trips, get_post_ancestors( get_queried_object_id() ) ) ) ) {
			wp_enqueue_style( 'ek' );
		}
	}

	public static function meta_box() {
		add_meta_box( 'ek-story-sources', __( 'Sources', 'explore-katsina' ), array( __CLASS__, 'render_box' ), 'post', 'normal' );
	}

	public static function render_box( $post ) {
		wp_nonce_field( 'ek_story_save', 'ek_story_nonce' );
		echo '<p><label for="ek-story-sources">' . esc_html__( 'One per line: Title | https://link. Shown under the story so readers can check the facts.', 'explore-katsina' ) . '</label></p>';
		echo '<textarea id="ek-story-sources" name="ek_sources" rows="4" class="large-text">' . esc_textarea( (string) get_post_meta( $post->ID, '_ek_sources', true ) ) . '</textarea>';
	}

	public static function save( $id ) {
		if ( ! isset( $_POST['ek_story_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ek_story_nonce'] ) ), 'ek_story_save' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
			return;
		}
		update_post_meta( $id, '_ek_sources', sanitize_textarea_field( wp_unslash( $_POST['ek_sources'] ?? '' ) ) );
	}

	/** Stories with sources (meta _ek_sources, "Title | URL" lines) list them at the end. */
	public static function sources( $content ) {
		if ( ! is_singular( 'post' ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$src = (string) get_post_meta( get_the_ID(), '_ek_sources', true );
		if ( ! $src ) {
			return $content;
		}
		wp_enqueue_style( 'ek' );
		return $content . View::render( 'public/sources', array( 'sources' => Attractions::parse_sources( $src ) ) );
	}

	public static function labels( $l ) {
		$l->name          = __( 'Stories', 'explore-katsina' );
		$l->singular_name = __( 'Story', 'explore-katsina' );
		$l->menu_name     = __( 'Stories', 'explore-katsina' );
		$l->name_admin_bar = __( 'Story', 'explore-katsina' );
		$l->all_items     = __( 'All stories', 'explore-katsina' );
		$l->add_new_item  = __( 'Add story', 'explore-katsina' );
		$l->edit_item     = __( 'Edit story', 'explore-katsina' );
		return $l;
	}

	/** Create the categories (re-run safe). */
	public static function add_categories() {
		foreach ( self::categories() as $slug => $name ) {
			if ( ! term_exists( $slug, 'category' ) ) {
				wp_insert_term( $name, 'category', array( 'slug' => $slug ) );
			}
		}
		$default = get_term_by( 'slug', 'uncategorized', 'category' );
		if ( $default && ! $default->count && (int) get_option( 'default_category' ) === (int) $default->term_id ) {
			$travel = get_term_by( 'slug', 'travel-guides', 'category' );
			if ( $travel ) {
				update_option( 'default_category', $travel->term_id );
			}
		}
	}

	/** [ek_stories]: published stories, newest first, with a category filter (?topic=slug). */
	public static function list_page() {
		wp_enqueue_style( 'ek' );
		$topic = isset( $_GET['topic'] ) ? sanitize_key( wp_unslash( $_GET['topic'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$topic = isset( self::categories()[ $topic ] ) ? $topic : '';
		$q     = array( 'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => 30, 'fields' => 'ids', 'lang' => '' ); // All languages: Hausa readers see English stories until translated.
		if ( $topic ) {
			$q['category_name'] = $topic;
		}
		return View::render( 'public/stories', array( 'ids' => get_posts( $q ), 'topic' => $topic ) );
	}
}
