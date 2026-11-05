<?php
/**
 * The Business record: types, fields, validation, ownership.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Business {

	/** Rough bounding box around Katsina State (with a small margin). */
	const BOUNDS = array(
		'lat_min' => 10.8,
		'lat_max' => 13.6,
		'lng_min' => 6.5,
		'lng_max' => 9.5,
	);

	/** Centre used for the map picker. Katsina city. */
	const CENTRE = array( 12.9908, 7.6018 );

	const DAYS = array( 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun' );

	/**
	 * Business types. "group" = marketplace (has bookings) or directory (profile only).
	 */
	public static function types() {
		return array(
			'hotel'         => array(
				'label' => __( 'Hotel / Guest House', 'explore-katsina' ),
				'base'  => 'hotels',
				'group' => 'marketplace',
				'noun'  => __( 'Bookings', 'explore-katsina' ),
			),
			'restaurant'    => array(
				'label' => __( 'Restaurant / Eatery', 'explore-katsina' ),
				'base'  => 'restaurants',
				'group' => 'marketplace',
				'noun'  => __( 'Reservations', 'explore-katsina' ),
			),
			'event-centre'  => array(
				'label' => __( 'Event Centre', 'explore-katsina' ),
				'base'  => 'event-centres',
				'group' => 'marketplace',
				'noun'  => __( 'Bookings', 'explore-katsina' ),
			),
			'tour-operator' => array(
				'label' => __( 'Tour Operator', 'explore-katsina' ),
				'base'  => 'tour-operators',
				'group' => 'marketplace',
				'noun'  => __( 'Bookings', 'explore-katsina' ),
			),
			'transport'     => array(
				'label' => __( 'Transport & Car Hire', 'explore-katsina' ),
				'base'  => 'directory',
				'group' => 'directory',
				'noun'  => __( 'Enquiries', 'explore-katsina' ),
			),
			'crafts'        => array(
				'label' => __( 'Crafts & Souvenirs', 'explore-katsina' ),
				'base'  => 'directory',
				'group' => 'directory',
				'noun'  => __( 'Enquiries', 'explore-katsina' ),
			),
			'shopping'      => array(
				'label' => __( 'Shopping', 'explore-katsina' ),
				'base'  => 'directory',
				'group' => 'directory',
				'noun'  => __( 'Enquiries', 'explore-katsina' ),
			),
			'health'        => array(
				'label' => __( 'Health & Emergency', 'explore-katsina' ),
				'base'  => 'directory',
				'group' => 'directory',
				'noun'  => __( 'Enquiries', 'explore-katsina' ),
			),
			'banks'         => array(
				'label' => __( 'Banks & ATMs', 'explore-katsina' ),
				'base'  => 'directory',
				'group' => 'directory',
				'noun'  => __( 'Enquiries', 'explore-katsina' ),
			),
		);
	}

	public static function day_labels() {
		return array(
			'mon' => __( 'Monday', 'explore-katsina' ),
			'tue' => __( 'Tuesday', 'explore-katsina' ),
			'wed' => __( 'Wednesday', 'explore-katsina' ),
			'thu' => __( 'Thursday', 'explore-katsina' ),
			'fri' => __( 'Friday', 'explore-katsina' ),
			'sat' => __( 'Saturday', 'explore-katsina' ),
			'sun' => __( 'Sunday', 'explore-katsina' ),
		);
	}

	public static function status_label( $status ) {
		$labels = array(
			'pending'                     => __( 'Waiting for approval', 'explore-katsina' ),
			'publish'                     => __( 'Approved and live', 'explore-katsina' ),
			Post_Types::STATUS_REJECTED => __( 'Not approved', 'explore-katsina' ),
			Post_Types::STATUS_PAUSED   => __( 'Paused', 'explore-katsina' ),
		);
		return $labels[ $status ] ?? $status;
	}

	/* ------------------------------------------------------------------ */
	/* Ownership                                                            */
	/* ------------------------------------------------------------------ */

	public static function get( $business_id ) {
		$post = get_post( (int) $business_id );
		return ( $post && Post_Types::BUSINESS === $post->post_type ) ? $post : null;
	}

	public static function owner_id( $business_id ) {
		$post = self::get( $business_id );
		return $post ? (int) $post->post_author : 0;
	}

	/**
	 * THE access rule: a user may manage a business only if they own it.
	 * Site admins (manage_options) may manage everything.
	 */
	public static function user_can_manage( $user_id, $business_id ) {
		$user_id = (int) $user_id;
		if ( ! $user_id ) {
			return false;
		}
		$post = self::get( $business_id );
		if ( ! $post || 'trash' === $post->post_status ) {
			return false;
		}
		if ( user_can( $user_id, 'manage_options' ) ) {
			return true;
		}
		return (int) $post->post_author === $user_id;
	}

	/** @return \WP_Post[] */
	public static function for_user( $user_id ) {
		if ( ! $user_id ) {
			return array();
		}
		return get_posts(
			array(
				'post_type'      => Post_Types::BUSINESS,
				'post_status'    => array( 'pending', 'publish', Post_Types::STATUS_PAUSED, Post_Types::STATUS_REJECTED ),
				'author'         => (int) $user_id,
				'posts_per_page' => 50,
				'orderby'        => 'date',
				'order'          => 'ASC',
			)
		);
	}

	public static function type_of( $business_id ) {
		$terms = get_the_terms( (int) $business_id, Post_Types::TAX_TYPE );
		return ( $terms && ! is_wp_error( $terms ) ) ? $terms[0]->slug : '';
	}

	public static function lga_of( $business_id ) {
		$terms = get_the_terms( (int) $business_id, Post_Types::TAX_LGA );
		return ( $terms && ! is_wp_error( $terms ) ) ? $terms[0] : null;
	}

	/* ------------------------------------------------------------------ */
	/* Reading                                                              */
	/* ------------------------------------------------------------------ */

	public static function profile( $business_id ) {
		$post = self::get( $business_id );
		if ( ! $post ) {
			return array();
		}
		$id  = $post->ID;
		$lga = self::lga_of( $id );
		return array(
			'id'          => $id,
			'name'        => $post->post_title,
			'status'      => $post->post_status,
			'type'        => self::type_of( $id ),
			'lga_id'      => $lga ? $lga->term_id : 0,
			'lga'         => $lga ? $lga->name : '',
			'address'     => (string) get_post_meta( $id, '_ek_address', true ),
			'lat'         => (float) get_post_meta( $id, '_ek_lat', true ),
			'lng'         => (float) get_post_meta( $id, '_ek_lng', true ),
			'phone'       => (string) get_post_meta( $id, '_ek_phone', true ),
			'whatsapp'    => (string) get_post_meta( $id, '_ek_whatsapp', true ),
			'email'       => (string) get_post_meta( $id, '_ek_email', true ),
			'website'     => (string) get_post_meta( $id, '_ek_website', true ),
			'socials'     => wp_parse_args( (array) get_post_meta( $id, '_ek_socials', true ), array( 'facebook' => '', 'instagram' => '', 'x' => '', 'tiktok' => '' ) ),
			'hours'       => self::hours( $id ),
			'description' => $post->post_content,
			'photos'      => array_values( array_filter( array_map( 'intval', (array) get_post_meta( $id, '_ek_gallery', true ) ) ) ),
			'verified'    => (bool) get_post_meta( $id, '_ek_verified', true ),
			'url'         => get_permalink( $id ),
		);
	}

	public static function hours( $business_id ) {
		$saved = get_post_meta( (int) $business_id, '_ek_hours', true );
		$saved = is_array( $saved ) ? $saved : array();
		$out   = array( 'always' => ! empty( $saved['always'] ) );
		foreach ( self::DAYS as $day ) {
			$d           = $saved[ $day ] ?? array();
			$out[ $day ] = array(
				'closed' => ! empty( $d['closed'] ),
				'open'   => $d['open'] ?? '08:00',
				'close'  => $d['close'] ?? '22:00',
			);
		}
		return $out;
	}

	/** Is the business open at a moment (default now, Africa/Lagos)? Handles past-midnight closing. */
	public static function is_open( $business_id, $timestamp = null ) {
		$hours = self::hours( $business_id );
		if ( $hours['always'] ) {
			return true;
		}
		$tz   = new \DateTimeZone( 'Africa/Lagos' );
		$now  = new \DateTimeImmutable( '@' . ( $timestamp ?? time() ) );
		$now  = $now->setTimezone( $tz );
		$idx  = (int) $now->format( 'N' ) - 1;
		$time = $now->format( 'H:i' );

		$today = $hours[ self::DAYS[ $idx ] ];
		if ( ! $today['closed'] ) {
			if ( $today['open'] <= $today['close'] ) {
				if ( $time >= $today['open'] && $time < $today['close'] ) {
					return true;
				}
			} elseif ( $time >= $today['open'] ) {
				return true;
			}
		}
		$yesterday = $hours[ self::DAYS[ ( $idx + 6 ) % 7 ] ];
		return ! $yesterday['closed'] && $yesterday['open'] > $yesterday['close'] && $time < $yesterday['close'];
	}

	/* ------------------------------------------------------------------ */
	/* Validation                                                           */
	/* ------------------------------------------------------------------ */

	/** Nigerian phone → +234XXXXXXXXXX, or '' if invalid. */
	public static function normalize_phone( $raw ) {
		$digits = preg_replace( '/\D+/', '', (string) $raw );
		if ( preg_match( '/^0[789][01]\d{8}$/', $digits ) ) {
			return '+234' . substr( $digits, 1 );
		}
		if ( preg_match( '/^234[789][01]\d{8}$/', $digits ) ) {
			return '+' . $digits;
		}
		return '';
	}

	/** +2348031234567 → +234 803 123 4567 (for display). */
	public static function display_phone( $e164 ) {
		return preg_match( '/^\+234(\d{3})(\d{3})(\d{4})$/', (string) $e164, $m ) ? "+234 {$m[1]} {$m[2]} {$m[3]}" : (string) $e164;
	}

	public static function in_katsina( $lat, $lng ) {
		$b = self::BOUNDS;
		return is_numeric( $lat ) && is_numeric( $lng )
			&& $lat >= $b['lat_min'] && $lat <= $b['lat_max']
			&& $lng >= $b['lng_min'] && $lng <= $b['lng_max'];
	}

	private static function clean_url( $raw ) {
		$raw = trim( (string) $raw );
		if ( '' === $raw ) {
			return '';
		}
		if ( ! preg_match( '#^https?://#i', $raw ) ) {
			$raw = 'https://' . $raw;
		}
		$url = esc_url_raw( $raw, array( 'http', 'https' ) );
		return filter_var( $url, FILTER_VALIDATE_URL ) ? $url : '';
	}

	private static function clean_time( $raw, $default ) {
		return preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', (string) $raw ) ? $raw : $default;
	}

	/**
	 * Validate the public profile fields (shared by sign-up and dashboard).
	 *
	 * @param array $in      Raw (unslashed) input.
	 * @param bool  $is_new  Sign-up (type required) or edit (type cannot change).
	 * @return array{0: array, 1: array} [clean data, errors keyed by field]
	 */
	public static function validate_profile( array $in, $is_new ) {
		$e = array();
		$d = array();

		// The form field is "business_name": "name" is reserved by WordPress and would turn the page into a 404.
		$d['name'] = sanitize_text_field( $in['business_name'] ?? ( $in['name'] ?? '' ) );
		if ( mb_strlen( $d['name'] ) < 2 || mb_strlen( $d['name'] ) > 120 ) {
			$e['name'] = __( 'Enter the business name (2–120 characters).', 'explore-katsina' );
		}

		if ( $is_new ) {
			$d['type'] = sanitize_key( $in['type'] ?? '' );
			if ( ! isset( self::types()[ $d['type'] ] ) ) {
				$e['type'] = __( 'Choose a business type.', 'explore-katsina' );
			}
		}

		$d['lga_id'] = absint( $in['lga_id'] ?? 0 );
		$lga         = $d['lga_id'] ? get_term( $d['lga_id'], Post_Types::TAX_LGA ) : null;
		if ( ! $lga || is_wp_error( $lga ) ) {
			$e['lga_id'] = __( 'Choose the Local Government Area.', 'explore-katsina' );
		}

		$d['address'] = sanitize_textarea_field( $in['address'] ?? '' );
		if ( mb_strlen( $d['address'] ) < 5 ) {
			$e['address'] = __( 'Enter the full address, with a landmark if possible.', 'explore-katsina' );
		}

		$d['lat'] = isset( $in['lat'] ) && is_numeric( $in['lat'] ) ? round( (float) $in['lat'], 6 ) : null;
		$d['lng'] = isset( $in['lng'] ) && is_numeric( $in['lng'] ) ? round( (float) $in['lng'], 6 ) : null;
		if ( null === $d['lat'] || null === $d['lng'] || ! self::in_katsina( $d['lat'], $d['lng'] ) ) {
			$e['lat'] = __( 'Drag the pin to your exact location in Katsina State. The map and "Near me" search need it.', 'explore-katsina' );
		}

		$d['phone'] = self::normalize_phone( $in['phone'] ?? '' );
		if ( ! $d['phone'] ) {
			$e['phone'] = __( 'Enter a Nigerian phone number, e.g. 0803 123 4567.', 'explore-katsina' );
		}
		$d['whatsapp'] = '';
		if ( ! empty( $in['whatsapp'] ) ) {
			$d['whatsapp'] = self::normalize_phone( $in['whatsapp'] );
			if ( ! $d['whatsapp'] ) {
				$e['whatsapp'] = __( 'Enter a Nigerian WhatsApp number, or leave it empty.', 'explore-katsina' );
			}
		}

		$d['email'] = sanitize_email( $in['email'] ?? '' );
		if ( ! is_email( $d['email'] ) ) {
			$e['email'] = __( 'Enter a valid business email address.', 'explore-katsina' );
		}

		$d['website'] = self::clean_url( $in['website'] ?? '' );
		if ( ! empty( $in['website'] ) && ! $d['website'] ) {
			$e['website'] = __( 'Enter a valid website address, or leave it empty.', 'explore-katsina' );
		}
		$d['socials'] = array();
		foreach ( array( 'facebook', 'instagram', 'x', 'tiktok' ) as $net ) {
			$d['socials'][ $net ] = sanitize_text_field( $in['socials'][ $net ] ?? '' );
		}

		$hours           = (array) ( $in['hours'] ?? array() );
		$d['hours']      = array( 'always' => ! empty( $hours['always'] ) ? 1 : 0 );
		$any_open        = $d['hours']['always'];
		foreach ( self::DAYS as $day ) {
			$row              = (array) ( $hours[ $day ] ?? array() );
			$d['hours'][ $day ] = array(
				'closed' => ! empty( $row['closed'] ) ? 1 : 0,
				'open'   => self::clean_time( $row['open'] ?? '', '08:00' ),
				'close'  => self::clean_time( $row['close'] ?? '', '22:00' ),
			);
			$any_open = $any_open || ! $d['hours'][ $day ]['closed'];
		}
		if ( ! $any_open ) {
			$e['hours'] = __( 'Set your opening hours (at least one open day).', 'explore-katsina' );
		}

		$d['description'] = wp_kses( $in['description'] ?? '', array( 'p' => array(), 'br' => array(), 'strong' => array(), 'em' => array(), 'ul' => array(), 'ol' => array(), 'li' => array() ) );
		$len              = mb_strlen( trim( wp_strip_all_tags( $d['description'] ) ) );
		if ( $len < 40 || $len > 3000 ) {
			$e['description'] = __( 'Describe your business in 40–3,000 characters.', 'explore-katsina' );
		}

		return array( $d, $e );
	}

	/**
	 * Validate the private fields (owner, ID, bank).
	 *
	 * @return array{0: array, 1: array}
	 */
	public static function validate_private( array $in ) {
		$e = array();
		$d = array();

		$d['owner_name'] = sanitize_text_field( $in['owner_name'] ?? '' );
		if ( mb_strlen( $d['owner_name'] ) < 3 ) {
			$e['owner_name'] = __( "Enter the owner's full name.", 'explore-katsina' );
		}
		$d['cac_number'] = strtoupper( preg_replace( '/[^A-Za-z0-9]/', '', (string) ( $in['cac_number'] ?? '' ) ) );
		if ( strlen( $d['cac_number'] ) > 20 ) {
			$e['cac_number'] = __( 'That CAC number looks too long.', 'explore-katsina' );
		}
		$d['bank_name'] = sanitize_text_field( $in['bank_name'] ?? '' );
		if ( mb_strlen( $d['bank_name'] ) < 2 ) {
			$e['bank_name'] = __( 'Enter your bank name.', 'explore-katsina' );
		}
		$d['account_name'] = sanitize_text_field( $in['account_name'] ?? '' );
		if ( mb_strlen( $d['account_name'] ) < 3 ) {
			$e['account_name'] = __( 'Enter the account name exactly as the bank shows it.', 'explore-katsina' );
		}
		$d['account_number'] = preg_replace( '/\D/', '', (string) ( $in['account_number'] ?? '' ) );
		if ( ! preg_match( '/^\d{10}$/', $d['account_number'] ) ) {
			$e['account_number'] = __( 'Nigerian account numbers (NUBAN) have exactly 10 digits.', 'explore-katsina' );
		}
		return array( $d, $e );
	}

	/* ------------------------------------------------------------------ */
	/* Writing                                                              */
	/* ------------------------------------------------------------------ */

	/** Create a new pending business owned by $user_id. */
	public static function create( array $profile, $user_id ) {
		$id = wp_insert_post(
			array(
				'post_type'    => Post_Types::BUSINESS,
				'post_status'  => 'pending',
				'post_title'   => $profile['name'],
				'post_content' => $profile['description'],
				'post_author'  => (int) $user_id,
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		wp_set_object_terms( $id, $profile['type'], Post_Types::TAX_TYPE );
		self::save_profile_meta( $id, $profile );
		return $id;
	}

	/** Update profile fields. The business type never changes here. */
	public static function update( $business_id, array $profile ) {
		$res = wp_update_post(
			array(
				'ID'           => (int) $business_id,
				'post_title'   => $profile['name'],
				'post_content' => $profile['description'],
			),
			true
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		self::save_profile_meta( $business_id, $profile );
		return true;
	}

	private static function save_profile_meta( $id, array $p ) {
		wp_set_object_terms( $id, array( (int) $p['lga_id'] ), Post_Types::TAX_LGA );
		update_post_meta( $id, '_ek_address', $p['address'] );
		update_post_meta( $id, '_ek_lat', $p['lat'] );
		update_post_meta( $id, '_ek_lng', $p['lng'] );
		update_post_meta( $id, '_ek_phone', $p['phone'] );
		update_post_meta( $id, '_ek_whatsapp', $p['whatsapp'] );
		update_post_meta( $id, '_ek_email', $p['email'] );
		update_post_meta( $id, '_ek_website', $p['website'] );
		update_post_meta( $id, '_ek_socials', $p['socials'] );
		update_post_meta( $id, '_ek_hours', $p['hours'] );
	}

	public static function set_photos( $business_id, array $attachment_ids ) {
		$ids = array_values( array_unique( array_filter( array_map( 'intval', $attachment_ids ) ) ) );
		update_post_meta( $business_id, '_ek_gallery', $ids );
		if ( $ids ) {
			set_post_thumbnail( $business_id, $ids[0] );
		} else {
			delete_post_thumbnail( $business_id );
		}
	}

	public static function max_photos( $business_id ) {
		// Featured/Premium plans raise this in Phase 9.
		return (int) apply_filters( 'ek_max_photos', (int) Settings::get( 'max_photos_basic' ), $business_id );
	}

	/* ------------------------------------------------------------------ */
	/* Private details (owner, ID, bank)                                    */
	/* ------------------------------------------------------------------ */

	public static function save_private( $business_id, array $p, array $extra = array() ) {
		global $wpdb;
		$row = array_merge(
			array(
				'business_id'        => (int) $business_id,
				'owner_name'         => $p['owner_name'],
				'cac_number'         => $p['cac_number'],
				'bank_name'          => $p['bank_name'],
				'account_name_enc'   => Crypto::encrypt( $p['account_name'] ),
				'account_number_enc' => Crypto::encrypt( $p['account_number'] ),
				'account_last4'      => substr( $p['account_number'], -4 ),
				'updated_at'         => current_time( 'mysql', true ),
			),
			$extra
		);
		$exists = $wpdb->get_var( $wpdb->prepare( "SELECT business_id FROM {$wpdb->prefix}ek_business_private WHERE business_id = %d", $business_id ) );
		if ( $exists ) {
			return false !== $wpdb->update( $wpdb->prefix . 'ek_business_private', $row, array( 'business_id' => (int) $business_id ) );
		}
		return false !== $wpdb->insert( $wpdb->prefix . 'ek_business_private', $row );
	}

	public static function update_private_columns( $business_id, array $columns ) {
		global $wpdb;
		$columns['updated_at'] = current_time( 'mysql', true );
		return false !== $wpdb->update( $wpdb->prefix . 'ek_business_private', $columns, array( 'business_id' => (int) $business_id ) );
	}

	/**
	 * @param bool $decrypt Only true for the site admin or the owner's own payout screen.
	 */
	public static function private_details( $business_id, $decrypt = false ) {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_business_private WHERE business_id = %d", $business_id ), ARRAY_A );
		if ( ! $row ) {
			return array();
		}
		if ( $decrypt ) {
			$row['account_name']   = Crypto::decrypt( $row['account_name_enc'] );
			$row['account_number'] = Crypto::decrypt( $row['account_number_enc'] );
		}
		unset( $row['account_name_enc'], $row['account_number_enc'] );
		return $row;
	}
}
