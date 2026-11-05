<?php
/**
 * Site-owner admin screens: Approvals, Settings, Activity log.
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
		add_submenu_page( 'ek-approvals', __( 'Settings', 'explore-katsina' ), __( 'Settings', 'explore-katsina' ), self::CAP, 'ek-settings', array( __CLASS__, 'page_settings' ) );
		add_submenu_page( 'ek-approvals', __( 'Activity log', 'explore-katsina' ), __( 'Activity log', 'explore-katsina' ), self::CAP, 'ek-log', array( __CLASS__, 'page_log' ) );
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

	private static function save_settings( array $in ) {
		$email = sanitize_email( $in['notify_email'] ?? '' );
		Settings::update(
			array(
				'notify_email'         => is_email( $email ) ? $email : get_option( 'admin_email' ),
				'agreement_version'    => sanitize_text_field( $in['agreement_version'] ?? Settings::get( 'agreement_version' ) ),
				'min_payout_kobo'      => max( 0, Money::to_kobo( $in['min_payout'] ?? '5000' ) ),
				'min_reviews_for_rank' => max( 1, min( 50, absint( $in['min_reviews_for_rank'] ?? 3 ) ) ),
				'max_photos_basic'     => max( 1, min( 50, absint( $in['max_photos_basic'] ?? 8 ) ) ),
				'max_photo_mb'         => max( 1, min( 20, absint( $in['max_photo_mb'] ?? 5 ) ) ),
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
