<?php
/**
 * Explore Katsina's own tours (100% revenue): e.g. a city tour, a Durbar package, a Daura day trip.
 * Added in wp-admin → Tours with price per person, group size, pickup point and dates (departures)
 * with seats. Guests book and pay online; seats are held for 15 minutes so a tour is never overbooked.
 * Guests can cancel online for a full refund until 48 hours before departure (a setting).
 * No tour descriptions are invented: you write them (Phase 10 adds researched content).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Tours {

	const CPT = 'ek_tour';

	public static $error  = '';
	public static $values = array();

	public static function init() {
		add_action( 'init', array( __CLASS__, 'register' ), 6 );
		add_action( 'add_meta_boxes', array( __CLASS__, 'meta_box' ) );
		add_action( 'save_post_' . self::CPT, array( __CLASS__, 'save' ), 10, 2 );
		add_filter( 'the_content', array( __CLASS__, 'details' ) );
		add_shortcode( 'ek_tours', array( __CLASS__, 'list_page' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle_book' ), 8 );
		add_action( 'ek_sale_released', array( __CLASS__, 'release' ) );
		add_filter( 'ek_sale_retake', array( __CLASS__, 'retake' ), 10, 2 );
		add_filter( 'ek_sale_guest_can_cancel', array( __CLASS__, 'can_cancel' ), 10, 2 );
		add_filter( 'ek_sale_email_lines', array( __CLASS__, 'email_lines' ), 10, 2 );
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
					'name'          => __( 'Tours', 'explore-katsina' ),
					'singular_name' => __( 'Tour', 'explore-katsina' ),
					'add_new_item'  => __( 'Add tour', 'explore-katsina' ),
					'edit_item'     => __( 'Edit tour', 'explore-katsina' ),
				),
				'public'       => true,
				'show_in_rest' => true,
				'has_archive'  => false,
				'rewrite'      => array( 'slug' => 'tours' ),
				'menu_icon'    => 'dashicons-palmtree',
				'supports'     => array( 'title', 'editor', 'thumbnail', 'excerpt' ),
			)
		);
	}

	public static function data( $id ) {
		return array(
			'price'    => (int) get_post_meta( $id, '_ek_price_kobo', true ),
			'group'    => (int) get_post_meta( $id, '_ek_group_size', true ),
			'pickup'   => (string) get_post_meta( $id, '_ek_pickup', true ),
			'duration' => (string) get_post_meta( $id, '_ek_duration', true ),
			'includes' => (string) get_post_meta( $id, '_ek_includes', true ),
		);
	}

	public static function departures( $tour_id, $upcoming = true ) {
		global $wpdb;
		$today = Availability::today();
		$w     = $upcoming ? $wpdb->prepare( 'AND depart_date >= %s', $today ) : '';
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_tour_departures WHERE tour_id = %d {$w} ORDER BY depart_date, depart_time", $tour_id ) ); // phpcs:ignore
	}

	public static function departure( $id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_tour_departures WHERE id = %d", $id ) );
	}

	public static function seats_left( $dep ) {
		return max( 0, (int) $dep->seats - (int) $dep->taken );
	}

	public static function price_of( $dep ) {
		return (int) $dep->price_kobo ? (int) $dep->price_kobo : self::data( $dep->tour_id )['price'];
	}

	/** Departure time as a Unix timestamp (Lagos). */
	public static function starts_at( $dep ) {
		return ( new \DateTimeImmutable( $dep->depart_date . ' ' . ( $dep->depart_time ? substr( $dep->depart_time, 0, 5 ) : '08:00' ), Availability::tz() ) )->getTimestamp();
	}

	/* ---------------- wp-admin ---------------- */

	public static function meta_box() {
		add_meta_box( 'ek-tour', __( 'Price, group size, pickup and dates', 'explore-katsina' ), array( __CLASS__, 'render_box' ), self::CPT, 'normal', 'high' );
	}

	public static function render_box( $post ) {
		$d = self::data( $post->ID );
		wp_nonce_field( 'ek_tour_save', 'ek_tour_nonce' );
		?>
		<p><label><strong><?php esc_html_e( 'Price per person (₦)', 'explore-katsina' ); ?></strong><br><input type="text" inputmode="decimal" name="ek_price" value="<?php echo $d['price'] ? esc_attr( (string) ( $d['price'] / 100 ) ) : ''; ?>"></label></p>
		<p><label><strong><?php esc_html_e( 'Maximum group size (seats per date)', 'explore-katsina' ); ?></strong><br><input type="number" min="1" name="ek_group" value="<?php echo $d['group'] ? (int) $d['group'] : ''; ?>"></label></p>
		<p><label><strong><?php esc_html_e( 'Pickup point', 'explore-katsina' ); ?></strong><br><input type="text" class="large-text" name="ek_pickup" value="<?php echo esc_attr( $d['pickup'] ); ?>"></label></p>
		<p><label><strong><?php esc_html_e( 'Duration', 'explore-katsina' ); ?></strong><br><input type="text" name="ek_duration" value="<?php echo esc_attr( $d['duration'] ); ?>" placeholder="<?php esc_attr_e( 'e.g. 6 hours', 'explore-katsina' ); ?>"></label></p>
		<p><label><strong><?php esc_html_e( "What's included", 'explore-katsina' ); ?></strong><br><textarea name="ek_includes" rows="3" class="large-text"><?php echo esc_textarea( $d['includes'] ); ?></textarea></label></p>
		<h3><?php esc_html_e( 'Dates', 'explore-katsina' ); ?></h3>
		<p class="description"><?php esc_html_e( 'Add each date the tour runs. Seats default to the group size and the price to the price above. Dates with bookings cannot be deleted; set them to "closed" instead.', 'explore-katsina' ); ?></p>
		<table class="widefat striped" style="max-width:860px">
			<thead><tr><th><?php esc_html_e( 'Date', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Time', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Seats', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Price (₦, optional)', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Booked', 'explore-katsina' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( array_merge( self::departures( $post->ID, false ), array_fill( 0, 4, null ) ) as $i => $r ) : ?>
				<tr>
					<td><input type="hidden" name="ek_dep[<?php echo (int) $i; ?>][id]" value="<?php echo $r ? (int) $r->id : ''; ?>"><input type="date" name="ek_dep[<?php echo (int) $i; ?>][date]" value="<?php echo esc_attr( $r->depart_date ?? '' ); ?>"></td>
					<td><input type="time" name="ek_dep[<?php echo (int) $i; ?>][time]" value="<?php echo esc_attr( $r ? substr( (string) $r->depart_time, 0, 5 ) : '' ); ?>"></td>
					<td><input type="number" min="0" name="ek_dep[<?php echo (int) $i; ?>][seats]" value="<?php echo $r ? (int) $r->seats : ''; ?>" style="width:6em"></td>
					<td><input type="text" inputmode="decimal" name="ek_dep[<?php echo (int) $i; ?>][price]" value="<?php echo $r && $r->price_kobo ? esc_attr( (string) ( $r->price_kobo / 100 ) ) : ''; ?>" style="width:8em"></td>
					<td><select name="ek_dep[<?php echo (int) $i; ?>][status]"><option value="open" <?php selected( $r->status ?? 'open', 'open' ); ?>><?php esc_html_e( 'Open', 'explore-katsina' ); ?></option><option value="closed" <?php selected( $r->status ?? '', 'closed' ); ?>><?php esc_html_e( 'Closed', 'explore-katsina' ); ?></option></select></td>
					<td><?php echo $r ? (int) $r->taken : '—'; ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table>
		<?php
	}

	public static function save( $id, $post ) {
		if ( ! isset( $_POST['ek_tour_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['ek_tour_nonce'] ) ), 'ek_tour_save' ) || ! current_user_can( 'edit_post', $id ) || wp_is_post_revision( $id ) ) {
			return;
		}
		$in = wp_unslash( $_POST );
		update_post_meta( $id, '_ek_price_kobo', Money::to_kobo( $in['ek_price'] ?? '0' ) );
		update_post_meta( $id, '_ek_group_size', absint( $in['ek_group'] ?? 0 ) );
		update_post_meta( $id, '_ek_pickup', sanitize_text_field( $in['ek_pickup'] ?? '' ) );
		update_post_meta( $id, '_ek_duration', sanitize_text_field( $in['ek_duration'] ?? '' ) );
		update_post_meta( $id, '_ek_includes', sanitize_textarea_field( $in['ek_includes'] ?? '' ) );
		self::save_departures( $id, (array) ( $in['ek_dep'] ?? array() ) );
	}

	public static function save_departures( $tour_id, array $rows ) {
		global $wpdb;
		$t     = $wpdb->prefix . 'ek_tour_departures';
		$group = max( 1, (int) get_post_meta( $tour_id, '_ek_group_size', true ) );
		foreach ( $rows as $r ) {
			$id   = absint( $r['id'] ?? 0 );
			$date = sanitize_text_field( $r['date'] ?? '' );
			$time = preg_match( '/^\d{2}:\d{2}$/', (string) ( $r['time'] ?? '' ) ) ? $r['time'] . ':00' : null;
			$row  = array(
				'tour_id'     => (int) $tour_id,
				'depart_date' => $date,
				'depart_time' => $time,
				'seats'       => '' === (string) ( $r['seats'] ?? '' ) ? $group : absint( $r['seats'] ),
				'price_kobo'  => Money::to_kobo( $r['price'] ?? '0' ),
				'status'      => 'closed' === ( $r['status'] ?? '' ) ? 'closed' : 'open',
			);
			if ( $id ) {
				$old = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d AND tour_id = %d", $id, $tour_id ) );
				if ( ! $old ) {
					continue;
				}
				if ( ! Availability::valid_date( $date ) ) {
					if ( ! (int) $old->taken ) {
						$wpdb->delete( $t, array( 'id' => $id ) );
					}
					continue;
				}
				$row['seats'] = max( (int) $old->taken, $row['seats'] );
				$wpdb->update( $t, $row, array( 'id' => $id ) );
			} elseif ( Availability::valid_date( $date ) ) {
				$wpdb->insert( $t, $row );
			}
		}
	}

	/* ---------------- Booking ---------------- */

	/** @return object|\WP_Error The sale. */
	public static function book( $departure_id, $people, $name, $email, $phone, $uid = 0 ) {
		global $wpdb;
		$people = absint( $people );
		$phone  = Business::normalize_phone( $phone );
		if ( $people < 1 ) {
			return new \WP_Error( 'people', __( 'Choose how many people.', 'explore-katsina' ) );
		}
		if ( mb_strlen( trim( (string) $name ) ) < 2 || ! is_email( $email ) || ! $phone ) {
			return new \WP_Error( 'details', __( 'Enter your name, a valid email and a Nigerian phone number.', 'explore-katsina' ) );
		}
		$t = $wpdb->prefix . 'ek_tour_departures';
		$wpdb->query( 'START TRANSACTION' );
		$dep = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d FOR UPDATE", $departure_id ) );
		if ( ! $dep || 'open' !== $dep->status || 'publish' !== get_post_status( $dep->tour_id ) || self::starts_at( $dep ) <= time() ) {
			$wpdb->query( 'ROLLBACK' );
			return new \WP_Error( 'closed', __( 'That date is not available.', 'explore-katsina' ) );
		}
		if ( self::seats_left( $dep ) < $people ) {
			$wpdb->query( 'ROLLBACK' );
			/* translators: %d: seats */
			return new \WP_Error( 'full', sprintf( _n( 'Only %d seat is left on that date.', 'Only %d seats are left on that date.', self::seats_left( $dep ), 'explore-katsina' ), self::seats_left( $dep ) ) );
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET taken = taken + %d WHERE id = %d", $people, $dep->id ) );
		$wpdb->query( 'COMMIT' );
		$d = self::data( $dep->tour_id );
		return Sales::create(
			array(
				'kind'        => 'tour',
				'object_id'   => (int) $dep->tour_id,
				'item_id'     => (int) $dep->id,
				'quantity'    => $people,
				'amount_kobo' => self::price_of( $dep ) * $people,
				'name'        => sanitize_text_field( $name ),
				'email'       => sanitize_email( $email ),
				'phone'       => $phone,
				'customer_id' => $uid,
				'hold'        => true,
				'details'     => array(
					'title'  => get_the_title( $dep->tour_id ),
					'date'   => $dep->depart_date,
					'time'   => $dep->depart_time ? substr( $dep->depart_time, 0, 5 ) : '',
					'pickup' => $d['pickup'],
					'each'   => self::price_of( $dep ),
				),
			)
		);
	}

	public static function handle_book() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'book_tour' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$in           = wp_unslash( $_POST ); // phpcs:ignore
		self::$values = $in;
		$tour         = absint( $in['tour_id'] ?? 0 );
		if ( ! wp_verify_nonce( $in['_ek_nonce'] ?? '', 'ek_book_tour_' . $tour ) || ! empty( $in['ek_company_hp'] ) ) {
			self::$error = __( 'Your session expired. Please try again.', 'explore-katsina' );
			return;
		}
		$dep = self::departure( absint( $in['departure'] ?? 0 ) );
		if ( ! $dep || (int) $dep->tour_id !== $tour ) {
			self::$error = __( 'Choose a date.', 'explore-katsina' );
			return;
		}
		$s = self::book( $dep->id, $in['people'] ?? 0, $in['guest_name'] ?? '', $in['guest_email'] ?? '', $in['guest_phone'] ?? '', get_current_user_id() );
		if ( is_wp_error( $s ) ) {
			self::$error = $s->get_error_message();
			return;
		}
		$url = Sales::pay_url( $s );
		if ( is_wp_error( $url ) ) {
			Sales::payment_failed( $s->id );
			self::$error = $url->get_error_message();
			return;
		}
		wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect
		exit;
	}

	public static function release( $s ) {
		global $wpdb;
		if ( 'tour' === $s->kind && $s->item_id ) {
			$wpdb->query( $wpdb->prepare( "UPDATE {$wpdb->prefix}ek_tour_departures SET taken = GREATEST(0, taken - %d) WHERE id = %d", (int) $s->quantity, (int) $s->item_id ) );
		}
	}

	public static function retake( $ok, $s ) {
		global $wpdb;
		if ( 'tour' !== $s->kind ) {
			return $ok;
		}
		$t = $wpdb->prefix . 'ek_tour_departures';
		$wpdb->query( 'START TRANSACTION' );
		$dep = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$t} WHERE id = %d FOR UPDATE", (int) $s->item_id ) );
		if ( ! $dep || self::seats_left( $dep ) < (int) $s->quantity ) {
			$wpdb->query( 'ROLLBACK' );
			return new \WP_Error( 'full', 'Full' );
		}
		$wpdb->query( $wpdb->prepare( "UPDATE {$t} SET taken = taken + %d WHERE id = %d", (int) $s->quantity, $dep->id ) );
		$wpdb->query( 'COMMIT' );
		return true;
	}

	/** Full refund until N hours (setting, default 48) before departure. */
	public static function can_cancel( $ok, $s, $now = null ) {
		if ( 'tour' !== $s->kind ) {
			return $ok;
		}
		$dep = self::departure( $s->item_id );
		if ( 'paid' !== $s->status || ! $dep ) {
			return new \WP_Error( 'status', __( 'This booking cannot be cancelled online.', 'explore-katsina' ) );
		}
		if ( self::starts_at( $dep ) - ( $now ?? time() ) < (int) Settings::get( 'tour_cancel_hours' ) * HOUR_IN_SECONDS ) {
			/* translators: %d: hours */
			return new \WP_Error( 'late', sprintf( __( 'Online cancellation closes %d hours before departure. Please contact us.', 'explore-katsina' ), (int) Settings::get( 'tour_cancel_hours' ) ) );
		}
		return true;
	}

	public static function email_lines( $lines, $s ) {
		if ( 'tour' === $s->kind ) {
			$lines[] = __( 'Date:', 'explore-katsina' ) . ' ' . wp_date( 'l j F Y', strtotime( $s->details['date'] . ' 12:00' ) ) . ( $s->details['time'] ? ', ' . $s->details['time'] : '' );
			/* translators: %d: people */
			$lines[] = sprintf( _n( '%d person', '%d people', (int) $s->quantity, 'explore-katsina' ), (int) $s->quantity );
			if ( $s->details['pickup'] ) {
				$lines[] = __( 'Pickup point:', 'explore-katsina' ) . ' ' . $s->details['pickup'];
			}
		}
		return $lines;
	}

	/* ---------------- Public ---------------- */

	public static function details( $content ) {
		if ( ! is_singular( self::CPT ) || ! in_the_loop() || ! is_main_query() ) {
			return $content;
		}
		$id = get_the_ID();
		return $content . View::render( 'public/tour', array( 'id' => $id, 'd' => self::data( $id ), 'deps' => self::departures( $id ), 'error' => self::$error, 'v' => self::$values ) );
	}

	public static function list_page() {
		wp_enqueue_style( 'ek' );
		$ids = get_posts( array( 'post_type' => self::CPT, 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => 50, 'orderby' => 'menu_order title', 'order' => 'ASC' ) );
		return View::render( 'public/tours', array( 'ids' => $ids ) );
	}
}
