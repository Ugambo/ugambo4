<?php
/**
 * Public content types: Businesses (all types) plus the Type and LGA labels.
 * Clean URLs per type: /hotels/name/, /restaurants/name/, /event-centres/name/,
 * /tour-operators/name/, /directory/name/.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Post_Types {

	const BUSINESS = 'ek_business';
	const TAX_TYPE = 'ek_type';
	const TAX_LGA  = 'ek_lga';

	const STATUS_REJECTED = 'ek_rejected';
	const STATUS_PAUSED   = 'ek_paused';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 5 );
		add_action( 'init', array( __CLASS__, 'maybe_flush' ), 99 );
		add_filter( 'post_type_link', array( __CLASS__, 'permalink' ), 10, 2 );
		add_action( 'template_redirect', array( __CLASS__, 'canonical_type_base' ) );
	}

	public static function register() {
		if ( post_type_exists( self::BUSINESS ) ) {
			return;
		}

		register_post_type(
			self::BUSINESS,
			array(
				'labels'          => array(
					'name'          => __( 'Businesses', 'explore-katsina' ),
					'singular_name' => __( 'Business', 'explore-katsina' ),
					'menu_name'     => __( 'Businesses', 'explore-katsina' ),
					'all_items'     => __( 'All businesses', 'explore-katsina' ),
					'edit_item'     => __( 'Edit business', 'explore-katsina' ),
				),
				'public'          => true,
				'show_in_rest'    => false, // Owners use our dashboard, not the REST API.
				'has_archive'     => false,
				'rewrite'         => false,
				'query_var'       => self::BUSINESS,
				'menu_icon'       => 'dashicons-store',
				'supports'        => array( 'title', 'editor', 'thumbnail', 'author' ),
				'capability_type' => 'post',
				'map_meta_cap'    => true,
			)
		);

		register_taxonomy(
			self::TAX_TYPE,
			self::BUSINESS,
			array(
				'labels'            => array(
					'name'          => __( 'Business types', 'explore-katsina' ),
					'singular_name' => __( 'Business type', 'explore-katsina' ),
				),
				'public'            => false,
				'show_ui'           => true,
				'show_admin_column' => true,
				'hierarchical'      => true,
				'rewrite'           => false,
				'capabilities'      => array(
					'manage_terms' => 'manage_options',
					'edit_terms'   => 'manage_options',
					'delete_terms' => 'manage_options',
					'assign_terms' => 'edit_posts',
				),
			)
		);

		register_taxonomy(
			self::TAX_LGA,
			self::BUSINESS,
			array(
				'labels'            => array(
					'name'          => __( 'LGAs', 'explore-katsina' ),
					'singular_name' => __( 'LGA', 'explore-katsina' ),
				),
				'public'            => true,
				'show_admin_column' => true,
				'hierarchical'      => true,
				'rewrite'           => array( 'slug' => 'lga' ),
			)
		);

		register_post_status(
			self::STATUS_REJECTED,
			array(
				'label'                     => _x( 'Rejected', 'business status', 'explore-katsina' ),
				'public'                    => false,
				'internal'                  => false,
				'protected'                 => true,
				'show_in_admin_all_list'    => true,
				'show_in_admin_status_list' => true,
				/* translators: %s: number of businesses */
				'label_count'               => _n_noop( 'Rejected <span class="count">(%s)</span>', 'Rejected <span class="count">(%s)</span>', 'explore-katsina' ),
			)
		);
		register_post_status(
			self::STATUS_PAUSED,
			array(
				'label'                     => _x( 'Paused', 'business status', 'explore-katsina' ),
				'public'                    => false,
				'internal'                  => false,
				'protected'                 => true,
				'show_in_admin_all_list'    => true,
				'show_in_admin_status_list' => true,
				/* translators: %s: number of businesses */
				'label_count'               => _n_noop( 'Paused <span class="count">(%s)</span>', 'Paused <span class="count">(%s)</span>', 'explore-katsina' ),
			)
		);

		foreach ( array_unique( array_column( Business::types(), 'base' ) ) as $base ) {
			add_rewrite_rule( '^' . $base . '/([^/]+)/?$', 'index.php?' . self::BUSINESS . '=$matches[1]', 'top' );
		}
	}

	public static function maybe_flush() {
		if ( get_option( 'ek_flush_rewrite' ) ) {
			delete_option( 'ek_flush_rewrite' );
			flush_rewrite_rules( false );
		}
	}

	public static function permalink( $link, $post ) {
		if ( self::BUSINESS !== $post->post_type ) {
			return $link;
		}
		if ( ! get_option( 'permalink_structure' ) || ! $post->post_name ) {
			return add_query_arg( self::BUSINESS, $post->post_name ? $post->post_name : $post->ID, home_url( '/' ) );
		}
		$type = Business::type_of( $post->ID );
		$base = Business::types()[ $type ]['base'] ?? 'directory';
		return home_url( user_trailingslashit( $base . '/' . $post->post_name ) );
	}

	/** /hotels/some-restaurant/ → 301 to /restaurants/some-restaurant/. */
	public static function canonical_type_base() {
		if ( ! is_singular( self::BUSINESS ) || is_preview() || ! get_option( 'permalink_structure' ) ) {
			return;
		}
		$correct = get_permalink();
		$path    = (string) wp_parse_url( $correct, PHP_URL_PATH );
		$request = (string) strtok( wp_unslash( $_SERVER['REQUEST_URI'] ?? '' ), '?' );
		if ( $path && untrailingslashit( $path ) !== untrailingslashit( $request ) ) {
			wp_safe_redirect( $correct, 301 );
			exit;
		}
	}
}
