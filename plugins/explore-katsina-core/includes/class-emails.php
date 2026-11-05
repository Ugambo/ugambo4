<?php
/**
 * Branded emails. Every message goes through send(), which also fires the
 * WhatsApp/SMS hook (switched OFF by default; see Settings).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Emails {

	public static function init() {
		add_filter( 'wp_mail_from_name', array( __CLASS__, 'from_name' ) );
	}

	public static function from_name( $name ) {
		return 'WordPress' === $name ? 'Explore Katsina' : $name;
	}

	public static function admin_email() {
		$e = Settings::get( 'notify_email' );
		return is_email( $e ) ? $e : get_option( 'admin_email' );
	}

	/**
	 * @param string $to       Recipient.
	 * @param string $subject  Subject.
	 * @param string $heading  Big heading in the email.
	 * @param array  $lines    Paragraphs (plain text, escaped here).
	 * @param array  $cta      Optional ['label' => '', 'url' => ''].
	 * @param array  $context  Passed to the messaging hook, e.g. ['event' => 'business_approved', 'phone' => '+234…'].
	 */
	public static function send( $to, $subject, $heading, array $lines, array $cta = array(), array $context = array() ) {
		$html = self::render( $heading, $lines, $cta );
		$sent = wp_mail( $to, $subject, $html, array( 'Content-Type: text/html; charset=UTF-8' ) );

		/**
		 * WhatsApp/SMS hook. Nothing is sent unless a provider is plugged in AND the
		 * setting is switched on (both OFF by default).
		 */
		if ( Settings::get( 'messaging_whatsapp' ) || Settings::get( 'messaging_sms' ) ) {
			do_action( 'ek_send_message', $context, wp_strip_all_tags( $heading . "\n" . implode( "\n", $lines ) ), $cta );
		}
		return $sent;
	}

	public static function render( $heading, array $lines, array $cta = array() ) {
		$body = '';
		foreach ( $lines as $line ) {
			$body .= '<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#1C1A22">' . nl2br( esc_html( $line ) ) . '</p>';
		}
		if ( ! empty( $cta['url'] ) ) {
			$body .= '<p style="margin:22px 0"><a href="' . esc_url( $cta['url'] ) . '" style="background:#8E1B2C;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">' . esc_html( $cta['label'] ) . '</a></p>';
		}
		$year = gmdate( 'Y' );
		return '<!doctype html><html><body style="margin:0;background:#FBF7EF;font-family:Arial,Helvetica,sans-serif">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EF"><tr><td align="center" style="padding:24px 12px">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">'
			. '<tr><td style="background:#141B3A;padding:18px 24px;color:#D2A03A;font-weight:bold;font-size:18px;letter-spacing:.04em">EXPLORE KATSINA</td></tr>'
			. '<tr><td style="padding:28px 24px"><h1 style="margin:0 0 16px;font-size:22px;color:#8E1B2C">' . esc_html( $heading ) . '</h1>' . $body . '</td></tr>'
			. '<tr><td style="padding:16px 24px;background:#F3EDE1;color:#5B5965;font-size:12px">© ' . $year . ' Explore Katsina · info@explorekatsina.com.ng (placeholder)</td></tr>'
			. '</table></td></tr></table></body></html>';
	}

	/* ---- Business account events ---- */

	public static function business_submitted( $business_id ) {
		$p     = Business::profile( $business_id );
		$owner = get_userdata( Business::owner_id( $business_id ) );
		if ( $owner ) {
			self::send(
				$owner->user_email,
				__( 'We received your listing', 'explore-katsina' ),
				__( 'Thank you for listing your business', 'explore-katsina' ),
				array(
					/* translators: %s: business name */
					sprintf( __( 'We received "%s". Our team will check the details and approve it, usually within 2 working days.', 'explore-katsina' ), $p['name'] ),
					__( 'You can already log in to your dashboard to finish your profile. Your listing becomes visible to visitors once it is approved.', 'explore-katsina' ),
				),
				array( 'label' => __( 'Open my dashboard', 'explore-katsina' ), 'url' => Install::page_url( 'dashboard' ) ),
				array( 'event' => 'business_submitted', 'phone' => $p['whatsapp'] ? $p['whatsapp'] : $p['phone'] )
			);
		}
		self::send(
			self::admin_email(),
			/* translators: %s: business name */
			sprintf( __( 'New business waiting for approval: %s', 'explore-katsina' ), $p['name'] ),
			__( 'A new business needs your approval', 'explore-katsina' ),
			array(
				/* translators: 1: name, 2: type, 3: LGA */
				sprintf( __( '%1$s (%2$s, %3$s LGA) has signed up.', 'explore-katsina' ), $p['name'], Business::types()[ $p['type'] ]['label'] ?? $p['type'], $p['lga'] ),
				__( 'Check their ID and details, then approve or reject them.', 'explore-katsina' ),
			),
			array( 'label' => __( 'Review now', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-approvals&business=' . (int) $business_id ) ),
			array( 'event' => 'admin_business_submitted' )
		);
	}

	public static function business_decision( $business_id, $decision, $reason = '' ) {
		$p     = Business::profile( $business_id );
		$owner = get_userdata( Business::owner_id( $business_id ) );
		if ( ! $owner ) {
			return;
		}
		$dash = array( 'label' => __( 'Open my dashboard', 'explore-katsina' ), 'url' => Install::page_url( 'dashboard' ) );
		$ctx  = array( 'event' => 'business_' . $decision, 'phone' => $p['whatsapp'] ? $p['whatsapp'] : $p['phone'] );

		switch ( $decision ) {
			case 'approved':
				self::send(
					$owner->user_email,
					__( 'Your business is now live on Explore Katsina', 'explore-katsina' ),
					__( 'Approved! Your listing is live', 'explore-katsina' ),
					array(
						/* translators: %s: business name */
						sprintf( __( '"%s" has been approved and visitors can now find it.', 'explore-katsina' ), $p['name'] ),
						__( 'Tip: listings with at least 5 good photos, full opening hours and a WhatsApp number get more enquiries.', 'explore-katsina' ),
					),
					array( 'label' => __( 'See my listing', 'explore-katsina' ), 'url' => $p['url'] ),
					$ctx
				);
				break;
			case 'rejected':
				self::send(
					$owner->user_email,
					__( 'About your Explore Katsina listing', 'explore-katsina' ),
					__( 'We could not approve your listing yet', 'explore-katsina' ),
					array_filter(
						array(
							/* translators: %s: business name */
							sprintf( __( 'We could not approve "%s" yet.', 'explore-katsina' ), $p['name'] ),
							$reason ? __( 'Reason:', 'explore-katsina' ) . ' ' . $reason : '',
							__( 'You can correct the details in your dashboard and resubmit.', 'explore-katsina' ),
						)
					),
					$dash,
					$ctx
				);
				break;
			case 'paused':
				self::send(
					$owner->user_email,
					__( 'Your Explore Katsina listing is paused', 'explore-katsina' ),
					__( 'Your listing is paused', 'explore-katsina' ),
					array_filter(
						array(
							/* translators: %s: business name */
							sprintf( __( '"%s" is temporarily hidden from visitors.', 'explore-katsina' ), $p['name'] ),
							$reason ? __( 'Reason:', 'explore-katsina' ) . ' ' . $reason : '',
							__( 'Please contact us if you have any questions.', 'explore-katsina' ),
						)
					),
					$dash,
					$ctx
				);
				break;
			case 'resumed':
				self::send(
					$owner->user_email,
					__( 'Your Explore Katsina listing is live again', 'explore-katsina' ),
					__( 'Your listing is live again', 'explore-katsina' ),
					/* translators: %s: business name */
					array( sprintf( __( '"%s" is visible to visitors again.', 'explore-katsina' ), $p['name'] ) ),
					array( 'label' => __( 'See my listing', 'explore-katsina' ), 'url' => $p['url'] ),
					$ctx
				);
				break;
		}
	}

	public static function payout_requested( $business_id, $amount_kobo ) {
		$p = Business::profile( $business_id );
		self::send(
			self::admin_email(),
			/* translators: %s: business name */
			sprintf( __( 'Payout request: %s', 'explore-katsina' ), $p['name'] ),
			__( 'A business has requested a payout', 'explore-katsina' ),
			/* translators: 1: business, 2: amount */
			array( sprintf( __( '%1$s requested a payout of %2$s.', 'explore-katsina' ), $p['name'], Money::format( $amount_kobo ) ) ),
			array( 'label' => __( 'Review payouts', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-approvals' ) ),
			array( 'event' => 'admin_payout_requested' )
		);
	}
}
