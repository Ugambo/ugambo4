<?php
/**
 * Events (festivals, concerts, conferences…). Added by the site admin in wp-admin → Events
 * (researched festival content arrives in Phase 10). Each event can have ticket types (Tickets).
 *
 * Event promotion: organisers pay (7 or 30 days, placeholder prices) on /promote-event/ to be
 * featured on the homepage ([ek_promoted_events]) and at the top of /events/ ([ek_events]),
 * clearly labelled "Promoted". The admin approves each promotion before it shows.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Events {

	const CPT = 'ek_event';

	private static $errors = array();
	private static $values = array();

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 6 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'meta_box' ) );
		add_action( 'save_post_' . self::CPT, array( __CLASS__, 'save' ), 10, 2 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'admin_assets' ) );
		add_filter( 'the_content', array( __CLASS__, 'details' ) );
		add_shortcode( 'ek_events', array( __CLASS__, 'list_page' ) );
		add_shortcode( 'ek_promoted_events', array( __CLASS__, 'promoted' ) );
		add_shortcode( 'ek_promote_event', array( __CLASS__, 'promote_page' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle_promote' ), 8 );
		add_action( 'ek_sale_paid', array( __CLASS__, 'fulfil' ) );
		add_action( 'wp_enqueue_scripts', static function () {
			if ( is_singular( self::CPT ) ) {
				wp_enqueue_style( 'ek' );
			}
		} );
		add_filter( 'ek_favourite_types', static fn( $t ) => array_merge( $t, array( self::CPT ) ) );
	}

	public static function register() {
		register_post_type(
			self::CPT,
			array(
				'labels'       => array(
					'name'          => __( 'Events', 'explore-katsina' ),
					'singular_name' => __( 'Event', 'explore-katsina' ),
					'add_new_item'  => __( 'Add event', 'explore-katsina' ),
					'edit_item'     => __( 'Edit event', 'explore-katsina' ),
				),
				'public'       => true,
				'show_in_rest' => true,
				'has_archive'  => false,
				'rewrite'      => array( 'slug' => 'events' ),
				'menu_icon'    => 'dashicons-tickets-alt',
				'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
				'taxonomies'   => array( Post_Types::TAX_LGA ),
			)
		);
		register_taxonomy_for_object_type( Post_Types::TAX_LGA, self::CPT );
	}

	public static function data( $id ) {
		$lga = get_the_terms( (int) $id, Post_Types::TAX_LGA );
		return array(
			'start'    => (string) get_post_meta( $id, '_ek_start', true ), // "Y-m-d H:i" Lagos.
			'end'      => (string) get_post_meta( $id, '_ek_end', true ),
			'tbc'      => (bool) get_post_meta( $id, '_ek_date_tbc', true ),
			'venue'    => (string) get_post_meta( $id, '_ek_venue', true ),
			'lat'      => get_post_meta( $id, '_ek_lat', true ),
			'lng'      => get_post_meta( $id, '_ek_lng', true ),
			'lga'      => $lga && ! is_wp_error( $lga ) ? $lga[0]->name : '',
			'promoted' => (int) get_post_meta( $id, '_ek_promoted_until', true ),
		);
	}

	/** "Saturday 4 April 2026, 10:00" / "Date to be confirmed". */
	public static function when( array $d ) {
		if ( $d['tbc'] || ! $d['start'] ) {
			return __( 'Date to be confirmed', 'explore-katsina' );
		}
		$tz    = Availability::tz();
		$start = new \DateTimeImmutable( $d['start'], $tz );
		$out   = wp_date( 'l j F Y, H:i', $start->getTimestamp() );
		if ( $d['end'] ) {
			$end  = new \DateTimeImmutable( $d['end'], $tz );
			$out .= ' – ' . ( $end->format( 'Y-m-d' ) === $start->format( 'Y-m-d' ) ? wp_date( 'H:i', $end->getTimestamp() ) : wp_date( 'l j F Y, H:i', $end->getTimestamp() ) );
		}
		return $out;
	}

	public static function is_past( array $d ) {
		if ( $d['tbc'] || ! $d['start'] ) {
			return false;
		}
		$last = $d['end'] ? $d['end'] : $d['start'];
		return ( new \DateTimeImmutable( $last, Availability::tz() ) )->getTimestamp() < time() - 6 * HOUR_IN_SECONDS;
	}

	public static function is_promoted( $id ) {
		return (int) get_post_meta( $id, '_ek_promoted_until', true ) > time();
	}

	/** Upcoming (or date-TBC) published events: promoted first, then by date. */
	public static function upcoming( $limit = 50, $promoted_only = false ) {
		$ids = get_posts( array( 'post_type' => self::CPT, 'post_status' => 'publish', 'posts_per_page' => 300, 'fields' => 'ids' ) );
		$ids = array_values( array_filter( $ids, static fn( $id ) => ! self::is_past( self::data( $id ) ) && ( ! $promoted_only || self::is_promoted( $id ) ) ) );
		usort(
			$ids,
			static function ( $a, $b ) {
				$da = self::data( $a );
				$db = self::data( $b );
				return array( ! self::is_promoted( $a ), $da['tbc'] || ! $da['start'], $da['start'] ) <=> array( ! self::is_promoted( $b ), $db['tbc'] || ! $db['start'], $db['start'] );
			}
		);
		return array_slice( $ids, 0, $limit );
	}

	/* ---------------- wp-admin ---------------- */

	public static function meta_box() {
		add_meta_box( 'ek-event', __( 'Date, place, tickets and promotion', 'explore-katsina' ), array( __CLASS__, 'render_box' ), self::CPT, 'normal', 'high' );
	}

	public static function admin_assets( $hook ) {
		$screen = get_current_screen();
		if ( $screen && self::CPT === $screen->post_type && in_array( $hook, array( 'post.php', 'post-new.php' ), true ) ) {
			wp_enqueue_style( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.css', array(), '1.9.4' );
			wp_enqueue_script( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.js', array(), '1.9.4', true );
			wp_enqueue_script( 'ek-map-picker-admin', EK_URL . 'assets/js/map-picker.js', array( 'leaflet' ), EK_VERSION, true );
			wp_localize_script( 'ek-map-picker-admin', 'ekMap', Assets::map_config() );
			wp_add_inline_style( 'leaflet', '#ek-event .ek-map-picker{height:260px;border-radius:8px;margin:6px 0}#ek-event label{font-weight:600}#ek-event .ek-row{display:flex;gap:12px;flex-wrap:wrap;align-items:end}#ek-event table input{width:100%}' );
		}
	}

	public static function render_box( $post ) {
		$d     = self::data( $post->ID );
		$types = Tickets::types( $post->ID );
		wp_nonce_field( 'ek_event_save', 'ek_event_nonce' );
		$split = static fn( $v ) => $v ? explode( ' ', $v ) + array( '', '' ) : array( '', '' );
		list( $sd, $st ) = $split( $d['start'] );
		list( $ed, $et ) = $split( $d['end'] );
		?>
		<div class="ek-row">
			<p><label for="ek-ev-sd"><?php esc_html_e( 'Starts', 'explore-katsina' ); ?></label><br><input type="date" id="ek-ev-sd" name="ek_start_date" value="<?php echo esc_attr( $sd ); ?>"> <input type="time" name="ek_start_time" value="<?php echo esc_attr( $st ); ?>"></p>
			<p><label for="ek-ev-ed"><?php esc_html_e( 'Ends', 'explore-katsina' ); ?></label><br><input type="date" id="ek-ev-ed" name="ek_end_date" value="<?php echo esc_attr( $ed ); ?>"> <input type="time" name="ek_end_time" value="<?php echo esc_attr( $et ); ?>"></p>
			<p><label><input type="checkbox" name="ek_date_tbc" value="1" <?php checked( $d['tbc'] ); ?>> <?php esc_html_e( 'Date to be confirmed (TBC)', 'explore-katsina' ); ?></label></p>
		</div>
		<p><label for="ek-ev-venue"><?php esc_html_e( 'Venue / place', 'explore-katsina' ); ?></label><br><input type="text" id="ek-ev-venue" name="ek_venue" class="large-text" value="<?php echo esc_attr( $d['venue'] ); ?>"></p>
		<div class="ek-field">
			<label><?php esc_html_e( 'Map pin (optional)', 'explore-katsina' ); ?></label>
			<div class="ek-map-picker" data-ek-map-picker data-lat-input="ek-ev-lat" data-lng-input="ek-ev-lng" data-colour="#141B3A"></div>
			<p><button type="button" class="button" data-ek-locate><?php esc_html_e( 'Use my location', 'explore-katsina' ); ?></button> <span data-ek-coords class="description"></span>
			<input type="hidden" id="ek-ev-lat" name="ek_lat" value="<?php echo esc_attr( $d['lat'] ); ?>"><input type="hidden" id="ek-ev-lng" name="ek_lng" value="<?php echo esc_attr( $d['lng'] ); ?>"></p>
		</div>
		<h3><?php esc_html_e( 'Tickets', 'explore-katsina' ); ?></h3>
		<p class="description"><?php esc_html_e( 'Leave empty if the event has no tickets. Ticket money comes to Explore Katsina. A type cannot be removed once tickets are sold; set its quantity to the number sold to stop sales.', 'explore-katsina' ); ?></p>
		<table class="widefat striped" style="max-width:820px">
			<thead><tr><th><?php esc_html_e( 'Ticket type (e.g. Regular, VIP)', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Price (₦, 0 = free)', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'How many', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Sales end (optional)', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Sold', 'explore-katsina' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_merge( $types, array_fill( 0, 3, null ) ) as $i => $t ) : ?>
				<tr>
					<td><input type="hidden" name="ek_tt[<?php echo (int) $i; ?>][id]" value="<?php echo $t ? (int) $t->id : ''; ?>"><input type="text" name="ek_tt[<?php echo (int) $i; ?>][name]" value="<?php echo esc_attr( $t->name ?? '' ); ?>"></td>
					<td><input type="text" inputmode="decimal" name="ek_tt[<?php echo (int) $i; ?>][price]" value="<?php echo $t ? esc_attr( (string) ( $t->price_kobo / 100 ) ) : ''; ?>"></td>
					<td><input type="number" min="0" name="ek_tt[<?php echo (int) $i; ?>][quantity]" value="<?php echo $t ? (int) $t->quantity : ''; ?>"></td>
					<td><input type="datetime-local" name="ek_tt[<?php echo (int) $i; ?>][sales_end]" value="<?php echo $t && $t->sales_end ? esc_attr( str_replace( ' ', 'T', substr( get_date_from_gmt( $t->sales_end ), 0, 16 ) ) ) : ''; ?>"></td>
					<td><?php echo $t ? (int) $t->sold : '—'; ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<h3><?php esc_html_e( 'Promotion', 'explore-katsina' ); ?></h3>
		<p><label for="ek-ev-promo"><?php esc_html_e( 'Promoted until (homepage + top of Events, labelled "Promoted")', 'explore-katsina' ); ?></label><br><input type="date" id="ek-ev-promo" name="ek_promoted_until" value="<?php echo $d['promoted'] ? esc_attr( wp_date( 'Y-m-d', $d['promoted'] ) ) : ''; ?>"> <span class="description"><?php esc_html_e( 'Set automatically when a paid promotion is approved.', 'explore-katsina' ); ?></span></p>
		<?php
	}

	public static function save( $id, $post ) {
		if ( ! isset( $_POST['ek_event_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ek_event_nonce'] ) ), 'ek_event_save' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
			return;
		}
		$in   = wp_unslash( $_POST );
		$dt   = static function ( $date, $time ) {
			$date = sanitize_text_field( (string) $date );
			$time = preg_match( '/^\d{2}:\d{2}$/', (string) $time ) ? $time : '00:00';
			return Availability::valid_date( $date ) ? $date . ' ' . $time : '';
		};
		update_post_meta( $id, '_ek_start', $dt( $in['ek_start_date'] ?? '', $in['ek_start_time'] ?? '' ) );
		update_post_meta( $id, '_ek_end', $dt( $in['ek_end_date'] ?? '', $in['ek_end_time'] ?? '' ) );
		update_post_meta( $id, '_ek_date_tbc', empty( $in['ek_date_tbc'] ) ? 0 : 1 );
		update_post_meta( $id, '_ek_venue', sanitize_text_field( $in['ek_venue'] ?? '' ) );
		$lat = (float) ( $in['ek_lat'] ?? 0 );
		$lng = (float) ( $in['ek_lng'] ?? 0 );
		if ( Business::in_katsina( $lat, $lng ) ) {
			update_post_meta( $id, '_ek_lat', round( $lat, 6 ) );
			update_post_meta( $id, '_ek_lng', round( $lng, 6 ) );
		}
		$promo = sanitize_text_field( $in['ek_promoted_until'] ?? '' );
		update_post_meta( $id, '_ek_promoted_until', Availability::valid_date( $promo ) ? ( new \DateTimeImmutable( $promo . ' 23:59:59', Availability::tz() ) )->getTimestamp() : 0 );
		Tickets::save_types( $id, (array) ( $in['ek_tt'] ?? array() ) );
	}

	/* ---------------- Public ---------------- */

	public static function details( $content ) {
		if ( ! is_singular( self::CPT ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$id = get_the_ID();
		return View::render( 'public/event-head', array( 'id' => $id, 'd' => self::data( $id ) ) ) . $content . View::render( 'public/event-tickets', array( 'id' => $id, 'd' => self::data( $id ), 'error' => Tickets::$error, 'v' => Tickets::$values ) );
	}

	public static function list_page() {
		wp_enqueue_style( 'ek' );
		return View::render( 'public/events', array( 'ids' => self::upcoming() ) );
	}

	public static function promoted( $atts = array() ) {
		$atts = shortcode_atts( array( 'limit' => 4 ), $atts );
		$ids  = self::upcoming( (int) $atts['limit'], true );
		if ( ! $ids ) {
			return '';
		}
		wp_enqueue_style( 'ek' );
		return View::render( 'public/events', array( 'ids' => $ids, 'compact' => true ) );
	}

	/* ---------------- Paid promotion ---------------- */

	public static function packages() {
		return array(
			'7'  => array( __( '7 days', 'explore-katsina' ), (int) Settings::get( 'price_promo_7' ) ),
			'30' => array( __( '30 days', 'explore-katsina' ), (int) Settings::get( 'price_promo_30' ) ),
		);
	}

	public static function handle_promote() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'promote_event' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_promote_event' ) || ! empty( $in['ek_company_hp'] ) ) {
			self::$errors['_form'] = __( 'Your session expired. Please try again.', 'explore-katsina' );
			return;
		}
		$pk    = self::packages();
		$e     = array();
		$days  = (string) absint( $in['package'] ?? 0 );
		$event = absint( $in['event_id'] ?? 0 );
		$phone = Business::normalize_phone( $in['phone'] ?? '' );
		$email = sanitize_email( $in['email'] ?? '' );
		if ( ! isset( $pk[ $days ] ) ) {
			$e['package'] = __( 'Choose a package.', 'explore-katsina' );
		}
		if ( $event && ( self::CPT !== get_post_type( $event ) || 'publish' !== get_post_status( $event ) ) ) {
			$event = 0;
		}
		if ( ! $event ) {
			if ( mb_strlen( trim( (string) ( $in['event_title'] ?? '' ) ) ) < 3 ) {
				$e['event_title'] = __( 'Enter the event name.', 'explore-katsina' );
			}
			if ( mb_strlen( trim( (string) ( $in['event_about'] ?? '' ) ) ) < 30 ) {
				$e['event_about'] = __( 'Tell visitors about the event (30 characters or more).', 'explore-katsina' );
			}
		}
		if ( mb_strlen( trim( (string) ( $in['name'] ?? '' ) ) ) < 2 ) {
			$e['name'] = __( 'Enter your name.', 'explore-katsina' );
		}
		if ( ! $phone ) {
			$e['phone'] = __( 'Enter a Nigerian phone number, e.g. 0803 123 4567.', 'explore-katsina' );
		}
		if ( ! is_email( $email ) ) {
			$e['email'] = __( 'Enter a valid email address.', 'explore-katsina' );
		}
		if ( $e ) {
			self::$errors = $e;
			return;
		}
		$title = $event ? get_the_title( $event ) : sanitize_text_field( $in['event_title'] );
		$s     = Sales::create(
			array(
				'kind'        => 'promotion',
				'object_id'   => $event,
				'amount_kobo' => $pk[ $days ][1],
				'name'        => sanitize_text_field( $in['name'] ),
				'email'       => $email,
				'phone'       => $phone,
				'details'     => array(
					/* translators: 1: event, 2: days */
					'title' => sprintf( __( '%1$s (%2$s)', 'explore-katsina' ), $title, $pk[ $days ][0] ),
					'days'  => (int) $days,
					'new'   => $event ? null : array(
						'title' => $title,
						'date'  => sanitize_text_field( $in['event_date'] ?? '' ),
						'tbc'   => empty( $in['event_date'] ) ? 1 : 0,
						'venue' => sanitize_text_field( $in['event_venue'] ?? '' ),
						'about' => sanitize_textarea_field( $in['event_about'] ?? '' ),
					),
				),
			)
		);
		$url = Sales::pay_url( $s );
		if ( is_wp_error( $url ) ) {
			self::$errors['_form'] = $url->get_error_message();
			return;
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	public static function promote_page() {
		wp_enqueue_style( 'ek' );
		return View::render( 'public/promote-event', array( 'errors' => self::$errors, 'v' => self::$values, 'packages' => self::packages(), 'events' => self::upcoming() ) );
	}

	public static function fulfil( $s ) {
		if ( 'promotion' === $s->kind ) {
			Sales::set_stage( $s->id, 'submitted' );
		}
	}

	/**
	 * Admin approves a paid promotion (creating the event from the organiser's details if needed).
	 *
	 * @return int|\WP_Error Event id.
	 */
	public static function approve_promotion( $sale_id, $admin_id ) {
		$s = Sales::get( $sale_id );
		if ( ! $s || 'promotion' !== $s->kind || 'paid' !== $s->status || 'submitted' !== $s->stage ) {
			return new \WP_Error( 'state', __( 'This promotion is not waiting for approval.', 'explore-katsina' ) );
		}
		$event = (int) $s->object_id;
		if ( ! $event && ! empty( $s->details['new'] ) ) {
			$n     = $s->details['new'];
			$event = wp_insert_post( array( 'post_type' => self::CPT, 'post_status' => 'publish', 'post_title' => $n['title'], 'post_content' => $n['about'] ) );
			if ( Availability::valid_date( $n['date'] ) ) {
				update_post_meta( $event, '_ek_start', $n['date'] . ' 00:00' );
			}
			update_post_meta( $event, '_ek_date_tbc', $n['tbc'] ? 1 : 0 );
			update_post_meta( $event, '_ek_venue', $n['venue'] );
		}
		$from  = max( time(), (int) get_post_meta( $event, '_ek_promoted_until', true ) );
		$until = $from + (int) $s->details['days'] * DAY_IN_SECONDS;
		update_post_meta( $event, '_ek_promoted_until', $until );
		global $wpdb;
		$wpdb->update( $wpdb->prefix . 'ek_sales', array( 'object_id' => $event ), array( 'id' => $s->id ) );
		/* translators: %s: date */
		Sales::set_stage( $s->id, 'approved', sprintf( __( 'Promoted until %s', 'explore-katsina' ), wp_date( 'j M Y', $until ) ) );
		Log::add( 'promotion_approved', 'sale', $s->id, get_the_title( $event ), array( 'by' => (int) $admin_id ) );
		if ( $s->customer_email ) {
			Emails::send(
				$s->customer_email,
				__( 'Your event promotion is live', 'explore-katsina' ),
				__( 'Your event is now promoted', 'explore-katsina' ),
				/* translators: 1: event, 2: date */
				array( sprintf( __( '"%1$s" is now featured on our homepage and at the top of the Events page until %2$s.', 'explore-katsina' ), get_the_title( $event ), wp_date( 'j F Y', $until ) ) ),
				array( 'label' => __( 'See your event', 'explore-katsina' ), 'url' => get_permalink( $event ) ),
				array( 'event' => 'promotion_live', 'phone' => $s->customer_phone )
			);
		}
		return $event;
	}
}
