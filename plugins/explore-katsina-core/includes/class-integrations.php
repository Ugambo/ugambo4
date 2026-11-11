<?php
/**
 * The free plugins added in Phase 12, set up for Explore Katsina and kept compatible with our
 * bookings, payments and pages. All are free versions; none duplicates another:
 *
 *  - Rank Math SEO: titles, sitemap (businesses, attractions, events, tours, stories, pages), redirects.
 *    Utility pages (booking, account, dashboard, check-in, cart, checkout) and untranslated Hausa pages
 *    are "noindex" and left out of the sitemap. Modules that need outside accounts are off.
 *  - Wordfence: firewall + malware scans. Its own login lockouts are off because…
 *  - Limit Login Attempts Reloaded handles login lockouts (4 tries, 20 minutes) for wp-login and our
 *    "My Account" login.
 *  - UpdraftPlus: database every day (14 kept), files every week (4 kept). Remote storage (e.g. Google
 *    Drive) is connected by the owner. Backups are useless without EK_ENCRYPTION_KEY: keep it safe.
 *  - WP Super Cache (owner decision, no host chosen yet): pages cached for 1 hour for visitors who are
 *    not logged in. Never cached: booking, account, dashboard, check-in, cart, checkout, sign-up, any page
 *    with one of our forms (they carry security codes), pages showing a booked banner (so views are
 *    counted), and shoppers with items in the cart.
 *  - Smush (free): compresses uploads, removes photo location data, caps size at 2560 px. Its lazy load
 *    is off (WordPress already lazy-loads). WebP (owner decision): WordPress itself saves new uploads'
 *    sizes as WebP; `wp ek webp` converts photos already in the library.
 *  - Join.chat: WhatsApp button (PLACEHOLDER number until the real one is set), kept clear of the mobile
 *    bottom bar and hidden on the map, dashboards, check-in, booking and checkout pages.
 *  - Fluent Forms: "Contact us" form on the Contact page (name, email, phone, topic, message, consent).
 *    Advertising enquiries stay in our own form (wp-admin → Enquiries).
 *  - MailPoet: newsletter list "Explore Katsina news" with double opt-in; our branded sign-up box
 *    [ek_newsletter] in the footer.
 *  - FluentSMTP: sends the site's email through a proper mail service once the owner adds one
 *    (Settings → FluentSMTP). Until then email is sent the normal WordPress way.
 *
 * `wp ek plugins-setup` (run by setup.sh) applies the settings. Re-run safe: each plugin is set up once
 * and later changes made in wp-admin are kept (option ek_plugins_setup records what was done).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Integrations {

	const DONE         = 'ek_plugins_setup';
	const PLACEHOLDER_WHATSAPP = '+2348000000000';

	/** Our pages that must never be cached or indexed (keys from Install's page list). */
	const PRIVATE_PAGES = array( 'book', 'account', 'dashboard', 'checkin', 'list_business', 'promote_event', 'listing_setup' );

	public static function init() {
		// Caching.
		add_action( 'template_redirect', array( __CLASS__, 'no_cache_private_pages' ), 1 );
		add_action( 'ek_rendered_form', array( __CLASS__, 'no_cache' ) );
		add_action( 'ek_ad_shown', array( __CLASS__, 'no_cache' ) );
		add_action( 'ek_listings_changed', array( __CLASS__, 'clear_page_cache' ) );
		// SEO.
		add_filter( 'rank_math/frontend/robots', array( __CLASS__, 'robots' ) );
		add_filter( 'rank_math/sitemap/posts_to_exclude', array( __CLASS__, 'sitemap_exclude' ) );
		// WhatsApp button.
		add_filter( 'joinchat_show', array( __CLASS__, 'joinchat_show' ) );
		add_action( 'wp_head', array( __CLASS__, 'joinchat_css' ), 99 );
		// WebP.
		add_filter( 'image_editor_output_format', array( __CLASS__, 'webp' ) );
		add_filter( 'wp_editor_set_quality', static fn( $q, $mime = '' ) => 'image/webp' === $mime ? 80 : $q, 10, 2 ); // ~40% smaller than JPEG, same look.
		// Contact form.
		add_shortcode( 'ek_contact_form', array( __CLASS__, 'contact_form' ) );
		// Newsletter.
		add_shortcode( 'ek_newsletter', array( __CLASS__, 'newsletter_form' ) );
		add_action( 'template_redirect', array( __CLASS__, 'newsletter_submit' ), 8 );
		// Local test site: never lock ourselves out while running the automated checks.
		add_filter( 'option_limit_login_whitelist', array( __CLASS__, 'local_whitelist' ) );
		add_filter( 'default_option_limit_login_whitelist', array( __CLASS__, 'local_whitelist' ) );
	}

	/* ---------------- Caching ---------------- */

	public static function no_cache() {
		if ( ! defined( 'DONOTCACHEPAGE' ) ) {
			define( 'DONOTCACHEPAGE', true );
		}
	}

	/** A listing, price, review or ranking changed: empty the page cache so lists are never out of date. */
	public static function clear_page_cache() {
		if ( function_exists( 'wp_cache_clear_cache' ) ) {
			wp_cache_clear_cache();
			return;
		}
		$dir = WP_CONTENT_DIR . '/cache/supercache';
		if ( ! is_dir( $dir ) ) {
			return;
		}
		$it = new \RecursiveIteratorIterator( new \RecursiveDirectoryIterator( $dir, \FilesystemIterator::SKIP_DOTS ), \RecursiveIteratorIterator::CHILD_FIRST );
		foreach ( $it as $f ) {
			$f->isDir() ? @rmdir( $f->getPathname() ) : @unlink( $f->getPathname() ); // phpcs:ignore
		}
	}

	public static function is_private_page() {
		foreach ( self::PRIVATE_PAGES as $k ) {
			if ( Install::is_page( $k ) ) {
				return true;
			}
		}
		return function_exists( 'is_cart' ) && ( is_cart() || is_checkout() || is_account_page() );
	}

	public static function no_cache_private_pages() {
		if ( self::is_private_page() ) {
			self::no_cache();
			nocache_headers();
		}
	}

	/* ---------------- SEO ---------------- */

	public static function robots( $robots ) {
		if ( self::is_private_page() || ( is_singular() && Languages::needs_translation( get_queried_object_id() ) ) ) {
			$robots['index']  = 'noindex';
			$robots['follow'] = 'follow';
		}
		return $robots;
	}

	public static function sitemap_exclude( $ids ) {
		$ids = (array) $ids;
		foreach ( self::PRIVATE_PAGES as $k ) {
			$ids = array_merge( $ids, Install::page_ids_all( $k ) );
		}
		$ids = array_merge( $ids, Install::page_ids_all( 'agreement' ), Install::page_ids_all( 'checkin' ) );
		$untranslated = get_posts( array( 'post_type' => array( 'page', 'post' ), 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => -1, 'meta_key' => Languages::META, 'lang' => '' ) ); // phpcs:ignore
		return array_values( array_unique( array_filter( array_map( 'intval', array_merge( $ids, $untranslated ) ) ) ) );
	}

	/* ---------------- WhatsApp button ---------------- */

	public static function joinchat_show( $show ) {
		if ( self::is_private_page() || Install::is_page( 'map' ) ) {
			return false;
		}
		return $show;
	}

	/** Keep the floating button above the mobile bottom bar. */
	public static function joinchat_css() {
		echo '<style id="ek-joinchat">@media (max-width:1024px){body.ekt-has-bottom-nav .joinchat{--bottom:calc(76px + env(safe-area-inset-bottom,0px))}}</style>' . "\n";
	}

	/* ---------------- WebP ---------------- */

	/** New uploads: JPEG and PNG sizes are saved as WebP (smaller files; all current browsers show them). */
	public static function webp( $formats ) {
		if ( ! apply_filters( 'ek_webp_enabled', true ) || ! wp_image_editor_supports( array( 'mime_type' => 'image/webp' ) ) ) {
			return $formats;
		}
		$formats['image/jpeg'] = 'image/webp';
		$formats['image/png']  = 'image/webp';
		return $formats;
	}

	/** Regenerate the sizes of existing photos (WebP). Returns how many were done. */
	public static function convert_library( $limit = 0, $force = false ) {
		require_once ABSPATH . 'wp-admin/includes/image.php';
		$ids  = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'post_mime_type' => array( 'image/jpeg', 'image/png' ), 'fields' => 'ids', 'posts_per_page' => $limit ? $limit : -1, 'lang' => '' ) );
		$done = 0;
		foreach ( $ids as $id ) {
			$meta = wp_get_attachment_metadata( $id );
			$size = $meta['sizes']['medium']['mime-type'] ?? '';
			if ( 'image/webp' === $size && ! $force ) {
				continue;
			}
			$file = get_attached_file( $id );
			if ( ! $file || ! file_exists( $file ) ) {
				continue;
			}
			$old = $meta['sizes'] ?? array();
			$new = wp_generate_attachment_metadata( $id, $file );
			if ( $new && ! is_wp_error( $new ) ) {
				wp_update_attachment_metadata( $id, $new );
				// Remove the old JPEG/PNG sizes that are no longer used.
				$dir = trailingslashit( dirname( $file ) );
				$keep = wp_list_pluck( $new['sizes'] ?? array(), 'file' );
				foreach ( $old as $s ) {
					if ( ! empty( $s['file'] ) && ! in_array( $s['file'], $keep, true ) && file_exists( $dir . $s['file'] ) ) {
						wp_delete_file( $dir . $s['file'] );
					}
				}
				$done++;
			}
		}
		return $done;
	}

	/* ---------------- Contact form (Fluent Forms) ---------------- */

	public static function contact_form() {
		$id = (int) get_option( 'ek_contact_form' );
		if ( ! $id || ! shortcode_exists( 'fluentform' ) ) {
			return '<p><a href="mailto:info@explorekatsina.com.ng">info@explorekatsina.com.ng</a></p>';
		}
		self::no_cache();
		wp_enqueue_style( 'ek' );
		return '<div class="ek-contact-form">' . do_shortcode( '[fluentform id="' . $id . '"]' ) . '</div>';
	}

	/* ---------------- Newsletter (MailPoet) ---------------- */

	public static function mailpoet_list_id() {
		return (int) get_option( 'ek_newsletter_list' );
	}

	public static function newsletter_form() {
		if ( ! class_exists( '\MailPoet\API\API' ) || ! self::mailpoet_list_id() ) {
			return '';
		}
		// No security code here, on purpose: the box is in the footer of every page and must not stop
		// pages from being cached. Abuse is limited by the hidden robot trap, a per-visitor limit and the
		// confirmation email (nobody is subscribed without clicking the link).
		$state = sanitize_key( wp_unslash( $_GET['ek_news'] ?? '' ) ); // phpcs:ignore WordPress.Security.NonceVerification
		$msgs  = array(
			'ok'      => __( 'Almost done: please check your email and click the link to confirm.', 'explore-katsina' ),
			'already' => __( 'You are already on the list. Thank you!', 'explore-katsina' ),
			'bad'     => __( 'Please enter a valid email address and tick the box.', 'explore-katsina' ),
			'error'   => __( 'Sorry, something went wrong. Please try again later.', 'explore-katsina' ),
		);
		ob_start();
		?>
		<form class="ek-newsletter" method="post" action="<?php echo esc_url( remove_query_arg( 'ek_news' ) ); ?>#ek-newsletter" id="ek-newsletter">
			<p class="ek-newsletter-title"><strong><?php esc_html_e( 'Get Katsina news', 'explore-katsina' ); ?></strong><br><span><?php esc_html_e( 'Festivals, new places and offers, about once a month.', 'explore-katsina' ); ?></span></p>
			<?php if ( isset( $msgs[ $state ] ) ) : ?><p class="ek-newsletter-msg" role="status"><?php echo esc_html( $msgs[ $state ] ); ?></p><?php endif; ?>
			<input type="hidden" name="ek_action" value="newsletter">
			<label class="ek-visually-hidden" for="ek-news-email"><?php esc_html_e( 'Email address', 'explore-katsina' ); ?></label>
			<span class="ek-newsletter-row"><input type="email" id="ek-news-email" name="ek_news_email" required autocomplete="email" placeholder="<?php esc_attr_e( 'Your email address', 'explore-katsina' ); ?>"><button type="submit"><?php esc_html_e( 'Sign up', 'explore-katsina' ); ?></button></span>
			<span class="ek-hp" aria-hidden="true"><input type="text" name="ek_news_website" tabindex="-1" autocomplete="off"></span>
			<label class="ek-newsletter-consent"><input type="checkbox" name="ek_news_consent" value="1" required> <?php esc_html_e( 'I agree to receive emails from Explore Katsina. I can unsubscribe at any time.', 'explore-katsina' ); ?></label>
		</form>
		<?php
		return (string) ob_get_clean();
	}

	public static function newsletter_submit() {
		if ( 'POST' !== ( $_SERVER['REQUEST_METHOD'] ?? '' ) || 'newsletter' !== ( $_POST['ek_action'] ?? '' ) ) { // phpcs:ignore
			return;
		}
		$back = static function ( $state ) {
			wp_safe_redirect( add_query_arg( 'ek_news', $state, wp_get_referer() ? wp_get_referer() : home_url( '/' ) ) . '#ek-newsletter' );
			exit;
		};
		$email = sanitize_email( wp_unslash( $_POST['ek_news_email'] ?? '' ) );
		if ( ! empty( $_POST['ek_news_website'] ) ) {
			$back( 'ok' ); // Robot: pretend it worked.
		}
		if ( ! is_email( $email ) || empty( $_POST['ek_news_consent'] ) ) {
			$back( 'bad' );
		}
		$ip  = md5( (string) ( $_SERVER['REMOTE_ADDR'] ?? '' ) );
		$key = 'ek_news_rate_' . $ip;
		$n   = (int) get_transient( $key );
		if ( $n >= 5 ) {
			$back( 'error' );
		}
		set_transient( $key, $n + 1, HOUR_IN_SECONDS );
		$state = self::subscribe( $email );
		$back( $state );
	}

	/** @return string ok|already|error */
	public static function subscribe( $email ) {
		if ( ! class_exists( '\MailPoet\API\API' ) || ! self::mailpoet_list_id() ) {
			return 'error';
		}
		$api = \MailPoet\API\API::MP( 'v1' );
		try {
			$sub = $api->getSubscriber( $email );
			if ( 'subscribed' === ( $sub['status'] ?? '' ) ) {
				return 'already';
			}
			$api->subscribeToList( $sub['id'], self::mailpoet_list_id(), array( 'send_confirmation_email' => true ) );
			return 'ok';
		} catch ( \Exception $e ) {
			unset( $e ); // Not a subscriber yet.
		}
		try {
			$api->addSubscriber( array( 'email' => $email ), array( self::mailpoet_list_id() ), array( 'send_confirmation_email' => true, 'schedule_welcome_email' => true ) );
			return 'ok';
		} catch ( \Exception $e ) {
			Log::add( 'newsletter_error', 'site', 0, $e->getMessage() );
			return 'error';
		}
	}

	/* ---------------- Login lockouts (local site only) ---------------- */

	public static function local_whitelist( $list ) {
		if ( 'local' !== wp_get_environment_type() ) {
			return $list;
		}
		return array_values( array_unique( array_merge( (array) $list, array( '127.0.0.1', '::1', '172.16.0.0/12', '192.168.0.0/16' ) ) ) );
	}

	/* ---------------- Setup (wp ek plugins-setup) ---------------- */

	/** @return array plugin => what was done */
	public static function setup() {
		$done = (array) get_option( self::DONE, array() );
		$out  = array();
		$run  = array(
			'rank-math' => array( defined( 'RANK_MATH_VERSION' ), 'setup_rank_math' ),
			'wordfence' => array( class_exists( 'wfConfig' ), 'setup_wordfence' ),
			'llar'      => array( class_exists( '\LLAR\Core\Config' ), 'setup_llar' ),
			'updraft'   => array( class_exists( 'UpdraftPlus_Options' ), 'setup_updraft' ),
			'cache'     => array( function_exists( 'wp_cache_setting' ) || defined( 'WPCACHEHOME' ), 'setup_cache' ),
			'smush'     => array( defined( 'WP_SMUSH_VERSION' ), 'setup_smush' ),
			'joinchat'  => array( class_exists( 'Joinchat' ) || defined( 'JOINCHAT_VERSION' ), 'setup_joinchat' ),
			'fluentform' => array( defined( 'FLUENTFORM_VERSION' ), 'setup_fluentform' ),
			'mailpoet'  => array( class_exists( '\MailPoet\API\API' ), 'setup_mailpoet' ),
			'fluentsmtp' => array( defined( 'FLUENTMAIL_PLUGIN_VERSION' ), 'setup_fluentsmtp' ),
		);
		foreach ( $run as $key => $r ) {
			if ( ! $r[0] ) {
				$out[ $key ] = 'not active';
				continue;
			}
			if ( ! empty( $done[ $key ] ) ) {
				$out[ $key ] = 'already set up';
				continue;
			}
			$out[ $key ]  = (string) call_user_func( array( __CLASS__, $r[1] ) );
			$done[ $key ] = time();
			update_option( self::DONE, $done, false );
		}
		return $out;
	}

	public static function setup_rank_math() {
		$modules = array( 'seo-analysis', 'sitemap', 'rich-snippet', 'redirections', '404-monitor', 'woocommerce' );
		update_option( 'rank_math_modules', $modules );
		if ( class_exists( '\RankMath\Installer' ) ) {
			\RankMath\Installer::create_tables( $modules ); // Redirections and 404 log need their tables.
		}
		update_option( 'rank_math_wizard_completed', true );
		update_option( 'rank_math_registration_skip', true );
		$t = (array) get_option( 'rank-math-options-titles', array() );
		$t['title_separator']      = '–';
		$t['homepage_title']       = 'Explore Katsina – Hotels, restaurants, event centres & things to do in Katsina State';
		$t['homepage_description'] = 'Book hotels, restaurants and event centres in Katsina State, Nigeria. Festivals, attractions and travel tips, with honest rankings from verified guests.';
		$t['knowledgegraph_type']  = 'company';
		$t['knowledgegraph_name']  = 'Explore Katsina';
		$t['website_name']         = 'Explore Katsina';
		// Our own structured data comes in Phase 14; until then no generic "Article" markup on listings.
		foreach ( array( Post_Types::BUSINESS, Attractions::CPT, Events::CPT, Tours::CPT ) as $pt ) {
			$t[ 'pt_' . $pt . '_default_rich_snippet' ] = 'off';
		}
		update_option( 'rank-math-options-titles', $t );
		$s = (array) get_option( 'rank-math-options-sitemap', array() );
		$s['authors_sitemap'] = 'off';
		$s['html_sitemap']    = 'off';
		update_option( 'rank-math-options-sitemap', $s );
		$g = (array) get_option( 'rank-math-options-general', array() );
		$g['new_window_external_links'] = 'off'; // Keep visitors' choice; accessibility.
		$g['console_email_reports']     = 'off';
		update_option( 'rank-math-options-general', $g );
		update_option( 'rank_math_flush_rewrite', 1 );
		return 'titles, sitemap, redirects; account-only modules off';
	}

	public static function setup_wordfence() {
		\wfConfig::set( 'loginSecurityEnabled', 0 );   // Login lockouts: Limit Login Attempts Reloaded.
		\wfConfig::set( 'loginSec_disableAuthorScan', 1 ); // Hide usernames (/?author=1).
		\wfConfig::set( 'liveTrafficEnabled', 0 );     // Lighter on the server.
		\wfConfig::set( 'alertEmails', get_option( 'admin_email' ) );
		return 'firewall + scans on; its login lockouts off (LLAR does that); author scans blocked';
	}

	public static function setup_llar() {
		\LLAR\Core\Config::update( 'allowed_retries', 4 );
		\LLAR\Core\Config::update( 'lockout_duration', 20 * MINUTE_IN_SECONDS );
		\LLAR\Core\Config::update( 'gdpr', 1 ); // Store as little as possible about visitors.
		return '4 tries, 20-minute lockout';
	}

	public static function setup_updraft() {
		\UpdraftPlus_Options::update_updraft_option( 'updraft_interval_database', 'daily' );
		\UpdraftPlus_Options::update_updraft_option( 'updraft_retain_db', 14 );
		\UpdraftPlus_Options::update_updraft_option( 'updraft_interval', 'weekly' );
		\UpdraftPlus_Options::update_updraft_option( 'updraft_retain', 4 );
		\UpdraftPlus_Options::update_updraft_option( 'updraft_email', get_option( 'admin_email' ) );
		foreach ( array( 'plugins', 'themes', 'uploads', 'others' ) as $part ) {
			\UpdraftPlus_Options::update_updraft_option( 'updraft_include_' . $part, 1 );
		}
		return 'database daily (14 kept), files weekly (4 kept); remote storage: owner to connect';
	}

	public static function setup_cache() {
		if ( ! function_exists( 'wp_cache_setting' ) || ! function_exists( 'wp_cache_enable' ) ) {
			return 'cache plugin files not loaded (open Settings → WP Super Cache once)';
		}
		if ( function_exists( 'wp_cache_create_advanced_cache' ) ) {
			wp_cache_create_advanced_cache();
		}
		wp_cache_enable();
		wp_super_cache_enable();
		wp_cache_setting( 'wp_cache_mod_rewrite', 0 );   // "Simple" mode: works on any host.
		wp_cache_setting( 'wp_cache_not_logged_in', 2 ); // 2 = only logged-in people skip the cache (1 would skip anyone with any cookie).
		wp_cache_setting( 'cache_max_time', 3600 );
		wp_cache_setting( 'cache_compression', 0 );
		$rejected_uris = array( 'wp-.*\\.php', 'index\\.php', 'wp-json', '/book/', '/account/', '/business-dashboard/', '/check-in/', '/cart/', '/checkout/', '/my-account/', 'list-your-business', 'promote-event', 'listing-setup' );
		wp_cache_setting( 'cache_rejected_uri', $rejected_uris );
		wp_cache_setting( 'wpsc_rejected_cookies', array( 'woocommerce_items_in_cart', 'wp_woocommerce_session_' ) );
		return 'on (1 hour, visitors not logged in); booking, account, checkout pages never cached';
	}

	public static function setup_smush() {
		$s = (array) get_option( 'wp-smush-settings', array() );
		$s['auto']       = true;
		$s['lossy']      = 0;     // Free: lossless.
		$s['strip_exif'] = true;  // Removes camera and location data from photos.
		$s['resize']     = true;
		$s['lazy_load']  = false; // WordPress already lazy-loads images.
		$s['usage']      = false; // No usage tracking.
		update_option( 'wp-smush-settings', $s );
		update_option( 'wp-smush-resize_sizes', array( 'width' => 2560, 'height' => 2560 ) );
		update_option( 'wp-smush-hide_smush_welcome', true );
		return 'auto-compress, strip location data, max 2560 px; lazy load left to WordPress';
	}

	public static function setup_joinchat() {
		$o = (array) get_option( 'joinchat', array() );
		$o = array_merge(
			$o,
			array(
				'telephone'     => $o['telephone'] ?? self::PLACEHOLDER_WHATSAPP,
				'button_tip'    => __( 'Chat with us on WhatsApp', 'explore-katsina' ),
				'message_text'  => '',
				'message_send'  => __( 'Hello Explore Katsina, I have a question:', 'explore-katsina' ),
				'message_delay' => -1,   // No pop-up message: less intrusive.
				'button_delay'  => 2,
				'position'      => 'right',
				'mobile_only'   => 'no',
				'color'         => '#1F6B52/1',
				'header'        => 'Explore Katsina',
				'tracking'      => 'no',
				'show_brand'    => 'no',
			)
		);
		update_option( 'joinchat', $o );
		return 'WhatsApp button (PLACEHOLDER number ' . self::PLACEHOLDER_WHATSAPP . ')';
	}

	public static function setup_fluentform() {
		global $wpdb;
		$forms = $wpdb->prefix . 'fluentform_forms';
		$meta  = $wpdb->prefix . 'fluentform_form_meta';
		$id    = (int) get_option( 'ek_contact_form' );
		if ( ! $id || ! $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$forms} WHERE id = %d", $id ) ) ) { // phpcs:ignore
			$wpdb->insert(
				$forms,
				array(
					'title'               => 'Contact Explore Katsina',
					'status'              => 'published',
					'appearance_settings' => null,
					'form_fields'         => wp_json_encode( self::contact_fields() ),
					'has_payment'         => 0,
					'type'                => 'form',
					'conditions'          => null,
					'created_by'          => 1,
					'created_at'          => current_time( 'mysql' ),
					'updated_at'          => current_time( 'mysql' ),
				)
			);
			$id = (int) $wpdb->insert_id;
			$settings = array(
				'confirmation'               => array( 'redirectTo' => 'samePage', 'messageToShow' => __( 'Thank you, we have received your message and will reply within 2 working days.', 'explore-katsina' ), 'customPage' => null, 'samePageFormBehavior' => 'hide_form', 'customUrl' => null ),
				'restrictions'               => array( 'denyEmptySubmission' => array( 'enabled' => true, 'message' => __( 'Please fill in the form.', 'explore-katsina' ) ) ),
				'layout'                     => array( 'labelPlacement' => 'top', 'helpMessagePlacement' => 'with_label', 'errorMessagePlacement' => 'inline', 'cssClassName' => 'ek-ff', 'asteriskPlacement' => 'asterisk-right' ),
				'delete_entry_on_submission' => 'no',
			);
			$notify = array(
				'name'          => 'Email to Explore Katsina',
				'sendTo'        => array( 'type' => 'email', 'email' => '{wp.admin_email}', 'field' => 'email', 'routing' => array() ),
				'fromName'      => 'Explore Katsina website',
				'fromEmail'     => '',
				'replyTo'       => '{inputs.email}',
				'bcc'           => '',
				'subject'       => 'Website message: {inputs.topic}',
				'message'       => '<p>{all_data}</p>',
				'conditionals'  => array( 'status' => false, 'type' => 'all', 'conditions' => array() ),
				'enabled'       => true,
				'email_template' => '',
			);
			$wpdb->insert( $meta, array( 'form_id' => $id, 'meta_key' => 'formSettings', 'value' => wp_json_encode( $settings ) ) ); // phpcs:ignore
			$wpdb->insert( $meta, array( 'form_id' => $id, 'meta_key' => 'notifications', 'value' => wp_json_encode( $notify ) ) ); // phpcs:ignore
			$wpdb->insert( $meta, array( 'form_id' => $id, 'meta_key' => 'template_name', 'value' => 'ek_contact' ) ); // phpcs:ignore
			update_option( 'ek_contact_form', $id );
		}
		// Fluent Forms' own demo forms are not used.
		foreach ( array( 'Contact Form Demo', 'Subscription Form' ) as $demo ) {
			$demo_id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$forms} WHERE title = %s", $demo ) ); // phpcs:ignore
			if ( $demo_id ) {
				$wpdb->delete( $forms, array( 'id' => $demo_id ) );
				$wpdb->delete( $meta, array( 'form_id' => $demo_id ) );
			}
		}
		Install::add_pages();
		return 'contact form #' . $id . ' on the Contact page';
	}

	/** Fluent Forms field definitions for the contact form. */
	private static function contact_fields() {
		$req   = static fn( $on, $msg = '' ) => array( 'required' => array( 'value' => $on, 'message' => $msg ? $msg : __( 'This field is required', 'explore-katsina' ) ) );
		$text  = static fn( $i, $name, $label, $type, $required, $placeholder = '', $el = 'input_text' ) => array(
			'index'          => $i,
			'element'        => $el,
			'attributes'     => array( 'type' => $type, 'name' => $name, 'value' => '', 'class' => '', 'placeholder' => $placeholder ),
			'settings'       => array( 'container_class' => '', 'label' => $label, 'label_placement' => '', 'admin_field_label' => $label, 'help_message' => '', 'validation_rules' => 'input_email' === $el ? $req( true ) + array( 'email' => array( 'value' => true, 'message' => __( 'Please enter a valid email address', 'explore-katsina' ) ) ) : $req( $required ), 'conditional_logics' => array() ),
			'editor_options' => array( 'title' => $label, 'template' => 'inputText' ),
			'uniqElKey'      => 'el_ek_' . $name,
		);
		$topics = array( __( 'General question', 'explore-katsina' ), __( 'Help with a booking', 'explore-katsina' ), __( 'Listing my business', 'explore-katsina' ), __( 'Advertising', 'explore-katsina' ), __( 'Report a problem or mistake', 'explore-katsina' ), __( 'Media and partnerships', 'explore-katsina' ) );
		return array(
			'fields'       => array(
				$text( 0, 'full_name', __( 'Your name', 'explore-katsina' ), 'text', true ),
				$text( 1, 'email', __( 'Email', 'explore-katsina' ), 'email', true, '', 'input_email' ),
				$text( 2, 'phone', __( 'Phone (optional)', 'explore-katsina' ), 'tel', false, '0803 123 4567' ),
				array(
					'index'          => 3,
					'element'        => 'select',
					'attributes'     => array( 'name' => 'topic', 'value' => '', 'class' => '', 'id' => '' ),
					'settings'       => array( 'container_class' => '', 'label_placement' => '', 'admin_field_label' => 'Topic', 'label' => __( 'What is it about?', 'explore-katsina' ), 'help_message' => '', 'placeholder' => __( 'Choose…', 'explore-katsina' ), 'advanced_options' => array_map( static fn( $t ) => array( 'label' => $t, 'value' => $t, 'calc_value' => '', 'image' => '' ), $topics ), 'calc_value_status' => false, 'enable_select_2' => 'no', 'enable_image_input' => false, 'validation_rules' => $req( true ), 'randomize_options' => 'no', 'conditional_logics' => array() ),
					'editor_options' => array( 'title' => 'Dropdown', 'icon_class' => 'ff-edit-dropdown', 'element' => 'select', 'template' => 'select' ),
					'uniqElKey'      => 'el_ek_topic',
				),
				array(
					'index'          => 4,
					'element'        => 'textarea',
					'attributes'     => array( 'name' => 'message', 'value' => '', 'id' => '', 'class' => '', 'placeholder' => '', 'rows' => 5, 'cols' => 2 ),
					'settings'       => array( 'container_class' => '', 'label' => __( 'Message', 'explore-katsina' ), 'admin_field_label' => 'Message', 'label_placement' => '', 'help_message' => __( 'If it is about a booking, please include your booking code.', 'explore-katsina' ), 'validation_rules' => $req( true ), 'conditional_logics' => array() ),
					'editor_options' => array( 'title' => 'Text Area', 'icon_class' => 'ff-edit-textarea', 'template' => 'inputTextarea' ),
					'uniqElKey'      => 'el_ek_message',
				),
				array(
					'index'          => 5,
					'element'        => 'gdpr_agreement',
					'attributes'     => array( 'type' => 'checkbox', 'name' => 'consent', 'value' => false, 'class' => 'ff_gdpr_field' ),
					'settings'       => array( 'label' => __( 'Consent', 'explore-katsina' ), 'tnc_html' => __( 'I agree that Explore Katsina may use these details to reply to me (Nigeria Data Protection Act 2023).', 'explore-katsina' ), 'admin_field_label' => 'Consent', 'has_checkbox' => true, 'container_class' => '', 'validation_rules' => $req( true, __( 'Please tick the box so we can reply to you.', 'explore-katsina' ) ), 'required_field_message' => '', 'conditional_logics' => array() ),
					'editor_options' => array( 'title' => 'GDPR Agreement', 'icon_class' => 'ff-edit-gdpr', 'template' => 'termsCheckbox' ),
					'uniqElKey'      => 'el_ek_consent',
				),
			),
			'submitButton' => array( 'uniqElKey' => 'el_ek_submit', 'element' => 'button', 'attributes' => array( 'type' => 'submit', 'class' => '' ), 'settings' => array( 'align' => 'left', 'button_style' => 'default', 'container_class' => '', 'help_message' => '', 'background_color' => '#8E1B2C', 'button_size' => 'md', 'color' => '#ffffff', 'button_ui' => array( 'type' => 'default', 'text' => __( 'Send message', 'explore-katsina' ), 'img_url' => '' ) ), 'editor_options' => array( 'title' => 'Submit Button' ) ),
		);
	}

	public static function setup_mailpoet() {
		$api = \MailPoet\API\API::MP( 'v1' );
		$id  = self::mailpoet_list_id();
		$ids = wp_list_pluck( $api->getLists(), 'id' );
		if ( ! $id || ! in_array( (string) $id, array_map( 'strval', $ids ), true ) ) {
			$list = $api->addList( array( 'name' => 'Explore Katsina news', 'description' => 'Festivals, new places and offers, about once a month.' ) );
			$id   = (int) $list['id'];
			update_option( 'ek_newsletter_list', $id );
		}
		$s = \MailPoet\Settings\SettingsController::getInstance();
		if ( null === $s->get( 'version' ) && defined( 'MAILPOET_VERSION' ) ) {
			$s->set( 'version', MAILPOET_VERSION ); // Skip the first-run wizard.
		}
		$s->set( 'woocommerce_import_screen_displayed', 1 );
		$s->set( 'sender', array( 'name' => 'Explore Katsina', 'address' => 'info@explorekatsina.com.ng' ) );
		$s->set( 'reply_to', array( 'name' => 'Explore Katsina', 'address' => 'info@explorekatsina.com.ng' ) );
		$s->set( 'signup_confirmation.enabled', '1' );
		$s->set( 'analytics', array( 'enabled' => '' ) );
		$s->set( '3rd_party_libs', array( 'enabled' => '0' ) );
		if ( defined( 'EK_LOCAL_SMTP_HOST' ) && EK_LOCAL_SMTP_HOST ) {
			// Local test site only: newsletter mail goes to the test inbox.
			$s->set( 'mta_group', 'smtp' );
			$s->set( 'mta', array( 'method' => 'SMTP', 'host' => EK_LOCAL_SMTP_HOST, 'port' => defined( 'EK_LOCAL_SMTP_PORT' ) ? (string) EK_LOCAL_SMTP_PORT : '1025', 'authentication' => '-1', 'encryption' => '', 'login' => '', 'password' => '', 'frequency' => array( 'emails' => 25, 'interval' => 5 ) ) );
		}
		return 'list #' . $id . ' "Explore Katsina news", double opt-in, sender info@explorekatsina.com.ng (PLACEHOLDER)';
	}

	public static function setup_fluentsmtp() {
		$s = get_option( 'fluentmail-settings' );
		if ( ! is_array( $s ) ) {
			$s = array( 'mappings' => array(), 'connections' => array() );
		}
		$s['misc'] = array_merge(
			(array) ( $s['misc'] ?? array() ),
			array( 'log_emails' => 'yes', 'log_saved_interval_days' => '14', 'disable_fluentcrm_logs' => 'no', 'default_connection' => $s['misc']['default_connection'] ?? '', 'fallback_connection' => $s['misc']['fallback_connection'] ?? '' )
		);
		update_option( 'fluentmail-settings', $s );
		return 'email log kept 14 days; mail service to be added by the owner';
	}
}
