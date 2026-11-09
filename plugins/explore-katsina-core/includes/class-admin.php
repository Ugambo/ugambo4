<?php
/**
 * Site-owner admin screens: Approvals, Payouts, Refunds, Complaints, Invoices, Reports, Settings, Activity log.
 * wp-admin → Explore Katsina.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Admin {

	const CAP = 'manage_options';

	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'menu' ) );
		add_action( 'admin_init', array( __CLASS__, 'handle' ) );
		add_action( 'admin_init', array( __CLASS__, 'csv' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'assets' ) );
		add_action( 'admin_notices', array( __CLASS__, 'notices' ) );
	}

	public static function pending_count() {
		$c = wp_count_posts( Post_Types::BUSINESS );
		return (int) ( $c->pending ?? 0 );
	}

	public static function menu() {
		$n     = self::pending_count();
		$badge = $n ? ' <span class="awaiting-mod count-' . $n . '"><span class="pending-count">' . $n . '</span></span>' : '';
		add_menu_page( 'Explore Katsina', 'Explore Katsina' . $badge, self::CAP, 'ek-approvals', array( __CLASS__, 'page_approvals' ), 'dashicons-location-alt', 3 );
		add_submenu_page( 'ek-approvals', __( 'Approvals', 'explore-katsina' ), __( 'Approvals', 'explore-katsina' ) . $badge, self::CAP, 'ek-approvals', array( __CLASS__, 'page_approvals' ) );
		$badge_n = static fn( $n ) => $n ? ' <span class="awaiting-mod"><span class="pending-count">' . (int) $n . '</span></span>' : '';
		add_submenu_page( 'ek-approvals', __( 'Payouts', 'explore-katsina' ), __( 'Payouts', 'explore-katsina' ) . $badge_n( count( Payouts::waiting() ) ), self::CAP, 'ek-payouts', array( __CLASS__, 'page' ) );
		add_submenu_page( 'ek-approvals', __( 'Complaints', 'explore-katsina' ), __( 'Complaints', 'explore-katsina' ) . $badge_n( count( Complaints::open_list() ) ), self::CAP, 'ek-complaints', array( __CLASS__, 'page' ) );
		add_submenu_page( 'ek-approvals', __( 'Invoices', 'explore-katsina' ), __( 'Invoices', 'explore-katsina' ), self::CAP, 'ek-invoices', array( __CLASS__, 'page' ) );
		add_submenu_page( 'ek-approvals', __( 'Reports', 'explore-katsina' ), __( 'Reports', 'explore-katsina' ), self::CAP, 'ek-reports', array( __CLASS__, 'page' ) );
		$pending = count( Refunds::pending() );
		add_submenu_page( 'ek-approvals', __( 'Refunds', 'explore-katsina' ), __( 'Refunds', 'explore-katsina' ) . ( $pending ? ' <span class="awaiting-mod"><span class="pending-count">' . $pending . '</span></span>' : '' ), self::CAP, 'ek-refunds', array( __CLASS__, 'page_refunds' ) );
		add_submenu_page( 'ek-approvals', __( 'Activity log', 'explore-katsina' ), __( 'Activity log', 'explore-katsina' ), self::CAP, 'ek-log', array( __CLASS__, 'page_log' ) );
		add_submenu_page( 'ek-approvals', __( 'Settings', 'explore-katsina' ), __( 'Settings', 'explore-katsina' ), self::CAP, 'ek-settings', array( __CLASS__, 'page_settings' ) );
	}

	public static function assets( $hook ) {
		if ( false === strpos( (string) $hook, 'ek-' ) ) {
			return;
		}
		wp_enqueue_style( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.css', array(), '1.9.4' );
		wp_enqueue_script( 'leaflet', EK_URL . 'assets/vendor/leaflet/leaflet.js', array(), '1.9.4', true );
		wp_enqueue_script( 'ek-mini-map', EK_URL . 'assets/js/mini-map.js', array( 'leaflet' ), EK_VERSION, true );
		wp_localize_script( 'ek-mini-map', 'ekMap', Assets::map_config() );
		wp_add_inline_style(
			'leaflet',
			'.ek-admin .ek-grid{display:grid;gap:16px;grid-template-columns:1fr}@media(min-width:1100px){.ek-admin .ek-grid{grid-template-columns:3fr 2fr}}'
			. '.ek-admin .card{max-width:none;margin:0 0 16px;padding:16px 18px}.ek-admin .card h2{margin-top:0}'
			. '.ek-admin dl{display:grid;grid-template-columns:11em 1fr;gap:6px 12px;margin:0}.ek-admin dt{font-weight:600;color:#50575e}.ek-admin dd{margin:0;overflow-wrap:anywhere}'
			. '.ek-admin .ek-photos{display:flex;flex-wrap:wrap;gap:8px}.ek-admin .ek-photos img{width:120px;height:90px;object-fit:cover;border-radius:6px}'
			. '.ek-admin .ek-mini-map{height:240px;border-radius:8px}.ek-admin .ek-actions form{display:inline-block;margin:0 8px 8px 0}'
			. '.ek-admin .ek-pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600;background:#f0f0f1}'
			. '.ek-admin .ek-pill--pending{background:#FBF1DC;color:#6A4B05}.ek-admin .ek-pill--publish{background:#E3F1EB;color:#134636}.ek-admin .ek-pill--ek_rejected{background:#FBE9E7;color:#7A1A14}'
			. '.ek-admin textarea{width:100%}.ek-admin .ek-secret{font-family:monospace;font-size:14px}'
		);
	}

	public static function notices() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		if ( ! Crypto::has_dedicated_key() ) {
			echo '<div class="notice notice-warning"><p><strong>Explore Katsina:</strong> ' . esc_html__( 'EK_ENCRYPTION_KEY is not set in wp-config.php, so bank details are encrypted with a fallback key. Run setup.sh or add the key before launch, and keep a safe copy of it.', 'explore-katsina' ) . '</p></div>';
		}
	}

	/* ------------------------------------------------------------------ */
	/* Actions                                                              */
	/* ------------------------------------------------------------------ */

	public static function handle() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || empty( $_POST['ek_admin_action'] ) || ! current_user_can( self::CAP ) ) {
			return;
		}
		$action = sanitize_key( $_POST['ek_admin_action'] );

		if ( self::handle_money( $action ) ) {
			return;
		}

		if ( in_array( $action, array( 'refund_done', 'refund_retry' ), true ) ) {
			$rid = absint( $_POST['refund_id'] ?? 0 );
			check_admin_referer( 'ek_admin_' . $action . '_' . $rid );
			if ( 'refund_done' === $action ) {
				$ref = sanitize_text_field( wp_unslash( $_POST['reference'] ?? '' ) );
				if ( '' === $ref ) {
					wp_safe_redirect( admin_url( 'admin.php?page=ek-refunds&ek_msg=ref' ) );
					exit;
				}
				Refunds::mark_done( $rid, 'manual', $ref, get_current_user_id() );
			} else {
				Refunds::try_automatic( $rid );
			}
			wp_safe_redirect( admin_url( 'admin.php?page=ek-refunds&ek_msg=done' ) );
			exit;
		}

		if ( 'commission' === $action ) {
			$id = absint( $_POST['business_id'] ?? 0 );
			check_admin_referer( 'ek_admin_commission_' . $id );
			$raw = trim( (string) wp_unslash( $_POST['commission'] ?? '' ) );
			$old = get_post_meta( $id, '_ek_commission_bp', true );
			if ( '' === $raw ) {
				delete_post_meta( $id, '_ek_commission_bp' );
			} else {
				update_post_meta( $id, '_ek_commission_bp', self::pct_to_bp( $raw ) );
			}
			Log::add( 'commission_changed', 'business', $id, sanitize_text_field( wp_unslash( $_POST['reason'] ?? '' ) ), array( 'from_bp' => '' === $old ? null : (int) $old, 'to_bp' => '' === $raw ? null : self::pct_to_bp( $raw ) ) );
			wp_safe_redirect( admin_url( 'admin.php?page=ek-approvals&business=' . $id . '&ek_msg=done' ) );
			exit;
		}

		if ( 'settings' === $action ) {
			check_admin_referer( 'ek_admin_settings' );
			self::save_settings( wp_unslash( $_POST ) );
			wp_safe_redirect( admin_url( 'admin.php?page=ek-settings&saved=1' ) );
			exit;
		}

		$id = absint( $_POST['business_id'] ?? 0 );
		check_admin_referer( 'ek_admin_' . $action . '_' . $id );
		if ( ! Business::get( $id ) ) {
			wp_die( esc_html__( 'Business not found.', 'explore-katsina' ) );
		}
		$reason = sanitize_textarea_field( wp_unslash( $_POST['reason'] ?? '' ) );
		$back   = admin_url( 'admin.php?page=ek-approvals&business=' . $id );

		switch ( $action ) {
			case 'approve':
				self::set_status( $id, 'publish', 'business_approved', $reason, 'approved' );
				break;
			case 'reject':
				if ( '' === $reason ) {
					wp_safe_redirect( add_query_arg( 'ek_msg', 'reason', $back ) );
					exit;
				}
				self::set_status( $id, Post_Types::STATUS_REJECTED, 'business_rejected', $reason, 'rejected' );
				break;
			case 'pause':
				self::set_status( $id, Post_Types::STATUS_PAUSED, 'business_paused', $reason, 'paused' );
				break;
			case 'resume':
				delete_post_meta( $id, Invoices::META_PAUSED );
				self::set_status( $id, 'publish', 'business_resumed', $reason, 'resumed' );
				break;
			case 'verify':
				update_post_meta( $id, '_ek_verified', 1 );
				Log::add( 'business_verified', 'business', $id, $reason );
				break;
			case 'verify_stars':
				update_post_meta( $id, '_ek_stars_verified', 1 );
				update_post_meta( $id, '_ek_stars_verified_value', (int) get_post_meta( $id, '_ek_stars', true ) );
				Log::add( 'stars_verified', 'business', $id, $reason );
				break;
			case 'unverify_stars':
				delete_post_meta( $id, '_ek_stars_verified' );
				Log::add( 'stars_unverified', 'business', $id, $reason );
				break;
			case 'unverify':
				delete_post_meta( $id, '_ek_verified' );
				Log::add( 'business_unverified', 'business', $id, $reason );
				break;
		}
		wp_safe_redirect( add_query_arg( 'ek_msg', 'done', $back ) );
		exit;
	}

	public static function set_status( $id, $status, $log_action, $reason, $email ) {
		wp_update_post(
			array(
				'ID'          => $id,
				'post_status' => $status,
			)
		);
		Log::add( $log_action, 'business', $id, $reason );
		Emails::business_decision( $id, $email, $reason );
	}

	/** "12.5" (%) → 1250 basis points, kept between 0% and 50%. */
	public static function pct_to_bp( $pct ) {
		return (int) max( 0, min( 5000, round( (float) preg_replace( '/[^\d.]/', '', (string) $pct ) * 100 ) ) );
	}

	/** Payouts, complaints, invoices, reports. @return bool Handled. */
	private static function handle_money( $action ) {
		$uid = get_current_user_id();
		$go  = static function ( $page, $msg, $extra = array() ) {
			wp_safe_redirect( add_query_arg( array_merge( array( 'page' => $page, 'ek_msg' => rawurlencode( $msg ) ), $extra ), admin_url( 'admin.php' ) ) );
			exit;
		};
		$done = __( 'Done.', 'explore-katsina' );
		switch ( $action ) {
			case 'payout_approve':
			case 'payout_paid':
			case 'payout_reject':
				$id = absint( $_POST['payout_id'] ?? 0 );
				check_admin_referer( 'ek_admin_' . $action . '_' . $id );
				if ( 'payout_approve' === $action ) {
					$r = Payouts::approve( $id, $uid );
				} elseif ( 'payout_paid' === $action ) {
					$r = Payouts::mark_paid( $id, wp_unslash( $_POST['reference'] ?? '' ), $uid );
				} else {
					$r = Payouts::reject( $id, wp_unslash( $_POST['reason'] ?? '' ), $uid );
				}
				$go( 'ek-payouts', is_wp_error( $r ) ? $r->get_error_message() : $done, array( 'ek_ok' => is_wp_error( $r ) ? 0 : 1 ) );
				break;
			case 'complaint_resolve':
				$id = absint( $_POST['complaint_id'] ?? 0 );
				check_admin_referer( 'ek_admin_complaint_resolve_' . $id );
				$outcome = sanitize_key( $_POST['outcome'] ?? '' );
				$r       = Complaints::resolve( $id, $outcome, Money::to_kobo( wp_unslash( $_POST['refund'] ?? '' ) ), wp_unslash( $_POST['note'] ?? '' ), $uid );
				$go( 'ek-complaints', is_wp_error( $r ) ? $r->get_error_message() : $done, array( 'ek_ok' => is_wp_error( $r ) ? 0 : 1 ) );
				break;
			case 'invoice_paid':
			case 'invoice_void':
				$id = absint( $_POST['invoice_id'] ?? 0 );
				check_admin_referer( 'ek_admin_' . $action . '_' . $id );
				$ref = trim( sanitize_text_field( wp_unslash( $_POST['reference'] ?? '' ) ) );
				if ( '' === $ref ) {
					$go( 'ek-invoices', __( 'Enter the transfer reference or a reason.', 'explore-katsina' ), array( 'ek_ok' => 0 ) );
				}
				$ok = 'invoice_paid' === $action ? Invoices::mark_paid( $id, 'transfer', $ref, $uid ) : Invoices::void( $id, $ref, $uid );
				$go( 'ek-invoices', $ok ? $done : __( 'That invoice is not unpaid any more.', 'explore-katsina' ), array( 'ek_ok' => $ok ? 1 : 0 ) );
				break;
			case 'invoices_generate':
				check_admin_referer( 'ek_admin_invoices_generate' );
				$month = preg_match( '/^\d{4}-\d{2}$/', (string) ( $_POST['month'] ?? '' ) ) ? (string) $_POST['month'] : '';
				$made  = $month ? Invoices::generate( $month ) : array();
				/* translators: %d: number */
				$go( 'ek-invoices', sprintf( _n( '%d invoice created.', '%d invoices created.', count( $made ), 'explore-katsina' ), count( $made ) ), array( 'ek_ok' => 1 ) );
				break;
		}
		return false;
	}

	/** Reports → CSV download (GET with nonce). */
	public static function csv() {
		if ( empty( $_GET['ek_csv'] ) || ! current_user_can( self::CAP ) ) { // phpcs:ignore
			return;
		}
		check_admin_referer( 'ek_csv' );
		$p = Reports::period( sanitize_text_field( wp_unslash( $_GET['from'] ?? '' ) ), sanitize_text_field( wp_unslash( $_GET['to'] ?? '' ) ) );
		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="explore-katsina-bookings-' . $p['from'] . '-to-' . $p['to'] . '.csv"' );
		echo "\xEF\xBB\xBF" . Reports::csv( $p ); // phpcs:ignore
		exit;
	}

	private static function save_settings( array $in ) {
		$email = sanitize_email( $in['notify_email'] ?? '' );
		$rates = array();
		foreach ( (array) Settings::get( 'commission_bp' ) as $k => $current ) {
			$rates[ $k ] = isset( $in['commission'][ $k ] ) && '' !== trim( (string) $in['commission'][ $k ] ) ? self::pct_to_bp( $in['commission'][ $k ] ) : (int) $current;
		}
		if ( $rates !== array_map( 'intval', (array) Settings::get( 'commission_bp' ) ) ) {
			Log::add( 'commission_changed', 'settings', 0, '', array( 'from' => Settings::get( 'commission_bp' ), 'to' => $rates ) );
		}
		Settings::update(
			array(
				'notify_email'         => is_email( $email ) ? $email : get_option( 'admin_email' ),
				'agreement_version'    => sanitize_text_field( $in['agreement_version'] ?? Settings::get( 'agreement_version' ) ),
				'min_payout_kobo'      => max( 0, Money::to_kobo( $in['min_payout'] ?? '5000' ) ),
				'min_reviews_for_rank' => max( 1, min( 50, absint( $in['min_reviews_for_rank'] ?? 3 ) ) ),
				'max_photos_basic'     => max( 1, min( 50, absint( $in['max_photos_basic'] ?? 8 ) ) ),
				'max_photo_mb'         => max( 1, min( 20, absint( $in['max_photo_mb'] ?? 5 ) ) ),
				'food_ordering_enabled'=> ! empty( $in['food_ordering_enabled'] ) ? 1 : 0,
				'commission_bp'        => $rates,
				'invoice_due_days'     => max( 7, min( 90, absint( $in['invoice_due_days'] ?? 30 ) ) ),
			)
		);
	}

	/* ------------------------------------------------------------------ */
	/* Pages                                                                */
	/* ------------------------------------------------------------------ */

	public static function page_approvals() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$id = absint( $_GET['business'] ?? 0 ); // phpcs:ignore WordPress.Security.NonceVerification
		echo '<div class="wrap ek-admin">';
		if ( $id && Business::get( $id ) ) {
			echo View::render( 'admin/business', array( 'id' => $id ) ); // phpcs:ignore
		} else {
			echo View::render( 'admin/approvals' ); // phpcs:ignore
		}
		echo '</div>';
	}

	public static function page_settings() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		echo '<div class="wrap ek-admin">' . View::render( 'admin/settings', array( 's' => Settings::all() ) ) . '</div>'; // phpcs:ignore
	}

	/** Payouts / Complaints / Invoices / Reports: one template each. */
	public static function page() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		$page = str_replace( 'ek-', '', sanitize_key( $_GET['page'] ?? '' ) ); // phpcs:ignore
		if ( in_array( $page, array( 'payouts', 'complaints', 'invoices', 'reports' ), true ) ) {
			echo '<div class="wrap ek-admin">' . View::render( 'admin/' . $page ) . '</div>'; // phpcs:ignore
		}
	}

	public static function page_refunds() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		echo '<div class="wrap ek-admin">' . View::render( 'admin/refunds' ) . '</div>'; // phpcs:ignore
	}

	public static function page_log() {
		if ( ! current_user_can( self::CAP ) ) {
			return;
		}
		echo '<div class="wrap ek-admin">' . View::render( 'admin/log' ) . '</div>'; // phpcs:ignore
	}

	public static function action_form( $action, $id, $label, $class = 'button', $with_reason = false, $reason_required = false ) {
		$out  = '<form method="post">';
		$out .= wp_nonce_field( 'ek_admin_' . $action . '_' . $id, '_wpnonce', true, false );
		$out .= '<input type="hidden" name="ek_admin_action" value="' . esc_attr( $action ) . '"><input type="hidden" name="business_id" value="' . (int) $id . '">';
		if ( $with_reason ) {
			$out .= '<p><label>' . esc_html( $reason_required ? __( 'Reason (sent to the owner, required)', 'explore-katsina' ) : __( 'Note / reason (optional, sent to the owner)', 'explore-katsina' ) ) . '<br><textarea name="reason" rows="2" cols="40"' . ( $reason_required ? ' required' : '' ) . '></textarea></label></p>';
		}
		$out .= '<button type="submit" class="' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
		return $out;
	}
}
