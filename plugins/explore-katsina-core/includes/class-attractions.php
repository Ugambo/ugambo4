<?php
/**
 * Attractions (e.g. historic sites, markets, museums): a simple content type so they appear on the
 * Katsina Map, in "Nearby" and in Favourites. The site admin adds them in wp-admin → Attractions.
 * Researched descriptions arrive in Phase 10. We never invent facts: anything not yet checked is
 * marked "details not yet verified" and shown that way to visitors.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Attractions {

	const CPT = 'ek_attraction';
	const TAX = 'ek_attraction_cat';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 6 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'meta_box' ) );
		add_action( 'save_post_' . self::CPT, array( __CLASS__, 'save' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_assets' ) );
		add_filter( 'the_content', array( __CLASS__, 'details' ) );
		add_filter( 'ek_favourite_types', static fn( $t ) => array_merge( $t, array( self::CPT ) ) );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'public_assets' ) );
	}

	public static function register() {
		register_post_type(
			self::CPT,
			array(
				'labels'       => array(
					'name'          => __( 'Attractions', 'explore-katsina' ),
					'singular_name' => __( 'Attraction', 'explore-katsina' ),
					'add_new_item'  => __( 'Add attraction', 'explore-katsina' ),
					'edit_item'     => __( 'Edit attraction', 'explore-katsina' ),
				),
				'public'       => true,
				'show_in_rest' => true,
				'has_archive'  => 'attractions',
				'rewrite'      => array( 'slug' => 'attractions' ),
				'menu_icon'    => 'dashicons-bank',
				'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
				'taxonomies'   => array( Post_Types::TAX_LGA, self::TAX ),
			)
		);
		register_taxonomy_for_object_type( Post_Types::TAX_LGA, self::CPT );
		register_taxonomy(
			self::TAX,
			self::CPT,
			array(
				'labels'            => array(
					'name'          => __( 'Attraction categories', 'explore-katsina' ),
					'singular_name' => __( 'Attraction category', 'explore-katsina' ),
				),
				'public'            => true,
				'show_in_rest'      => true,
				'show_admin_column' => true,
				'hierarchical'      => true,
				'rewrite'           => array( 'slug' => 'attraction-type' ),
			)
		);
	}

	/** Default categories (created by `wp ek install`). */
	public static function default_categories() {
		return array(
			'heritage'  => __( 'History & heritage', 'explore-katsina' ),
			'religious' => __( 'Mosques & religious sites', 'explore-katsina' ),
			'palace'    => __( 'Palaces & traditional institutions', 'explore-katsina' ),
			'museum'    => __( 'Museums & culture', 'explore-katsina' ),
			'market'    => __( 'Markets & crafts', 'explore-katsina' ),
			'nature'    => __( 'Nature & outdoors', 'explore-katsina' ),
			'festival'  => __( 'Festival grounds', 'explore-katsina' ),
		);
	}

	public static function data( $id ) {
		$lga = get_the_terms( (int) $id, Post_Types::TAX_LGA );
		$cat = get_the_terms( (int) $id, self::TAX );
		return array(
			'lat'        => get_post_meta( $id, '_ek_lat', true ),
			'lng'        => get_post_meta( $id, '_ek_lng', true ),
			'lga_id'     => $lga && ! is_wp_error( $lga ) ? (int) $lga[0]->term_id : 0,
			'lga'        => $lga && ! is_wp_error( $lga ) ? $lga[0]->name : '',
			'category'   => $cat && ! is_wp_error( $cat ) ? $cat[0]->name : '',
			'entry_fee'  => (string) get_post_meta( $id, '_ek_entry_fee', true ),
			'hours'      => (string) get_post_meta( $id, '_ek_hours_text', true ),
			'directions' => (string) get_post_meta( $id, '_ek_directions', true ),
			'unverified' => (bool) get_post_meta( $id, '_ek_unverified', true ),
		);
	}

	/* ---------------- wp-admin ---------------- */

	public static function meta_box() {
		add_meta_box( 'ek-attraction', __( 'Location and visitor details', 'explore-katsina' ), array( __CLASS__, 'render_box' ), self::CPT, 'normal', 'high' );
	}

	public static function admin_assets( $hook ) {
		$screen = get_current_screen();
		if ( $screen && self::CPT === $screen->post_type && in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			wp_enqueue_style( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.css', array(), '1.9.4' );
			wp_enqueue_script( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.js', array(), '1.9.4', true );
			wp_enqueue_script( 'ek-map-picker-admin', EK_URL . 'assets/js/map-picker.js', array( 'leaflet' ), EK_VERSION, true );
			wp_localize_script( 'ek-map-picker-admin', 'ekMap', Assets::map_config() );
			wp_add_inline_style( 'leaflet', '#ek-attraction .ek-map-picker{height:320px;border-radius:8px;margin:6px 0}#ek-attraction .ek-row{display:flex;gap:12px;flex-wrap:wrap}#ek-attraction label{display:block;font-weight:600;margin:10px 0 4px}#ek-attraction textarea,#ek-attraction input[type=text]{width:100%}' );
		}
	}

	public static function render_box( $post ) {
		$d = self::data( $post->ID );
		wp_nonce_field( 'ek_attraction_save', 'ek_attraction_nonce' );
		?>
		<div class="ek-field">
			<label><?php esc_html_e( 'Map pin (drag it to the main entrance)', 'explore-katsina' ); ?></label>
			<div class="ek-map-picker" data-ek-map-picker data-lat-input="ek-a-lat" data-lng-input="ek-a-lng" data-colour="#1F6B52"></div>
			<p><button type="button" class="button" data-ek-locate><?php esc_html_e( 'Use my location', 'explore-katsina' ); ?></button> <span data-ek-coords class="description"></span></p>
			<div class="ek-row">
				<p><label for="ek-a-lat"><?php esc_html_e( 'Latitude', 'explore-katsina' ); ?></label><input type="text" id="ek-a-lat" name="ek_lat" value="<?php echo esc_attr( $d['lat'] ); ?>"></p>
				<p><label for="ek-a-lng"><?php esc_html_e( 'Longitude', 'explore-katsina' ); ?></label><input type="text" id="ek-a-lng" name="ek_lng" value="<?php echo esc_attr( $d['lng'] ); ?>"></p>
			</div>
		</div>
		<label for="ek-a-fee"><?php esc_html_e( 'Entry fee', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-a-fee" name="ek_entry_fee" value="<?php echo esc_attr( $d['entry_fee'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. Free, or ₦500 adults', 'explore-katsina' ); ?>">
		<label for="ek-a-hours"><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-a-hours" name="ek_hours_text" value="<?php echo esc_attr( $d['hours'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. Daily 9am–5pm; closed during Friday prayers', 'explore-katsina' ); ?>">
		<label for="ek-a-dir"><?php esc_html_e( 'How to get there', 'explore-katsina' ); ?></label>
		<textarea id="ek-a-dir" name="ek_directions" rows="3"><?php echo esc_textarea( $d['directions'] ); ?></textarea>
		<p><label style="font-weight:normal"><input type="checkbox" name="ek_unverified" value="1" <?php checked( $d['unverified'] || 'auto-draft' === $post->post_status ); ?>> <?php esc_html_e( 'Details not yet verified (shows a notice to visitors; untick once checked)', 'explore-katsina' ); ?></label></p>
		<?php
	}

	public static function save( $id, $post ) {
		if ( ! isset( $_POST['ek_attraction_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ek_attraction_nonce'] ) ), 'ek_attraction_save' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
			return;
		}
		$lat = (float) ( $_POST['ek_lat'] ?? 0 );
		$lng = (float) ( $_POST['ek_lng'] ?? 0 );
		if ( Business::in_katsina( $lat, $lng ) ) {
			update_post_meta( $id, '_ek_lat', round( $lat, 6 ) );
			update_post_meta( $id, '_ek_lng', round( $lng, 6 ) );
		}
		update_post_meta( $id, '_ek_entry_fee', sanitize_text_field( wp_unslash( $_POST['ek_entry_fee'] ?? '' ) ) );
		update_post_meta( $id, '_ek_hours_text', sanitize_text_field( wp_unslash( $_POST['ek_hours_text'] ?? '' ) ) );
		update_post_meta( $id, '_ek_directions', sanitize_textarea_field( wp_unslash( $_POST['ek_directions'] ?? '' ) ) );
		update_post_meta( $id, '_ek_unverified', empty( $_POST['ek_unverified'] ) ? 0 : 1 );
	}

	/* ---------------- Public page ---------------- */

	public static function public_assets() {
		if ( is_singular( self::CPT ) ) {
			wp_enqueue_style( 'ek' );
			wp_enqueue_style( 'leaflet' );
			wp_enqueue_script( 'ek-mini-map' );
		}
	}

	/** Visitor details + small map with nearby places, under the attraction's description. */
	public static function details( $content ) {
		if ( ! is_singular( self::CPT ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		return $content . View::render( 'public/attraction', array( 'id' => get_the_ID(), 'a' => self::data( get_the_ID() ) ) );
	}
}
