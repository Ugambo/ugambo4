<?php
/**
 * Plugin Name: Explore Katsina: local test inbox
 * Description: On the LOCAL development site only, sends all email to Mailpit (http://localhost:8025) instead of real inboxes. Does nothing unless EK_LOCAL_SMTP_HOST is defined. Never copy this to the live site.
 */

defined( 'ABSPATH' ) || exit;

if ( defined( 'EK_LOCAL_SMTP_HOST' ) && EK_LOCAL_SMTP_HOST ) {
	add_action(
		'phpmailer_init',
		static function ( $mailer ) {
			$mailer->isSMTP();
			$mailer->Host        = EK_LOCAL_SMTP_HOST;
			$mailer->Port        = defined( 'EK_LOCAL_SMTP_PORT' ) ? (int) EK_LOCAL_SMTP_PORT : 1025;
			$mailer->SMTPAuth    = false;
			$mailer->SMTPAutoTLS = false;
		}
	);
	add_filter( 'wp_mail_from', static function () { return 'no-reply@explorekatsina.local'; } );
}
