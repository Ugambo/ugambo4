<?php
/**
 * Front-end business dashboard: [ek_business_dashboard]
 * Rendered in its own branded app shell (no theme chrome, no wp-admin).
 *
 * Security rule used everywhere here: Business::user_can_manage( current user, business ).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Dashboard {

	/** @var array Errors for the profile form when re-displayed. */
	private static $form = array(
		'errors' => array(),
		'values' => array(),
	);

	public static function sections( $type = '' ) {
		$noun = Business::types()[ $type ]['noun'] ?? __( 'Bookings', 'explore-katsina' );
		$base = array(
			'overview'  => __( 'Overview', 'explore-katsina' ),
			'profile'   => __( 'Profile', 'explore-katsina' ),
			'photos'    => __( 'Photos', 'explore-katsina' ),
			'bookings'  => $noun,
			'earnings'  => __( 'Earnings', 'explore-katsina' ),
			'payouts'   => __( 'Payouts', 'explore-katsina' ),
			'invoices'  => __( 'Invoices', 'explore-katsina' ),
			'plan'      => __( 'Plan & Verified', 'explore-katsina' ),
			'reviews'   => __( 'Reviews', 'explore-katsina' ),
			'ranking'   => __( 'Ranking', 'explore-katsina' ),
			'analytics' => __( 'Analytics', 'explore-katsina' ),
		);
		/** Business types add their own sections (e.g. hotels: Hotel details, Rooms, Calendar). */
		return apply_filters( 'ek_dashboard_sections', $base, $type );
	}

	public static function init() {
		add_shortcode( 'ek_business_dashboard', array( __CLASS__, 'shortcode' ) );
		add_action( 'template_redirect', array( __CLASS__, 'handle' ), 6 );
		add_filter( 'template_include', array( __CLASS__, 'app_shell' ), 99 );
		add_filter( 'body_class', array( __CLASS__, 'body_class' ) );
	}

	public static function is_dashboard_page() {
		$id = Install::page_id( 'dashboard' );
		return $id && is_page( $id );
	}

	public static function app_shell( $template ) {
		if ( self::is_dashboard_page() ) {
			nocache_headers();
			return EK_DIR . 'templates/app-shell.php';
		}
		return $template;
	}

	public static function body_class( $classes ) {
		if ( self::is_dashboard_page() ) {
			$classes[] = 'ek-app-body';
		}
		return $classes;
	}

	public static function url( $section = 'overview', $business_id = 0, array $args = array() ) {
		$args = array_merge(
			array_filter(
				array(
					'section'  => 'overview' === $section ? '' : $section,
					'business' => $business_id ? (int) $business_id : '',
				)
			),
			$args
		);
		return add_query_arg( $args, Install::page_url( 'dashboard' ) );
	}

	/** The business currently being managed, after the ownership check. */
	public static function current_business() {
		$uid = get_current_user_id();
		if ( ! $uid ) {
			return 0;
		}
		$requested = absint( $_GET['business'] ?? ( $_POST['business_id'] ?? 0 ) ); // phpcs:ignore WordPress.Security.NonceVerification
		if ( $requested ) {
			return Business::user_can_manage( $uid, $requested ) ? $requested : -1; // -1 = forbidden.
		}
		$mine = Business::for_user( $uid );
		return $mine ? (int) $mine[0]->ID : 0;
	}

	public static function current_section( $type = '' ) {
		$s = sanitize_key( $_GET['section'] ?? 'overview' ); // phpcs:ignore WordPress.Security.NonceVerification
		return isset( self::sections( $type )[ $s ] ) ? $s : 'overview';
	}

	/* ------------------------------------------------------------------ */
	/* POST handlers (Post/Redirect/Get)                                    */
	/* ------------------------------------------------------------------ */

	public static function handle() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) ) {
			return;
		}
		$action = sanitize_key( $_POST['ek_action'] ?? '' ); // phpcs:ignore WordPress.Security.NonceVerification
		if ( 0 !== strpos( $action, 'dash_' ) ) {
			return;
		}
		$uid         = get_current_user_id();
		$business_id = absint( $_POST['business_id'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification
		$nonce       = sanitize_text_field( wp_unslash( $_POST['_ek_nonce'] ?? '' ) );

		if ( ! $uid || ! Business::user_can_manage( $uid, $business_id ) ) {
			wp_die( esc_html__( 'You can only manage your own business.', 'explore-katsina' ), '', array( 'response' => 403 ) );
		}
		if ( ! wp_verify_nonce( $nonce, $action . '_' . $business_id ) ) {
			View::flash( 'error', __( 'Your session expired. Please try again.', 'explore-katsina' ), $uid );
			wp_safe_redirect( wp_get_referer() ? wp_get_referer() : self::url( 'overview', $business_id ) );
			exit;
		}

		$in       = wp_unslash( $_POST ); // phpcs:ignore WordPress.Security.NonceVerification
		$redirect = null;

		switch ( $action ) {
			case 'dash_profile':
				$redirect = self::save_profile( $business_id, $in, $uid );
				break;
			case 'dash_photos':
				$redirect = self::save_photos( $business_id, $in, $uid );
				break;
			case 'dash_bank':
				$redirect = self::save_bank( $business_id, $in, $uid );
				break;
			case 'dash_payout':
				$amount = Money::to_kobo( $in['amount'] ?? '' );
				$res    = Money::request_payout( $business_id, $amount, $uid );
				if ( is_wp_error( $res ) ) {
					View::flash( 'error', $res->get_error_message(), $uid );
				} else {
					View::flash( 'ok', __( 'Payout requested. We will process it and you will see the status here.', 'explore-katsina' ), $uid );
				}
				$redirect = self::url( 'payouts', $business_id );
				break;
			case 'dash_invoice_pay':
			case 'dash_invoice_balance':
				$inv_id = absint( $in['invoice_id'] ?? 0 );
				$res    = 'dash_invoice_balance' === $action ? Invoices::pay_from_balance( $inv_id, $business_id, $uid ) : Invoices::pay_online( $inv_id, $business_id );
				if ( is_wp_error( $res ) ) {
					View::flash( 'error', $res->get_error_message(), $uid );
				} elseif ( is_string( $res ) ) {
					wp_redirect( $res ); // phpcs:ignore WordPress.Security.SafeRedirect -- payment page.
					exit;
				} else {
					View::flash( 'ok', __( 'Invoice paid. Thank you! A receipt is on its way by email.', 'explore-katsina' ), $uid );
				}
				$redirect = self::url( 'invoices', $business_id );
				break;
			case 'dash_plan_buy':
			case 'dash_verify_apply':
				$sale = 'dash_plan_buy' === $action ? Plans::buy( $business_id, sanitize_key( $in['plan'] ?? '' ), sanitize_key( $in['period'] ?? '' ), $uid ) : Services::apply_verified( $business_id, $uid );
				$url  = is_wp_error( $sale ) ? $sale : Sales::pay_url( $sale );
				if ( is_wp_error( $url ) ) {
					View::flash( 'error', $url->get_error_message(), $uid );
					$redirect = self::url( 'plan', $business_id );
					break;
				}
				wp_redirect( $url ); // phpcs:ignore WordPress.Security.SafeRedirect -- payment page.
				exit;
			case 'dash_reply':
				$res = Reviews::reply( absint( $in['review_id'] ?? 0 ), $business_id, $in['reply'] ?? '' );
				View::flash( is_wp_error( $res ) ? 'error' : 'ok', is_wp_error( $res ) ? $res->get_error_message() : __( 'Your reply is published.', 'explore-katsina' ), $uid );
				$redirect = self::url( 'reviews', $business_id );
				break;
			case 'dash_resubmit':
				if ( Post_Types::STATUS_REJECTED === get_post_status( $business_id ) ) {
					wp_update_post( array( 'ID' => $business_id, 'post_status' => 'pending' ) );
					Log::add( 'resubmitted', 'business', $business_id );
					Emails::business_submitted( $business_id );
					View::flash( 'ok', __( 'Thank you. Your business has been sent for approval again.', 'explore-katsina' ), $uid );
				}
				$redirect = self::url( 'overview', $business_id );
				break;
			default:
				// Type-specific actions (rooms, calendar, bookings…). Ownership is already checked above.
				$redirect = apply_filters( 'ek_dashboard_action', null, $action, $business_id, $in, $uid );
		}

		if ( $redirect ) {
			wp_safe_redirect( $redirect );
			exit;
		}
	}

	private static function save_profile( $business_id, array $in, $uid ) {
		list( $profile, $errors ) = Business::validate_profile( $in, false );
		if ( $errors ) {
			self::$form = array(
				'errors' => $errors,
				'values' => $in,
			);
			return null; // Re-render the form with errors (no redirect).
		}
		$before = Business::profile( $business_id );
		Business::update( $business_id, $profile );
		$changed = array();
		foreach ( array( 'name', 'lga_id', 'address', 'lat', 'lng', 'phone', 'whatsapp', 'email', 'website' ) as $k ) {
			if ( (string) $before[ $k ] !== (string) $profile[ $k ] ) {
				$changed[] = $k;
			}
		}
		if ( $changed ) {
			Log::add( 'profile_updated', 'business', $business_id, '', array( 'fields' => $changed ) );
		}
		View::flash( 'ok', __( 'Profile saved.', 'explore-katsina' ), $uid );
		return self::url( 'profile', $business_id );
	}

	private static function save_photos( $business_id, array $in, $uid ) {
		$current = Business::profile( $business_id )['photos'];
		$op      = sanitize_key( $in['op'] ?? '' );
		$photo   = absint( $in['photo'] ?? 0 );

		if ( in_array( $op, array( 'delete', 'cover', 'left', 'right' ), true ) ) {
			if ( ! in_array( $photo, $current, true ) || ! Photos::owned_by( $photo, $business_id ) ) {
				View::flash( 'error', __( 'That photo does not belong to this business.', 'explore-katsina' ), $uid );
				return self::url( 'photos', $business_id );
			}
			$i = array_search( $photo, $current, true );
			if ( 'delete' === $op ) {
				if ( count( $current ) <= 1 ) {
					View::flash( 'error', __( 'Keep at least one photo. Upload a new one first, then delete this.', 'explore-katsina' ), $uid );
					return self::url( 'photos', $business_id );
				}
				array_splice( $current, $i, 1 );
				wp_delete_attachment( $photo, true );
				View::flash( 'ok', __( 'Photo deleted.', 'explore-katsina' ), $uid );
			} elseif ( 'cover' === $op ) {
				array_splice( $current, $i, 1 );
				array_unshift( $current, $photo );
				View::flash( 'ok', __( 'Cover photo changed.', 'explore-katsina' ), $uid );
			} elseif ( 'left' === $op && $i > 0 ) {
				list( $current[ $i - 1 ], $current[ $i ] ) = array( $current[ $i ], $current[ $i - 1 ] );
			} elseif ( 'right' === $op && $i < count( $current ) - 1 ) {
				list( $current[ $i + 1 ], $current[ $i ] ) = array( $current[ $i ], $current[ $i + 1 ] );
			}
			Business::set_photos( $business_id, $current );
			return self::url( 'photos', $business_id );
		}

		// Upload.
		$room = Business::max_photos( $business_id ) - count( $current );
		if ( $room <= 0 ) {
			View::flash( 'warn', __( 'You have reached the photo limit for your plan. Delete a photo first, or upgrade to Featured for more photos.', 'explore-katsina' ), $uid );
			return self::url( 'photos', $business_id );
		}
		$res = Photos::upload_many( 'photos', $business_id, $room );
		Business::set_photos( $business_id, array_merge( $current, $res['ids'] ) );
		if ( $res['ids'] ) {
			/* translators: %d: number */
			View::flash( 'ok', sprintf( _n( '%d photo added.', '%d photos added.', count( $res['ids'] ), 'explore-katsina' ), count( $res['ids'] ) ), $uid );
		}
		foreach ( $res['errors'] as $msg ) {
			View::flash( 'warn', $msg, $uid );
		}
		if ( ! $res['ids'] && ! $res['errors'] ) {
			View::flash( 'warn', __( 'Choose at least one photo to upload.', 'explore-katsina' ), $uid );
		}
		return self::url( 'photos', $business_id );
	}

	private static function save_bank( $business_id, array $in, $uid ) {
		$user = get_userdata( $uid );
		// Changing where money goes requires the account password (protects against a stolen session).
		if ( ! user_can( $uid, 'manage_options' ) && ( ! $user || ! wp_check_password( (string) ( $in['current_password'] ?? '' ), $user->user_pass, $uid ) ) ) {
			View::flash( 'error', __( 'Your password was not correct, so bank details were not changed.', 'explore-katsina' ), $uid );
			return self::url( 'payouts', $business_id );
		}
		$existing             = Business::private_details( $business_id );
		$in['owner_name']     = $existing['owner_name'] ?? '';
		$in['cac_number']     = $existing['cac_number'] ?? '';
		list( $p, $errors )   = Business::validate_private( $in );
		unset( $errors['owner_name'], $errors['cac_number'] );
		if ( $errors ) {
			foreach ( $errors as $msg ) {
				View::flash( 'error', $msg, $uid );
			}
			return self::url( 'payouts', $business_id );
		}
		Business::update_private_columns(
			$business_id,
			array(
				'bank_name'          => $p['bank_name'],
				'account_name_enc'   => Crypto::encrypt( $p['account_name'] ),
				'account_number_enc' => Crypto::encrypt( $p['account_number'] ),
				'account_last4'      => substr( $p['account_number'], -4 ),
			)
		);
		Log::add( 'bank_updated', 'business', $business_id, '', array( 'last4' => substr( $p['account_number'], -4 ) ) );
		$profile = Business::profile( $business_id );
		Emails::send(
			Emails::admin_email(),
			/* translators: %s: business */
			sprintf( __( 'Bank details changed: %s', 'explore-katsina' ), $profile['name'] ),
			__( 'A business changed its payout bank details', 'explore-katsina' ),
			/* translators: 1: business, 2: bank */
			array( sprintf( __( '%1$s changed payout details to %2$s, account ending %3$s. Check this before approving the next payout.', 'explore-katsina' ), $profile['name'], $p['bank_name'], substr( $p['account_number'], -4 ) ) ),
			array(),
			array( 'event' => 'admin_bank_changed' )
		);
		if ( $user ) {
			Emails::send(
				$user->user_email,
				__( 'Your payout bank details were changed', 'explore-katsina' ),
				__( 'Bank details changed', 'explore-katsina' ),
				/* translators: %s: last 4 digits */
				array( sprintf( __( 'Your payout account is now the account ending %s. If you did not make this change, contact us immediately.', 'explore-katsina' ), substr( $p['account_number'], -4 ) ) ),
				array(),
				array( 'event' => 'bank_changed' )
			);
		}
		View::flash( 'ok', __( 'Bank details updated.', 'explore-katsina' ), $uid );
		return self::url( 'payouts', $business_id );
	}

	/* ------------------------------------------------------------------ */
	/* Rendering                                                            */
	/* ------------------------------------------------------------------ */

	public static function shortcode() {
		wp_enqueue_style( 'ek' );
		wp_enqueue_script( 'ek-forms' );

		if ( ! is_user_logged_in() ) {
			return View::render( 'dashboard/login' );
		}
		$uid         = get_current_user_id();
		$business_id = self::current_business();

		if ( -1 === $business_id ) {
			status_header( 403 );
			return View::render( 'dashboard/forbidden' );
		}
		if ( ! $business_id ) {
			return View::render( 'dashboard/no-business' );
		}

		$profile = Business::profile( $business_id );
		$section = self::current_section( $profile['type'] );
		if ( 'profile' === $section ) {
			Assets::enqueue_form( true );
		}

		return View::render(
			'dashboard/layout',
			array(
				'uid'      => $uid,
				'b'        => $profile,
				'section'  => $section,
				'sections' => self::sections( $profile['type'] ),
				'mine'     => Business::for_user( $uid ),
				'flashes'  => View::flashes( $uid ),
				'form'     => self::$form,
			)
		);
	}

	public static function nonce_fields( $action, $business_id ) {
		return '<input type="hidden" name="ek_action" value="' . esc_attr( $action ) . '">'
			. '<input type="hidden" name="business_id" value="' . (int) $business_id . '">'
			. '<input type="hidden" name="_ek_nonce" value="' . esc_attr( wp_create_nonce( $action . '_' . (int) $business_id ) ) . '">';
	}

	/** Booking list groups shown as tabs. */
	public static function booking_groups() {
		return array(
			'action'    => array( __( 'Needs action', 'explore-katsina' ), array( 'new', 'requested' ) ),
			'upcoming'  => array( __( 'Upcoming', 'explore-katsina' ), array( 'confirmed', 'deposit_paid' ) ),
			'inhouse'   => array( __( 'In house / seated', 'explore-katsina' ), array( 'checked_in', 'seated' ) ),
			'past'      => array( __( 'Past', 'explore-katsina' ), array( 'checked_out', 'completed', 'no_show' ) ),
			'cancelled' => array( __( 'Cancelled', 'explore-katsina' ), array( 'cancelled', 'declined' ) ),
		);
	}

	/** Bookings / reservations for the dashboard (not food orders). Unpaid holds and expired attempts are never shown. */
	public static function bookings( $business_id, $group = '', $limit = 100, $kind_sql = "kind <> 'order'" ) {
		global $wpdb;
		$groups = self::booking_groups();
		$list   = isset( $groups[ $group ] ) ? $groups[ $group ][1] : array_merge( ...array_column( $groups, 1 ) );
		$ph     = implode( ',', array_fill( 0, count( $list ), '%s' ) );
		$order  = in_array( $group, array( 'past', 'cancelled' ), true ) ? 'DESC' : 'ASC';
		return $wpdb->get_results( // phpcs:ignore
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d AND {$kind_sql} AND status IN ($ph) ORDER BY start_date $order, start_time $order, id $order LIMIT %d", // phpcs:ignore
				array_merge( array( $business_id ), $list, array( $limit ) )
			)
		);
	}

	public static function booking_counts( $business_id ) {
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT status, COUNT(*) n FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d AND kind <> 'order' GROUP BY status", $business_id ) );
		$by   = wp_list_pluck( $rows, 'n', 'status' );
		$out  = array();
		foreach ( self::booking_groups() as $k => $g ) {
			$out[ $k ] = array_sum( array_intersect_key( $by, array_flip( $g[1] ) ) );
		}
		return $out;
	}

	public static function booking_status_label( $status ) {
		$all = Booking::statuses();
		if ( isset( $all[ $status ] ) ) {
			return $all[ $status ];
		}
		$l = array(
			'new'          => __( 'New', 'explore-katsina' ),
			'requested'    => __( 'Requested', 'explore-katsina' ),
			'confirmed'    => __( 'Confirmed', 'explore-katsina' ),
			'deposit_paid' => __( 'Deposit paid', 'explore-katsina' ),
			'checked_in'   => __( 'Checked in', 'explore-katsina' ),
			'checked_out'  => __( 'Checked out', 'explore-katsina' ),
			'seated'       => __( 'Seated', 'explore-katsina' ),
			'completed'    => __( 'Completed', 'explore-katsina' ),
			'declined'     => __( 'Declined', 'explore-katsina' ),
			'cancelled'    => __( 'Cancelled', 'explore-katsina' ),
			'no_show'      => __( 'No-show', 'explore-katsina' ),
		);
		return $l[ $status ] ?? $status;
	}

	public static function ledger( $business_id, $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_ledger WHERE business_id = %d ORDER BY id DESC LIMIT %d", $business_id, $limit )
		);
	}
}
