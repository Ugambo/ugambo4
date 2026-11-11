<?php
/**
 * Phase 12 checks: the free helper plugins are active, set up for Explore Katsina, not duplicating each
 * other, and compatible with our bookings and WooCommerce: SEO (noindex + sitemap rules), security
 * (login lockouts in one place), backups, page cache (private pages never cached, lists refreshed),
 * images (WebP), WhatsApp button, contact form, newsletter (double opt-in), email.
 * Run: wp eval-file ek-tests/phase12-plugins.php
 */

use EK\Install;
use EK\Integrations;
use EK\Languages;

$GLOBALS['ek_fail'] = 0;
function ek12( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
function ek12_on( $id ) {
	$GLOBALS['wp_query']     = new WP_Query( array( 'page_id' => $id ) );
	$GLOBALS['wp_the_query'] = $GLOBALS['wp_query'];
}
$stamp = 't' . wp_rand( 10000, 99999 );

WP_CLI::line( 'Plugins active (free versions)' );
$want = array( 'seo-by-rank-math/rank-math.php', 'wordfence/wordfence.php', 'limit-login-attempts-reloaded/limit-login-attempts-reloaded.php', 'updraftplus/updraftplus.php', 'wp-super-cache/wp-cache.php', 'wp-smushit/wp-smush.php', 'creame-whatsapp-me/joinchat.php', 'fluentform/fluentform.php', 'mailpoet/mailpoet.php', 'fluent-smtp/fluent-smtp.php', 'polylang/polylang.php', 'woocommerce/woocommerce.php', 'explore-katsina-core/explore-katsina-core.php' );
foreach ( $want as $p ) {
	ek12( is_plugin_active( $p ), 'Active: ' . dirname( $p ) );
}
$pro = array_filter( array_keys( get_plugins() ), static fn( $p ) => preg_match( '/(-pro|premium)\//i', $p ) );
ek12( ! $pro, 'No paid ("Pro") plugins installed' );
foreach ( array( 'litespeed-cache/litespeed-cache.php', 'w3-total-cache/w3-total-cache.php', 'wordpress-seo/wp-seo.php', 'all-in-one-seo-pack/all_in_one_seo_pack.php', 'ewww-image-optimizer/ewww-image-optimizer.php', 'shortpixel-image-optimiser/wp-shortpixel.php', 'wpforms-lite/wpforms.php', 'contact-form-7/wp-contact-form-7.php', 'wp-mail-smtp/wp_mail_smtp.php' ) as $dup ) {
	ek12( ! is_plugin_active( $dup ), 'No duplicate plugin: ' . dirname( $dup ) );
}
$done = (array) get_option( Integrations::DONE );
ek12( 10 === count( $done ), 'All 10 helper plugins set up once (re-run keeps wp-admin changes)' );
$again = Integrations::setup();
ek12( 10 === count( array_filter( $again, static fn( $v ) => 'already set up' === $v ) ), 'Setup is safe to re-run' );

WP_CLI::line( 'SEO (Rank Math)' );
$mods = (array) get_option( 'rank_math_modules' );
ek12( in_array( 'sitemap', $mods, true ) && ! in_array( 'analytics', $mods, true ) && ! in_array( 'content-ai', $mods, true ), 'Sitemap on; modules that need outside accounts off' );
ek12( false !== strpos( (string) ( get_option( 'rank-math-options-titles' )['homepage_title'] ?? '' ), 'Katsina' ), 'Homepage title set' );
ek12( 'off' === ( get_option( 'rank-math-options-titles' )['pt_ek_business_default_rich_snippet'] ?? '' ), 'No generic "Article" markup on listings (our own comes in Phase 14)' );
global $wpdb;
ek12( $wpdb->get_var( "SHOW TABLES LIKE '{$wpdb->prefix}rank_math_redirections'" ) && $wpdb->get_var( "SHOW TABLES LIKE '{$wpdb->prefix}rank_math_404_logs'" ), 'Redirections and 404 log tables exist (no database errors on pages)' );
ek12_on( Install::page_id( 'book' ) );
ek12( 'noindex' === ( Integrations::robots( array( 'index' => 'index' ) )['index'] ?? '' ), 'Booking page: noindex' );
ek12_on( (int) pll_get_post( Install::page_id( 'hotels' ), 'ha' ) );
ek12( 'noindex' === ( Integrations::robots( array( 'index' => 'index' ) )['index'] ?? '' ), 'Untranslated Hausa pages: noindex' );
ek12_on( Install::page_id( 'hotels' ) );
ek12( 'index' === ( Integrations::robots( array( 'index' => 'index' ) )['index'] ?? '' ), 'Normal pages stay indexed' );
$ex = Integrations::sitemap_exclude( array() );
ek12( in_array( Install::page_id( 'dashboard' ), $ex, true ) && in_array( Install::page_id( 'account' ), $ex, true ) && in_array( (int) pll_get_post( Install::page_id( 'hotels' ), 'ha' ), $ex, true ) && ! in_array( Install::page_id( 'hotels' ), $ex, true ), 'Sitemap leaves out private and untranslated pages' );

WP_CLI::line( 'Security' );
ek12( 0 === (int) wfConfig::get( 'loginSecurityEnabled' ) && 1 === (int) wfConfig::get( 'loginSec_disableAuthorScan' ), 'Wordfence: firewall/scans; its own login lockouts off (no double lockouts); usernames hidden' );
ek12( 4 === (int) \LLAR\Core\Config::get( 'allowed_retries' ) && 1200 === (int) \LLAR\Core\Config::get( 'lockout_duration' ), 'Limit Login Attempts: 4 tries, 20-minute lockout' );
ek12( 'local' === wp_get_environment_type() ? in_array( '127.0.0.1', (array) get_option( 'limit_login_whitelist' ), true ) : true, 'Local test site only: own machine never locked out by the automated checks' );

WP_CLI::line( 'Backups (UpdraftPlus)' );
ek12( 'daily' === UpdraftPlus_Options::get_updraft_option( 'updraft_interval_database' ) && 'weekly' === UpdraftPlus_Options::get_updraft_option( 'updraft_interval' ), 'Database daily, files weekly' );
ek12( 14 === (int) UpdraftPlus_Options::get_updraft_option( 'updraft_retain_db' ) && 4 === (int) UpdraftPlus_Options::get_updraft_option( 'updraft_retain' ), 'Keeps 14 database and 4 file backups' );
$ht = WP_CONTENT_DIR . '/updraft/.htaccess';
ek12( file_exists( $ht ) && false !== stripos( (string) file_get_contents( $ht ), 'deny' ), 'Backup folder blocked from the web' );

WP_CLI::line( 'Page cache (WP Super Cache)' );
global $cache_enabled, $super_cache_enabled, $cache_max_time, $cache_rejected_uri, $wp_cache_not_logged_in;
$cfg = WP_CONTENT_DIR . '/wp-cache-config.php';
if ( file_exists( $cfg ) ) {
	include $cfg;
}
ek12( defined( 'WP_CACHE' ) && WP_CACHE && ! empty( $cache_enabled ) && ! empty( $super_cache_enabled ), 'Cache on' );
ek12( 3600 === (int) $cache_max_time && 2 === (int) $wp_cache_not_logged_in, 'Pages kept 1 hour; logged-in people always see fresh pages (other visitors are cached even with cookies)' );
foreach ( array( '/book/', '/account/', '/business-dashboard/', '/check-in/', '/checkout/', 'wp-json' ) as $u ) {
	ek12( in_array( $u, (array) $cache_rejected_uri, true ), "Never cached: {$u}" );
}
ek12_on( Install::page_id( 'account' ) );
ek12( Integrations::is_private_page(), 'My Account recognised as private (no cache, no index)' );
$tpl_html = do_shortcode( '[ek_advertise]' );
ek12( did_action( 'ek_rendered_form' ) > 0, 'Pages with our forms (security codes) are not cached' );
$fav = EK\Favourites::button( 1 );
ek12( false === strpos( $fav, '_ek_nonce' ), 'Save button has no security code for guests (their pages can be cached)' );
$dir = WP_CONTENT_DIR . '/cache/supercache/ek-test-' . $stamp;
wp_mkdir_p( $dir );
file_put_contents( $dir . '/index.html', 'x' ); // phpcs:ignore
do_action( 'ek_listings_changed', array( 1 ) );
ek12( ! file_exists( $dir . '/index.html' ), 'A listing change empties the page cache (lists and Top 10 never stale)' );

WP_CLI::line( 'Images (Smush free + WordPress WebP)' );
$sm = (array) get_option( 'wp-smush-settings' );
ek12( ! empty( $sm['auto'] ) && ! empty( $sm['strip_exif'] ) && empty( $sm['lazy_load'] ), 'Smush: compress on upload, remove location data; lazy load left to WordPress' );
require_once ABSPATH . 'wp-admin/includes/image.php';
require_once ABSPATH . 'wp-admin/includes/file.php';
require_once ABSPATH . 'wp-admin/includes/media.php';
$img = imagecreatetruecolor( 1200, 800 );
imagefilledrectangle( $img, 0, 0, 1200, 800, imagecolorallocate( $img, 142, 27, 44 ) );
$tmp = wp_tempnam( 'ek12.jpg' );
imagejpeg( $img, $tmp, 90 );
$att = media_handle_sideload( array( 'name' => "ek12-{$stamp}.jpg", 'tmp_name' => $tmp ), 0 );
$meta = is_wp_error( $att ) ? array() : wp_get_attachment_metadata( $att );
ek12( 'image/webp' === ( $meta['sizes']['medium']['mime-type'] ?? '' ), 'New uploads: photo sizes saved as WebP' );
ek12( 'image/webp' === ( $meta['sizes']['large']['mime-type'] ?? '' ) || empty( $meta['sizes']['large'] ), 'Large size WebP too' );
if ( ! is_wp_error( $att ) ) {
	wp_delete_attachment( $att, true );
}
$gob = EK\Guide_Import::media_id( 'gobarau-1' );
ek12( ! $gob || 'image/webp' === ( wp_get_attachment_metadata( $gob )['sizes']['medium']['mime-type'] ?? '' ), 'Existing photos converted (wp ek webp)' );

WP_CLI::line( 'WhatsApp button (Join.chat)' );
$jc = (array) get_option( 'joinchat' );
ek12( Integrations::PLACEHOLDER_WHATSAPP === ( $jc['telephone'] ?? '' ), 'Number: PLACEHOLDER +234 800 000 0000 until the real one is set' );
ek12( -1 === (int) ( $jc['message_delay'] ?? 0 ) && 'no' === ( $jc['tracking'] ?? '' ), 'No pop-up message, no tracking' );
ek12_on( Install::page_id( 'map' ) );
ek12( false === Integrations::joinchat_show( true ), 'Hidden on the full-screen map' );
ek12_on( Install::page_id( 'dashboard' ) );
ek12( false === Integrations::joinchat_show( true ), 'Hidden on the business dashboard' );
ek12_on( Install::page_id( 'hotels' ) );
ek12( true === Integrations::joinchat_show( true ), 'Shown on visitor pages' );

WP_CLI::line( 'Contact form (Fluent Forms)' );
global $wpdb;
$fid = (int) get_option( 'ek_contact_form' );
$ff  = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}fluentform_forms WHERE id = %d", $fid ) );
$fields = $ff ? wp_list_pluck( wp_list_pluck( json_decode( $ff->form_fields, true )['fields'], 'attributes' ), 'name' ) : array();
ek12( $ff && 'published' === $ff->status && array( 'full_name', 'email', 'phone', 'topic', 'message', 'consent' ) === $fields, 'Contact form: name, email, phone, topic, message, consent' );
ek12( 0 === (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->prefix}fluentform_forms WHERE title IN ('Contact Form Demo','Subscription Form')" ), 'Fluent Forms demo forms removed' );
$cp = get_post( Install::page_id( 'contact' ) );
ek12( $cp && false !== strpos( $cp->post_content, '[ek_contact_form]' ) && false !== strpos( do_shortcode( '[ek_contact_form]' ), 'fluentform' ), 'Contact page shows the form' );
ek12( (bool) pll_get_post( $cp->ID, 'ha' ), 'Contact page has a Hausa version (needs translation)' );

WP_CLI::line( 'Newsletter (MailPoet)' );
$list = Integrations::mailpoet_list_id();
$api  = \MailPoet\API\API::MP( 'v1' );
ek12( $list && in_array( 'Explore Katsina news', wp_list_pluck( $api->getLists(), 'name' ), true ), 'List "Explore Katsina news"' );
$ms = \MailPoet\Settings\SettingsController::getInstance();
ek12( '1' === (string) $ms->get( 'signup_confirmation.enabled' ) && 'info@explorekatsina.com.ng' === $ms->get( 'sender.address' ), 'Double opt-in on; sender info@explorekatsina.com.ng (PLACEHOLDER)' );
$email = "ek12_{$stamp}@example.test";
$r1    = Integrations::subscribe( $email );
$sub   = $api->getSubscriber( $email );
ek12( 'ok' === $r1 && 'unconfirmed' === $sub['status'], 'Sign-up: subscriber waits for email confirmation (not subscribed yet)' );
ek12( in_array( (string) $list, array_map( 'strval', wp_list_pluck( $sub['subscriptions'], 'segment_id' ) ), true ), 'Added to the Explore Katsina list' );
$html = do_shortcode( '[ek_newsletter]' );
ek12( false !== strpos( $html, 'ek_news_consent' ) && false !== strpos( $html, 'ek_news_website' ) && false === strpos( $html, 'nonce' ), 'Footer sign-up box: consent tick box, robot trap, cache-friendly' );
$api->unsubscribeFromList( $sub['id'], $list );
try {
	( \MailPoet\DI\ContainerWrapper::getInstance()->get( \MailPoet\Subscribers\SubscribersRepository::class ) )->bulkDelete( array( (int) $sub['id'] ) );
} catch ( \Throwable $e ) {
	unset( $e );
}

WP_CLI::line( 'Email (FluentSMTP)' );
$fs = (array) get_option( 'fluentmail-settings' );
ek12( 'yes' === ( $fs['misc']['log_emails'] ?? '' ), 'Email log on (14 days)' );
remove_all_filters( 'pre_wp_mail' );
ek12( true === wp_mail( "ek12_{$stamp}@example.test", "EK12 mail {$stamp}", 'Test' ), 'Site email still sends with FluentSMTP active' );

WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 12 checks passed.' );
