<?php
/**
 * Phase 14 – WordPress lock-down (works with Wordfence and Limit Login Attempts Reloaded from Phase 12).
 *
 *  - WordPress version hidden: no "generator" tag (also WooCommerce's), no version on WordPress's own
 *    files, readme.html / license.txt blocked.
 *  - XML-RPC switched off completely (an old remote-publishing door that attackers use to guess
 *    passwords many times per request). Pingbacks off.
 *  - Login protection:
 *      · Limit Login Attempts Reloaded: 4 tries, then a 20-minute lockout (set up in Phase 12);
 *      · one message for any failed login or password reset, so nobody can test which emails have accounts;
 *      · usernames are not published (no author pages, no user list in the public API, no author name
 *        in embeds);
 *      · passwords: at least 8 characters for everyone and 12 for staff, and never a well-known
 *        password or one containing the person's own name or email;
 *      · application passwords only for administrators;
 *      · Wordfence (free) offers two-step login with a phone app for administrators: owner to switch on.
 *  - Security headers on every page (no sniffing of file types, no framing by other sites, privacy-
 *    friendly referrer, browser features limited to location (Near me) and camera (ticket scanner)).
 *  - Theme and plugin file editor in wp-admin switched off.
 *
 * `wp ek plugins-setup` also writes server rules into .htaccess (Apache / LiteSpeed): block xmlrpc.php,
 * readme.html, license.txt and folder listings; no PHP in the uploads folder; long browser caching for
 * pictures, fonts, CSS and JavaScript (their addresses change whenever the file changes); compression.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Security {

	const MIN_PASSWORD       = 8;
	const MIN_STAFF_PASSWORD = 12;

	public static function init() {
		if ( ! defined( 'DISALLOW_FILE_EDIT' ) ) {
			define( 'DISALLOW_FILE_EDIT', true );
		}

		// Hide the WordPress version.
		remove_action( 'wp_head', 'wp_generator' );
		add_filter( 'the_generator', '__return_empty_string' );
		add_filter( 'style_loader_src', array( __CLASS__, 'strip_version' ), 999 );
		add_filter( 'script_loader_src', array( __CLASS__, 'strip_version' ), 999 );
		remove_action( 'wp_head', 'rsd_link' );
		remove_action( 'wp_head', 'wlwmanifest_link' );

		// XML-RPC and pingbacks off.
		add_filter( 'xmlrpc_enabled', '__return_false' );
		add_filter( 'xmlrpc_methods', '__return_empty_array' );
		add_filter( 'pings_open', '__return_false' );
		add_filter( 'wp_headers', array( __CLASS__, 'remove_pingback_header' ) );
		add_action( 'init', array( __CLASS__, 'block_xmlrpc' ), 0 );

		// Headers.
		add_action( 'send_headers', array( __CLASS__, 'headers' ) );
		add_action( 'login_init', array( __CLASS__, 'headers' ) );
		add_action( 'admin_init', array( __CLASS__, 'headers' ) );

		// Logins.
		add_filter( 'authenticate', array( __CLASS__, 'generic_login_error' ), 100 );
		add_action( 'lostpassword_post', array( __CLASS__, 'lost_password_no_hint' ), 10, 2 );
		add_filter( 'wp_is_application_passwords_available_for_user', static fn( $ok, $user ) => $ok && user_can( $user, 'manage_options' ), 10, 2 );

		// Do not publish usernames.
		add_filter( 'rest_endpoints', array( __CLASS__, 'hide_user_endpoints' ) );
		add_action( 'template_redirect', array( __CLASS__, 'no_author_pages' ), 0 );
		add_filter( 'oembed_response_data', array( __CLASS__, 'oembed_no_author' ) );
		add_filter( 'wp_sitemaps_add_provider', static fn( $p, $name ) => 'users' === $name ? false : $p, 10, 2 );

		// Passwords.
		add_action( 'user_profile_update_errors', array( __CLASS__, 'profile_password' ), 10, 3 );
		add_action( 'validate_password_reset', array( __CLASS__, 'reset_password' ), 10, 2 );
	}

	/* ---------------- Version ---------------- */

	/** WordPress's own files carry "?ver=<WordPress version>"; replace it with a code that reveals nothing. */
	public static function strip_version( $src ) {
		$wp = get_bloginfo( 'version' );
		if ( $src && false !== strpos( $src, 'ver=' . $wp ) ) {
			$src = add_query_arg( 'ver', substr( md5( $wp . wp_salt( 'auth' ) ), 0, 8 ), $src );
		}
		return $src;
	}

	/* ---------------- XML-RPC ---------------- */

	public static function remove_pingback_header( $headers ) {
		unset( $headers['X-Pingback'] );
		return $headers;
	}

	public static function block_xmlrpc() {
		if ( defined( 'XMLRPC_REQUEST' ) && XMLRPC_REQUEST ) {
			status_header( 403 );
			header( 'Content-Type: text/plain; charset=utf-8' );
			echo 'XML-RPC is disabled on this site.';
			exit;
		}
	}

	/* ---------------- Headers ---------------- */

	public static function header_list() {
		$h = array(
			'X-Content-Type-Options' => 'nosniff',
			'X-Frame-Options'        => 'SAMEORIGIN',
			'Referrer-Policy'        => 'strict-origin-when-cross-origin',
			'Permissions-Policy'     => 'geolocation=(self), camera=(self), microphone=(), payment=(self), usb=()',
		);
		if ( is_ssl() ) {
			$h['Strict-Transport-Security'] = 'max-age=15552000'; // 180 days, this domain only.
		}
		return apply_filters( 'ek_security_headers', $h );
	}

	public static function headers() {
		if ( headers_sent() ) {
			return;
		}
		foreach ( self::header_list() as $k => $v ) {
			header( $k . ': ' . $v );
		}
		header_remove( 'X-Powered-By' );
	}

	/* ---------------- Logins ---------------- */

	public static function login_failed_message() {
		return __( '<strong>Error:</strong> the email/username or password is not correct.', 'explore-katsina' ) . ' <a href="' . esc_url( wp_lostpassword_url() ) . '">' . __( 'Forgotten your password?', 'explore-katsina' ) . '</a>';
	}

	/** "Unknown username" and "wrong password" look the same, so nobody can find out who has an account. */
	public static function generic_login_error( $user ) {
		if ( is_wp_error( $user ) && array_intersect( $user->get_error_codes(), array( 'invalid_username', 'invalid_email', 'incorrect_password' ) ) ) {
			return new \WP_Error( 'ek_login_failed', self::login_failed_message() );
		}
		return $user;
	}

	/** Unknown email on "Lost your password?": show the same "check your email" page as for a real account. */
	public static function lost_password_no_hint( $errors, $user_data = false ) {
		if ( $user_data || empty( $_POST['user_login'] ) || array_diff( $errors->get_error_codes(), array( 'invalid_email', 'invalidcombo' ) ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return; // A real account, an empty box, or another problem (e.g. a failed security check): normal handling.
		}
		$redirect = ! empty( $_REQUEST['redirect_to'] ) ? wp_unslash( $_REQUEST['redirect_to'] ) : 'wp-login.php?checkemail=confirm'; // phpcs:ignore
		wp_safe_redirect( $redirect );
		exit;
	}

	/* ---------------- Usernames ---------------- */

	public static function hide_user_endpoints( $endpoints ) {
		if ( current_user_can( 'list_users' ) || current_user_can( 'edit_posts' ) ) {
			return $endpoints;
		}
		foreach ( array_keys( $endpoints ) as $route ) {
			if ( 0 === strpos( $route, '/wp/v2/users' ) && '/wp/v2/users/me' !== $route ) {
				unset( $endpoints[ $route ] );
			}
		}
		return $endpoints;
	}

	/** We have no author pages: /?author=1 and /author/name/ are "not found" (they would show usernames). */
	public static function no_author_pages() {
		if ( is_author() || ( isset( $_GET['author'] ) && ! is_admin() ) ) { // phpcs:ignore
			global $wp_query;
			$wp_query->set_404();
			status_header( 404 );
			nocache_headers();
		}
	}

	public static function oembed_no_author( $data ) {
		unset( $data['author_name'], $data['author_url'] );
		return $data;
	}

	/* ---------------- Passwords ---------------- */

	/**
	 * Why a password is not acceptable, or '' when it is.
	 *
	 * @param string       $pass
	 * @param \WP_User|int|array $who The user (or array with email/name for new accounts).
	 * @param bool         $staff Staff accounts (can edit content) need longer passwords.
	 */
	public static function password_problem( $pass, $who = null, $staff = false ) {
		$pass = (string) $pass;
		$min  = $staff ? self::MIN_STAFF_PASSWORD : self::MIN_PASSWORD;
		if ( mb_strlen( $pass ) < $min ) {
			/* translators: %d: characters */
			return sprintf( __( 'Choose a password of at least %d characters.', 'explore-katsina' ), $min );
		}
		$lower = mb_strtolower( $pass );
		if ( in_array( $lower, self::common(), true ) || 1 === count( array_unique( mb_str_split( $lower ) ) ) || preg_match( '/^(?:0?123456789?0?|abcdefgh\w*|qwertyuiop?|password\d*|katsina\d*|explorekatsina\d*)$/', $lower ) ) {
			return __( 'This password is too easy to guess. Please choose another (a short sentence works well).', 'explore-katsina' );
		}
		$parts = array();
		if ( $who instanceof \WP_User ) {
			$parts = array( $who->user_login, strtok( (string) $who->user_email, '@' ), $who->first_name, $who->last_name );
		} elseif ( is_array( $who ) ) {
			$parts = array( strtok( (string) ( $who['email'] ?? '' ), '@' ), $who['name'] ?? '' );
		}
		foreach ( $parts as $p ) {
			$p = mb_strtolower( trim( (string) $p ) );
			if ( mb_strlen( $p ) >= 4 && ( $lower === $p || ( false !== mb_strpos( $lower, $p ) && mb_strlen( $lower ) - mb_strlen( $p ) < 4 ) ) ) {
				return __( 'Your password must not be your name, username or email. Please choose another.', 'explore-katsina' );
			}
		}
		return '';
	}

	/** Most-used passwords from public breach lists, plus local ones. */
	public static function common() {
		return array(
			'password', 'password1', 'password12', 'password123', 'passw0rd', 'p@ssw0rd', 'p@ssword', '12345678', '123456789', '1234567890',
			'87654321', '11111111', '00000000', '12341234', '11223344', 'iloveyou', 'iloveyou1', 'sunshine', 'princess', 'football',
			'baseball', 'superman', 'welcome1', 'welcome123', 'admin123', 'administrator', 'letmein1', 'trustno1', 'qwerty123', 'qwertyui',
			'1q2w3e4r', '1qaz2wsx', 'zaq12wsx', 'abc12345', 'abcd1234', 'asdfghjk', 'asdf1234', 'zxcvbnm1', 'monkey12', 'dragon12',
			'michael1', 'charlie1', 'computer', 'internet', 'whatever', 'starwars', 'master12', 'changeme', 'nigeria1', 'nigeria123',
			'naija123', 'lagos123', 'abuja123', 'kano1234', 'allahu123', 'bismillah', 'alhamdulillah', 'mashallah', 'insha allah', 'inshallah',
			'katsina1', 'katsina123', 'katsina2024', 'katsina2025', 'katsina2026', 'hotel123', 'booking1', 'welcome!', 'password!',
		);
	}

	/** wp-admin profile screen and user creation. */
	public static function profile_password( $errors, $update, $user ) {
		if ( empty( $user->user_pass ) || $errors->get_error_data( 'pass' ) ) {
			return;
		}
		$who   = $update ? get_userdata( $user->ID ) : null;
		$staff = $update ? user_can( $user->ID, 'edit_posts' ) : ( isset( $user->role ) && ! in_array( $user->role, array( 'subscriber', 'customer', Install::ROLE_OWNER ), true ) );
		$p     = self::password_problem( $user->user_pass, $who ? $who : array( 'email' => $user->user_email ?? '', 'name' => $user->user_login ?? '' ), $staff );
		if ( $p ) {
			$errors->add( 'pass', $p, array( 'form-field' => 'pass1' ) );
		}
	}

	/** "Reset password" screen. */
	public static function reset_password( $errors, $user ) {
		$pass = isset( $_POST['pass1'] ) ? wp_unslash( $_POST['pass1'] ) : ''; // phpcs:ignore
		if ( '' === $pass || ! ( $user instanceof \WP_User ) ) {
			return;
		}
		$p = self::password_problem( $pass, $user, user_can( $user, 'edit_posts' ) );
		if ( $p ) {
			$errors->add( 'password_reset_mismatch', $p );
		}
	}

	/* ---------------- Server rules (.htaccess) ---------------- */

	public static function htaccess_rules() {
		return array_merge( array(
			'# Written by Explore Katsina (wp ek plugins-setup). Apache / LiteSpeed only; Nginx hosts: see HANDOVER.md.',
			'Options -Indexes',
			'<IfModule mod_authz_core.c>',
			'<FilesMatch "^(xmlrpc\.php|readme\.html|license\.txt|wp-config-sample\.php)$">',
			'Require all denied',
			'</FilesMatch>',
			'</IfModule>',
		), self::htaccess_headers(), array(
			'<IfModule mod_deflate.c>',
			'AddOutputFilterByType DEFLATE text/html text/plain text/css text/xml text/javascript application/javascript application/x-javascript application/json application/ld+json application/xml image/svg+xml font/ttf',
			'</IfModule>',
			'<IfModule mod_expires.c>',
			'ExpiresActive On',
			'ExpiresByType image/webp "access plus 1 year"',
			'ExpiresByType image/jpeg "access plus 1 year"',
			'ExpiresByType image/png "access plus 1 year"',
			'ExpiresByType image/svg+xml "access plus 1 year"',
			'ExpiresByType image/x-icon "access plus 1 year"',
			'ExpiresByType font/woff2 "access plus 1 year"',
			'ExpiresByType font/woff "access plus 1 year"',
			'ExpiresByType text/css "access plus 1 year"',
			'ExpiresByType application/javascript "access plus 1 year"',
			'ExpiresByType text/javascript "access plus 1 year"',
			'</IfModule>',
		) );
	}

	/** The same headers for pages served straight from the page cache (WordPress is not loaded then). */
	private static function htaccess_headers() {
		$out = array( '<IfModule mod_headers.c>' );
		foreach ( self::header_list() as $k => $v ) {
			if ( 'Strict-Transport-Security' !== $k ) {
				$out[] = 'Header always set ' . $k . ' "' . $v . '"';
			}
		}
		$out[] = 'Header always set Strict-Transport-Security "max-age=15552000" "expr=%{HTTPS} == \'on\'"';
		$out[] = 'Header unset X-Powered-By';
		$out[] = 'Header always unset X-Powered-By';
		$out[] = '</IfModule>';
		return $out;
	}

	public static function uploads_rules() {
		return array(
			'# Written by Explore Katsina: never run PHP from the uploads folder.',
			'<IfModule mod_authz_core.c>',
			'<FilesMatch "\.(?:php\d?|phtml|phar|pht)$">',
			'Require all denied',
			'</FilesMatch>',
			'</IfModule>',
		);
	}

	/**
	 * After a move to a new host the .htaccess files are new: write our rules again (checked at most once
	 * a day, only when an administrator opens wp-admin, and only where the file can be written).
	 */
	public static function maybe_write_rules() {
		if ( get_transient( 'ek_rules_checked' ) ) {
			return;
		}
		set_transient( 'ek_rules_checked', 1, DAY_IN_SECONDS );
		$root = ABSPATH . '.htaccess';
		$have = file_exists( $root ) ? (string) file_get_contents( $root ) : ''; // phpcs:ignore
		$up   = wp_upload_dir( null, false );
		$upf  = trailingslashit( $up['basedir'] ) . '.htaccess';
		$uph  = file_exists( $upf ) ? (string) file_get_contents( $upf ) : ''; // phpcs:ignore
		if ( false === strpos( $have, '# BEGIN Explore Katsina' ) || false === strpos( $uph, '# BEGIN Explore Katsina' ) ) {
			self::setup();
		}
	}

	/** Run once by `wp ek plugins-setup` (and re-runnable with `wp ek security`). */
	public static function setup() {
		require_once ABSPATH . 'wp-admin/includes/misc.php';
		$done = array();
		$root = ABSPATH . '.htaccess';
		if ( ( file_exists( $root ) && is_writable( $root ) ) || ( ! file_exists( $root ) && is_writable( ABSPATH ) ) ) {
			// Our block goes first so it applies before WordPress's own rewrite rules.
			$current = file_exists( $root ) ? (string) file_get_contents( $root ) : ''; // phpcs:ignore
			$current = preg_replace( '/# BEGIN Explore Katsina.*?# END Explore Katsina\s*/s', '', $current );
			$block   = "# BEGIN Explore Katsina\n" . implode( "\n", self::htaccess_rules() ) . "\n# END Explore Katsina\n\n";
			file_put_contents( $root, $block . ltrim( $current ) ); // phpcs:ignore
			$done[] = 'server rules';
		}
		$up = wp_upload_dir( null, false );
		if ( ! empty( $up['basedir'] ) && is_dir( $up['basedir'] ) && is_writable( $up['basedir'] ) ) {
			insert_with_markers( trailingslashit( $up['basedir'] ) . '.htaccess', 'Explore Katsina', self::uploads_rules() );
			$done[] = 'no PHP in uploads';
		}
		update_option( 'default_ping_status', 'closed' );
		update_option( 'default_pingback_flag', 0 );
		$done[] = 'pingbacks off';
		return implode( ', ', $done );
	}
}
