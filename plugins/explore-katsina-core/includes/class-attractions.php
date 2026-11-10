<?php
/**
 * Attractions (historic sites, palaces, dams, markets, museums…): the site admin adds them in
 * wp-admin → Attractions. Each has a description, history, visitor details (hours, fee, best time,
 * how to get there), a map pin, a photo gallery and its sources. Visitors also see the nearest
 * hotels, restaurants and event centres with distances, worked out automatically from the map.
 * We never invent facts: missing hours/fees show "not yet confirmed", and anything not yet checked
 * on the ground is marked "not yet verified" for visitors.
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
		add_shortcode( 'ek_attractions', array( __CLASS__, 'list_page' ) );
		// The simple (classic) editor keeps all the visitor fields on one page, easy to fill in.
		add_filter( 'use_block_editor_for_post_type', static fn( $use, $type ) => in_array( $type, array( self::CPT, Events::CPT ), true ) ? false : $use, 10, 2 );
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
			'historic'  => __( 'Historic site', 'explore-katsina' ),
			'religious' => __( 'Religious site', 'explore-katsina' ),
			'nature'    => __( 'Nature & dams', 'explore-katsina' ),
			'market'    => __( 'Markets', 'explore-katsina' ),
			'museum'    => __( 'Museums', 'explore-katsina' ),
			'palace'    => __( 'Palaces', 'explore-katsina' ),
			'crafts'    => __( 'Crafts', 'explore-katsina' ),
		);
	}

	/** Create the categories; rename the Phase 8 ones (re-run safe). */
	public static function add_categories() {
		$old = get_term_by( 'slug', 'heritage', self::TAX );
		if ( $old && ! term_exists( 'historic', self::TAX ) ) {
			wp_update_term( $old->term_id, self::TAX, array( 'slug' => 'historic' ) );
		}
		$festival = get_term_by( 'slug', 'festival', self::TAX );
		if ( $festival && ! $festival->count ) {
			wp_delete_term( $festival->term_id, self::TAX ); // Festivals are Events now.
		}
		foreach ( self::default_categories() as $slug => $label ) {
			$t = get_term_by( 'slug', $slug, self::TAX );
			if ( ! $t ) {
				wp_insert_term( $label, self::TAX, array( 'slug' => $slug ) );
			} elseif ( wp_specialchars_decode( $t->name ) !== $label ) {
				wp_update_term( $t->term_id, self::TAX, array( 'name' => $label ) );
			}
		}
	}

	/** "Title | https://…" lines → [ [label, url], … ]. */
	public static function parse_sources( $text ) {
		$out = array();
		foreach ( preg_split( '/\r?\n/', (string) $text ) as $line ) {
			$line = trim( $line );
			if ( '' === $line ) {
				continue;
			}
			$parts = array_map( 'trim', explode( '|', $line, 2 ) );
			$url   = View::valid_url( end( $parts ) );
			$label = count( $parts ) > 1 ? $parts[0] : ( $url ? wp_parse_url( $url, PHP_URL_HOST ) : $line );
			$out[] = array( $label, $url );
		}
		return $out;
	}

	public static function data( $id ) {
		$lga = get_the_terms( (int) $id, Post_Types::TAX_LGA );
		$cat = get_the_terms( (int) $id, self::TAX );
		if ( $cat && ! is_wp_error( $cat ) ) {
			// Main category first: the more specific ones (Palaces, Markets…) before "Historic site".
			$order = array_flip( array( 'palace', 'market', 'museum', 'nature', 'religious', 'crafts', 'historic' ) );
			usort( $cat, static fn( $a, $b ) => ( $order[ $a->slug ] ?? 99 ) <=> ( $order[ $b->slug ] ?? 99 ) );
		}
		return array(
			'lat'        => get_post_meta( $id, '_ek_lat', true ),
			'lng'        => get_post_meta( $id, '_ek_lng', true ),
			'lga_id'     => $lga && ! is_wp_error( $lga ) ? (int) $lga[0]->term_id : 0,
			'lga'        => $lga && ! is_wp_error( $lga ) ? $lga[0]->name : '',
			'category'   => $cat && ! is_wp_error( $cat ) ? wp_specialchars_decode( $cat[0]->name ) : '',
			'entry_fee'  => (string) get_post_meta( $id, '_ek_entry_fee', true ),
			'hours'      => (string) get_post_meta( $id, '_ek_hours_text', true ),
			'directions' => (string) get_post_meta( $id, '_ek_directions', true ),
			'best_time'  => (string) get_post_meta( $id, '_ek_best_time', true ),
			'history'    => (string) get_post_meta( $id, '_ek_history', true ),
			'sources'    => (string) get_post_meta( $id, '_ek_sources', true ),
			'pin_note'   => (string) get_post_meta( $id, '_ek_pin_note', true ),
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
			Gallery::admin_assets();
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
		<label for="ek-a-pin-note"><?php esc_html_e( 'Note about the pin (optional)', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-a-pin-note" name="ek_pin_note" value="<?php echo esc_attr( $d['pin_note'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. Approximate location: town centre', 'explore-katsina' ); ?>">
		<?php Gallery::field( $post->ID ); ?>
		<label for="ek-a-history"><?php esc_html_e( 'History', 'explore-katsina' ); ?></label>
		<textarea id="ek-a-history" name="ek_history" rows="8"><?php echo esc_textarea( $d['history'] ); ?></textarea>
		<p class="description"><?php esc_html_e( 'Only facts you can back with a source. Say "tradition says…" for legends, and "sources differ" where they do.', 'explore-katsina' ); ?></p>
		<label for="ek-a-fee"><?php esc_html_e( 'Entry fee', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-a-fee" name="ek_entry_fee" value="<?php echo esc_attr( $d['entry_fee'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. Free, or ₦500 adults', 'explore-katsina' ); ?>">
		<label for="ek-a-hours"><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?></label>
		<input type="text" id="ek-a-hours" name="ek_hours_text" value="<?php echo esc_attr( $d['hours'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. Daily 9am–5pm; closed during Friday prayers', 'explore-katsina' ); ?>">
		<p class="description"><?php esc_html_e( 'Leave hours or fee empty if not confirmed: visitors then see "Not yet confirmed, please check locally".', 'explore-katsina' ); ?></p>
		<label for="ek-a-best"><?php esc_html_e( 'Best time to visit', 'explore-katsina' ); ?></label>
		<textarea id="ek-a-best" name="ek_best_time" rows="2"><?php echo esc_textarea( $d['best_time'] ); ?></textarea>
		<label for="ek-a-dir"><?php esc_html_e( 'How to get there', 'explore-katsina' ); ?></label>
		<textarea id="ek-a-dir" name="ek_directions" rows="3"><?php echo esc_textarea( $d['directions'] ); ?></textarea>
		<label for="ek-a-sources"><?php esc_html_e( 'Sources (one per line: Title | https://link)', 'explore-katsina' ); ?></label>
		<textarea id="ek-a-sources" name="ek_sources" rows="5"><?php echo esc_textarea( $d['sources'] ); ?></textarea>
		<p class="description"><?php esc_html_e( 'Shown to visitors under "Sources", so they can check the facts.', 'explore-katsina' ); ?></p>
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
		update_post_meta( $id, '_ek_best_time', sanitize_textarea_field( wp_unslash( $_POST['ek_best_time'] ?? '' ) ) );
		update_post_meta( $id, '_ek_history', wp_kses_post( wp_unslash( $_POST['ek_history'] ?? '' ) ) );
		update_post_meta( $id, '_ek_sources', sanitize_textarea_field( wp_unslash( $_POST['ek_sources'] ?? '' ) ) );
		update_post_meta( $id, '_ek_pin_note', sanitize_text_field( wp_unslash( $_POST['ek_pin_note'] ?? '' ) ) );
		Gallery::save_field( $id, wp_unslash( $_POST ) );
		update_post_meta( $id, '_ek_unverified', empty( $_POST['ek_unverified'] ) ? 0 : 1 );
	}

	/* ---------------- Public page ---------------- */

	public static function public_assets() {
		if ( is_singular( self::CPT ) || is_post_type_archive( self::CPT ) || is_tax( self::TAX ) ) {
			wp_enqueue_style( 'ek' );
			wp_enqueue_style( 'leaflet' );
			wp_enqueue_script( 'ek-mini-map' );
		}
	}

	/** Photos above the description; history, visitor details, map, what is nearby and sources below. */
	public static function details( $content ) {
		if ( ! is_singular( self::CPT ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$id = get_the_ID();
		$a  = self::data( $id );
		$g  = Gallery::render( Gallery::ids( $id ), get_the_title( $id ) );
		return ( $g ? '<div class="ek ek-public">' . $g . '</div>' : '' ) . $content . View::render( 'public/attraction', array( 'id' => $id, 'a' => $a ) );
	}

	/** Published attractions, optionally in one category slug, by title. */
	public static function all( $category = '' ) {
		$q = array( 'post_type' => self::CPT, 'post_status' => 'publish', 'posts_per_page' => 200, 'orderby' => 'title', 'order' => 'ASC', 'fields' => 'ids' );
		if ( $category ) {
			$q['tax_query'] = array( array( 'taxonomy' => self::TAX, 'field' => 'slug', 'terms' => $category ) ); // phpcs:ignore
		}
		return get_posts( $q );
	}

	/** [ek_attractions]: "Things to do", cards with a category filter (?type=slug). */
	public static function list_page() {
		wp_enqueue_style( 'ek' );
		$cat = isset( $_GET['type'] ) ? sanitize_key( wp_unslash( $_GET['type'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification
		$cat = isset( self::default_categories()[ $cat ] ) || term_exists( $cat, self::TAX ) ? $cat : '';
		return View::render( 'public/attractions', array( 'ids' => self::all( $cat ), 'cat' => $cat ) );
	}
}
