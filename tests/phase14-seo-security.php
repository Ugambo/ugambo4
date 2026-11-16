<?php
/**
 * Phase 14 checks (server side): structured data for every kind of page, share pictures and search
 * descriptions, the minified files are current and served, WooCommerce files only where needed, and
 * the WordPress lock-down (version hidden, XML-RPC off, password rules, no username leaks, headers,
 * server rules). The browser/HTTP side is tests/e2e/phase14.js; business isolation is
 * tests/e2e/phase14-isolation.js.
 * Run: wp eval-file ek-tests/phase14-seo-security.php (after `wp ek sample-data`).
 */

use EK\Assets;
use EK\Attractions;
use EK\Events;
use EK\Hotel;
use EK\Install;
use EK\Integrations;
use EK\Menu;
use EK\Reviews;
use EK\Rooms;
use EK\Security;
use EK\Seo;
use EK\Tours;

$GLOBALS['ek_fail'] = 0;
function ek14( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
$by = static function ( $title, $type = 'ek_business' ) {
	$p = get_posts( array( 'post_type' => $type, 'title' => $title, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'lang' => '' ) );
	return $p ? (int) $p[0] : 0;
};

WP_CLI::line( 'Structured data (schema.org)' );
$hotel = $by( 'SAMPLE Crimson Gate Hotel' );
$s     = Seo::business( $hotel );
ek14( 'Hotel' === $s['@type'] && 'NG' === $s['address']['addressCountry'] && isset( $s['geo']['latitude'] ), 'Hotel: type, address in Nigeria, map position' );
$stats = Reviews::stats( $hotel );
ek14( isset( $s['aggregateRating'] ) && $stats['overall'] == $s['aggregateRating']['ratingValue'] && $stats['count'] === $s['aggregateRating']['reviewCount'], 'Hotel: rating = average of verified reviews (' . $stats['overall'] . ' from ' . $stats['count'] . ')' );
ek14( count( $s['review'] ) >= 1 && count( $s['review'] ) <= 5 && isset( $s['review'][0]['reviewRating']['ratingValue'] ), 'Hotel: up to 5 recent reviews' );
$rooms = Rooms::for_hotel( $hotel );
ek14( count( $s['makesOffer'] ) === count( $rooms ) && 'NGN' === $s['makesOffer'][0]['priceSpecification']['priceCurrency'] && 'HotelRoom' === $s['makesOffer'][0]['itemOffered']['@type'], 'Hotel: every room with its price in Naira (NGN)' );
ek14( (string) ( min( array_filter( array( $rooms[0]['price'], $rooms[0]['weekend_price'] ) ) ) / 100 ) === $s['makesOffer'][0]['priceSpecification']['price'], 'Hotel: room price matches the page' );
$hs = Hotel::settings( $hotel );
ek14( ( $hs['stars'] && $hs['stars_verified'] ) === isset( $s['starRating'] ), 'Hotel: star rating shown only when our team verified it' );
ek14( preg_match( '/^\d\d:\d\d$/', $s['checkinTime'] ) && preg_match( '/^\d\d:\d\d$/', $s['checkoutTime'] ), 'Hotel: check-in and check-out times' );
$unv = $by( 'SAMPLE Emerald Court Hotel' );
$hu  = Hotel::settings( $unv );
ek14( ( $hu['stars'] && $hu['stars_verified'] ) === isset( Seo::business( $unv )['starRating'] ), 'Unverified stars are left out' );

$rest = $by( 'SAMPLE Mama Tuwo Kitchen' );
$r    = Seo::business( $rest );
$avail = count( Menu::items( $rest, true ) );
$in_schema = array_sum( array_map( static fn( $sec ) => count( $sec['hasMenuItem'] ), $r['hasMenu']['hasMenuSection'] ?? array() ) );
ek14( 'Restaurant' === $r['@type'] && 'Menu' === ( $r['hasMenu']['@type'] ?? '' ) && $in_schema === $avail, "Restaurant: full menu ({$avail} available dishes in sections)" );
ek14( 'NGN' === $r['hasMenu']['hasMenuSection'][0]['hasMenuItem'][0]['offers']['priceCurrency'] && ! empty( $r['servesCuisine'] ) && isset( $r['acceptsReservations'] ), 'Restaurant: dish prices in Naira, cuisine, reservations' );

$venue = $by( 'SAMPLE Grand Durbar Hall' );
$v     = Seo::business( $venue );
ek14( 'EventVenue' === $v['@type'] && $v['maximumAttendeeCapacity'] > 0 && ! empty( $v['makesOffer'] ), 'Event centre: EventVenue with capacity and hall prices' );
foreach ( array( 'transport' => 'LocalBusiness', 'bank' => 'BankOrCreditUnion', 'crafts' => 'Store', 'tour-operator' => 'TravelAgency' ) as $type => $schema ) {
	$q = get_posts( array( 'post_type' => 'ek_business', 'posts_per_page' => 1, 'meta_key' => '_ek_sample_set', 'tax_query' => array( array( 'taxonomy' => 'ek_type', 'field' => 'slug', 'terms' => $type ) ), 'lang' => '' ) ); // phpcs:ignore
	if ( $q ) {
		ek14( $schema === Seo::business( $q[0]->ID )['@type'], "{$type} → {$schema}" );
	}
}
$paused = wp_insert_post( array( 'post_type' => 'ek_business', 'post_status' => 'pending', 'post_title' => 'SAMPLE pending schema test' ) );
ek14( null === Seo::business( $paused ), 'No markup for businesses that are not live' );
wp_delete_post( $paused, true );

$attr = get_posts( array( 'post_type' => Attractions::CPT, 'posts_per_page' => 1, 'lang' => '' ) );
$a    = Seo::attraction( $attr[0]->ID );
ek14( 'TouristAttraction' === $a['@type'] && ! empty( $a['description'] ) && ! empty( $a['address']['addressRegion'] ), 'Attraction: TouristAttraction with description and address' );
$dated = null;
$tbc   = null;
foreach ( get_posts( array( 'post_type' => Events::CPT, 'posts_per_page' => -1, 'lang' => '' ) ) as $e ) {
	$d = Events::data( $e->ID );
	if ( $d['tbc'] || ! $d['start'] ) {
		$tbc = $tbc ? $tbc : $e->ID;
	} elseif ( EK\Tickets::types( $e->ID ) ) {
		$dated = $dated ? $dated : $e->ID;
	}
}
$ev = Seo::event( $dated );
ek14( 'Event' === $ev['@type'] && preg_match( '/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\+01:00$/', $ev['startDate'] ) && ! empty( $ev['offers'] ) && ! empty( $ev['location']['name'] ), 'Event: date in Nigerian time, place, ticket offers' );
ek14( ! $tbc || null === Seo::event( $tbc ), 'Event with an unconfirmed date: no markup (search engines need a real date)' );
$tour = get_posts( array( 'post_type' => Tours::CPT, 'posts_per_page' => 1, 'meta_key' => '_ek_sample_set', 'lang' => '' ) );
$tour = $tour ? $tour : get_posts( array( 'post_type' => Tours::CPT, 'posts_per_page' => 1, 'lang' => '' ) );
$t    = Seo::tour( $tour[0]->ID );
ek14( 'TouristTrip' === $t['@type'] && ! empty( $t['offers'] ), 'Tour: TouristTrip with departure offers' );
ek14( false !== wp_json_encode( array( $s, $r, $v, $a, $ev, $t ) ), 'All markup is valid JSON' );
ek14( 'Ab cd…' === Seo::text( '<p>Ab cd efgh</p>', 9 ) && 'A & B' === Seo::text( 'A &amp; B' ), 'Descriptions are plain text, shortened at a word' );

WP_CLI::line( 'Search descriptions and share pictures' );
$missing = array();
foreach ( array_keys( Seo::page_descriptions() ) as $k ) {
	if ( ! Install::page_id( $k ) ) {
		$missing[] = $k;
	}
	$len = mb_strlen( Seo::page_descriptions()[ $k ] );
	if ( $len < 70 || $len > 160 ) {
		$missing[] = "{$k}({$len} chars)";
	}
}
ek14( ! $missing, count( Seo::page_descriptions() ) . ' main pages have a 70–160 character description' . ( $missing ? ': ' . implode( ', ', $missing ) : '' ) );
$titles = (array) get_option( 'rank-math-options-titles', array() );
ek14( ! empty( $titles['open_graph_image'] ) && Seo::default_image_id() === (int) $titles['open_graph_image_id'], 'Default share picture: the credited photo of the Emir\'s Palace' );
$meta = wp_get_attachment_metadata( Seo::default_image_id() );
ek14( $meta && $meta['width'] / max( 1, $meta['height'] ) > 1.5, 'Share picture is wide, as link previews need' );
Seo::remember_image( 'http://x.test/a/photo-1024x768.webp' );
ek14( 'image/webp' === Seo::og_image_type( 'image/jpeg' ), 'Share picture type corrected to WebP' );
foreach ( array( Install::page_id( 'book' ), Install::page_id( 'account' ), Install::page_id( 'dashboard' ) ) as $pid ) {
	ek14( in_array( $pid, Integrations::sitemap_exclude( array() ), true ), 'Private page left out of the sitemap: ' . get_the_title( $pid ) );
}

WP_CLI::line( 'Speed' );
$stale = array();
$count = 0;
foreach ( array( EK_DIR . 'assets/css', EK_DIR . 'assets/js', EK_DIR . 'assets/fonts', EK_DIR . 'assets/vendor/leaflet', get_stylesheet_directory() . '/assets/css', get_stylesheet_directory() . '/assets/js' ) as $dir ) {
	foreach ( array_merge( (array) glob( $dir . '/*.css' ), (array) glob( $dir . '/*.js' ) ) as $f ) {
		if ( preg_match( '/\.min\.(css|js)$|leaflet\.js$/', $f ) ) {
			continue;
		}
		$count++;
		if ( ! Assets::min_is_current( $f ) ) {
			$stale[] = basename( $f );
		}
	}
}
ek14( $count >= 12 && ! $stale, "All {$count} of our CSS/JS files have an up-to-date .min copy" . ( $stale ? ' (run npm run build): ' . implode( ', ', $stale ) : '' ) );
ek14( str_contains( Assets::minified( EK_URL . 'assets/css/ek.css?ver=1' ), 'ek.min.css?ver=1' ), 'Visitors are sent the .min copy' );
Assets::register();
ek14( str_contains( Assets::map_config()['leaflet']['js'], 'leaflet.js' ) && ! wp_scripts()->query( 'ek-mini-map' )->deps && ! wp_scripts()->query( 'ek-search' )->deps, 'Map library loads only when a map is scrolled near (not with the page)' );
ek14( ! has_action( 'wp_head', 'print_emoji_detection_script' ) && ! has_action( 'wp_print_styles', 'print_emoji_styles' ), 'Unused WordPress emoji script removed (embed links: checked in the browser test)' );
ek14( 'no' === get_option( 'woocommerce_feature_order_attribution_enabled' ), 'WooCommerce visitor-tracking cookies off' );
ek14( has_action( 'wp_enqueue_scripts', array( Integrations::class, 'trim_woocommerce' ) ) > 0, 'WooCommerce scripts only on shop pages' );
ek14( has_filter( 'wp_editor_set_quality' ) && 'image/webp' === ( apply_filters( 'image_editor_output_format', array() )['image/jpeg'] ?? '' ), 'Photos saved as WebP (Phase 12)' );

WP_CLI::line( 'Security' );
ek14( ! has_action( 'wp_head', 'wp_generator' ) && '' === apply_filters( 'the_generator', '<meta name="generator">', 'html' ), 'WordPress version not shown' );
ek14( ! str_contains( Security::strip_version( 'http://x/wp-includes/js/a.js?ver=' . get_bloginfo( 'version' ) ), get_bloginfo( 'version' ) ), 'Version removed from WordPress\'s own file addresses' );
ek14( false === apply_filters( 'xmlrpc_enabled', true ) && array() === apply_filters( 'xmlrpc_methods', array( 'a' => 1 ) ) && false === apply_filters( 'pings_open', true, 1 ), 'XML-RPC and pingbacks off' );
ek14( defined( 'DISALLOW_FILE_EDIT' ) && DISALLOW_FILE_EDIT, 'Theme/plugin file editor switched off' );
$h = Security::header_list();
ek14( 'nosniff' === $h['X-Content-Type-Options'] && 'SAMEORIGIN' === $h['X-Frame-Options'] && str_contains( $h['Permissions-Policy'], 'geolocation=(self)' ), 'Security headers (location kept for "Near me")' );
$err = Security::generic_login_error( new WP_Error( 'invalid_username', 'Unknown username x' ) );
$err2 = Security::generic_login_error( new WP_Error( 'incorrect_password', 'The password for x is incorrect' ) );
ek14( $err->get_error_message() === $err2->get_error_message() && ! str_contains( $err->get_error_message(), 'Unknown' ), 'Failed logins: one message, whether or not the account exists' );
wp_set_current_user( 0 );
$routes = Security::hide_user_endpoints( array( '/wp/v2/users' => 1, '/wp/v2/users/(?P<id>[\d]+)' => 1, '/wp/v2/users/me' => 1, '/wp/v2/posts' => 1 ) );
ek14( ! isset( $routes['/wp/v2/users'] ) && ! isset( $routes['/wp/v2/users/(?P<id>[\d]+)'] ) && isset( $routes['/wp/v2/posts'] ), 'User list hidden from the public API' );
$admin = get_users( array( 'role' => 'administrator', 'number' => 1 ) )[0];
$owner = get_users( array( 'role' => Install::ROLE_OWNER, 'number' => 1 ) )[0];
ek14( apply_filters( 'wp_is_application_passwords_available_for_user', true, $admin ) && ! apply_filters( 'wp_is_application_passwords_available_for_user', true, $owner ), 'Application passwords never for business owners or guests (Wordfence may switch them off for everyone)' );
ek14( '' !== Security::password_problem( 'short' ) && '' !== Security::password_problem( 'password123' ) && '' !== Security::password_problem( '11111111' ) && '' !== Security::password_problem( 'Katsina2026' ), 'Weak passwords refused (too short, well known, repeated, site name)' );
ek14( '' !== Security::password_problem( 'aminabello9', array( 'email' => 'aminabello@example.com', 'name' => 'Amina' ) ), 'Password made from your own email refused' );
ek14( '' === Security::password_problem( 'tuwo with miyan kuka' ) && '' !== Security::password_problem( 'Abcdefgh-12', null, true ), 'A short sentence is fine; staff need 12+ characters' );
$ht = (string) @file_get_contents( ABSPATH . '.htaccess' ); // phpcs:ignore
ek14( str_contains( $ht, '# BEGIN Explore Katsina' ) && str_contains( $ht, 'xmlrpc' ) && str_contains( $ht, 'ExpiresByType text/css' ) && strpos( $ht, 'Explore Katsina' ) < strpos( $ht, '# BEGIN WordPress' ), 'Server rules: blocks, browser caching, compression (before WordPress\'s rules)' );
$up = wp_upload_dir( null, false );
ek14( str_contains( (string) @file_get_contents( $up['basedir'] . '/.htaccess' ), 'Require all denied' ), 'No PHP can run from the uploads folder' ); // phpcs:ignore
ek14( 'closed' === get_option( 'default_ping_status' ), 'Pingbacks closed for new content' );

if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All SEO, speed and security checks passed.' );
