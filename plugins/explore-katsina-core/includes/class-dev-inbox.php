<?php
/**
 * "Test emails (local only)": on a local copy of the site that cannot send email (for example XAMPP on
 * your own computer), every email the site would send is kept here instead, so you can read the booking,
 * ticket (with QR codes), invoice and payout emails in wp-admin → Explore Katsina → Test emails.
 *
 * Only active when ALL of these are true:
 *  - the site is marked local or development (wp-config.php: define( 'WP_ENVIRONMENT_TYPE', 'local' );)
 *  - no real email route is set up (FluentSMTP has no connection, and no local test inbox is configured).
 * On a live site it does nothing. Nothing is sent anywhere; the last 100 emails are kept.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Dev_Inbox {

	const OPTION = 'ek_dev_inbox';
	const KEEP   = 100;

	public static function active() {
		if ( ! in_array( wp_get_environment_type(), array( 'local', 'development' ), true ) ) {
			return false;
		}
		if ( defined( 'EK_LOCAL_SMTP_HOST' ) && EK_LOCAL_SMTP_HOST ) {
			return false; // The Docker test inbox (Mailpit) is in use.
		}
		$fluent = get_option( 'fluentmail-settings' );
		return empty( $fluent['connections'] ); // A real SMTP connection sends email normally.
	}

	public static function init() {
		if ( ! self::active() ) {
			return;
		}
		add_filter( 'pre_wp_mail', array( __CLASS__, 'keep' ), 99, 2 );
		add_action( 'admin_menu', array( __CLASS__, 'menu' ), 30 );
	}

	/** Keep the email instead of sending it (returning true tells WordPress it was "sent"). */
	public static function keep( $short_circuit, $atts ) {
		if ( null !== $short_circuit ) {
			return $short_circuit;
		}
		$list   = (array) get_option( self::OPTION, array() );
		$list[] = array(
			'time'    => time(),
			'to'      => implode( ', ', (array) $atts['to'] ),
			'subject' => (string) $atts['subject'],
			'message' => (string) $atts['message'],
		);
		update_option( self::OPTION, array_slice( $list, -self::KEEP ), false );
		return true;
	}

	public static function menu() {
		add_submenu_page( 'ek-approvals', __( 'Test emails (local only)', 'explore-katsina' ), __( 'Test emails', 'explore-katsina' ), 'manage_options', 'ek-dev-inbox', array( __CLASS__, 'page' ) );
	}

	public static function page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}
		if ( isset( $_POST['ek_inbox_clear'] ) && check_admin_referer( 'ek_inbox_clear' ) ) {
			delete_option( self::OPTION );
		}
		$list = array_reverse( (array) get_option( self::OPTION, array() ), true );
		$view = isset( $_GET['email'] ) ? absint( $_GET['email'] ) : null; // phpcs:ignore WordPress.Security.NonceVerification
		echo '<div class="wrap"><h1>' . esc_html__( 'Test emails (local only)', 'explore-katsina' ) . '</h1>';
		echo '<p>' . esc_html__( 'This copy of the site cannot send email, so every email it would send is kept here (the last 100). Nothing was sent to anyone. On a live site this page does not exist.', 'explore-katsina' ) . '</p>';
		if ( null !== $view && isset( $list[ $view ] ) ) {
			$m = $list[ $view ];
			echo '<p><a href="' . esc_url( admin_url( 'admin.php?page=ek-dev-inbox' ) ) . '">&larr; ' . esc_html__( 'All test emails', 'explore-katsina' ) . '</a></p>';
			echo '<h2>' . esc_html( $m['subject'] ) . '</h2><p>' . esc_html__( 'To:', 'explore-katsina' ) . ' ' . esc_html( $m['to'] ) . ' · ' . esc_html( wp_date( 'j M Y H:i', $m['time'] ) ) . '</p>';
			$html = false !== stripos( $m['message'], '<html' ) || false !== stripos( $m['message'], '<p' ) ? $m['message'] : '<pre style="white-space:pre-wrap;font:14px sans-serif">' . esc_html( $m['message'] ) . '</pre>';
			echo '<iframe sandbox title="' . esc_attr( $m['subject'] ) . '" srcdoc="' . esc_attr( $html ) . '" style="width:100%;max-width:680px;height:75vh;border:1px solid #c3c4c7;background:#fff"></iframe></div>';
			return;
		}
		if ( ! $list ) {
			echo '<p><em>' . esc_html__( 'No emails yet. Make a test booking and they will appear here.', 'explore-katsina' ) . '</em></p></div>';
			return;
		}
		echo '<form method="post" style="margin:8px 0">';
		wp_nonce_field( 'ek_inbox_clear' );
		echo '<button class="button" name="ek_inbox_clear" value="1">' . esc_html__( 'Empty the test inbox', 'explore-katsina' ) . '</button></form>';
		echo '<table class="wp-list-table widefat striped"><thead><tr><th>' . esc_html__( 'When', 'explore-katsina' ) . '</th><th>' . esc_html__( 'To', 'explore-katsina' ) . '</th><th>' . esc_html__( 'Subject', 'explore-katsina' ) . '</th></tr></thead><tbody>';
		foreach ( $list as $i => $m ) {
			echo '<tr><td>' . esc_html( wp_date( 'j M H:i', $m['time'] ) ) . '</td><td>' . esc_html( $m['to'] ) . '</td><td><a href="' . esc_url( admin_url( 'admin.php?page=ek-dev-inbox&email=' . (int) $i ) ) . '">' . esc_html( $m['subject'] ) . '</a></td></tr>';
		}
		echo '</tbody></table></div>';
	}
}
