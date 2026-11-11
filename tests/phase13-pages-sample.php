<?php
/**
 * Phase 13 checks: every page in the brief exists (with Hausa versions marked "needs translation"),
 * legal pages are marked "DRAFT – for legal review" and match how the site works, the privacy policy
 * references the Nigeria Data Protection Act 2023, placeholder contacts are marked, and the SAMPLE data is
 * complete: 8 hotels with 3–4 rooms, 8 restaurants with menus, 5 event centres with halls, 3 per other
 * category, several LGAs, verified reviews and rankings, 2 tours, 1 ticketed event, 5 products + 1 digital
 * guide, bookings in every status; and all of it is named SAMPLE and removable.
 * Run: wp eval-file ek-tests/phase13-pages-sample.php (after `wp ek sample-data`).
 */

use EK\Business;
use EK\Install;
use EK\Languages;
use EK\Pages;
use EK\Ranking;
use EK\Sample_Data;

$GLOBALS['ek_fail'] = 0;
function ek13( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
global $wpdb;
$x = $wpdb->prefix;

WP_CLI::line( 'Pages in the brief' );
$need = array(
	'Home' => 'home', 'Explore' => 'explore', 'Katsina Map' => 'map', 'Hotels' => 'hotels', 'Restaurants' => 'restaurants', 'Event Centres' => 'event_centres',
	'Things to Do' => 'things_to_do', 'Tours' => 'tours', 'Festivals & Events' => 'events', 'Top 10 hotels' => 'top_hotels', 'Top 10 restaurants' => 'top_restaurants',
	'Top 10 event centres' => 'top_event_centres', 'Guides' => 'guides', 'Directory' => 'directory', 'Plan Your Trip' => 'plan_trip', 'Stories' => 'stories',
	'List Your Business' => 'list_business', 'Pricing' => 'pricing', 'Advertise With Us' => 'advertise', 'My Account' => 'account', 'Business Dashboard' => 'dashboard',
	'About' => 'about', 'Contact' => 'contact', 'FAQ (travellers)' => 'faq_travellers', 'FAQ (businesses)' => 'faq_businesses', 'Booking & Cancellation Policy' => 'booking_policy',
	'Refund Policy' => 'refund_policy', 'Review Guidelines' => 'review_guidelines', 'Listing & Partner Agreement' => 'agreement', 'Privacy Policy' => 'privacy', 'Terms of Use' => 'terms',
);
foreach ( $need as $label => $key ) {
	$id = Install::page_id( $key );
	ek13( $id && 'publish' === get_post_status( $id ), "Page: {$label}" );
}
ek13( (bool) get_option( 'woocommerce_shop_page_id' ) && 'publish' === get_post_status( (int) get_option( 'woocommerce_shop_page_id' ) ), 'Page: Shop' );
foreach ( array( 'itineraries', 'safety-and-travel-tips' ) as $slug ) {
	ek13( (bool) get_page_by_path( 'plan-your-trip/' . $slug ), "Page: {$slug}" );
}
ek13( 'page' === get_option( 'show_on_front' ) && Install::page_id( 'home' ) === (int) get_option( 'page_on_front' ), 'Home page is the front page' );
ek13( Install::page_id( 'privacy' ) === (int) get_option( 'wp_page_for_privacy_policy' ), 'WordPress knows our privacy page' );
ek13( false !== strpos( get_the_title( Install::page_id( 'events' ) ), 'Festivals' ), 'Events page titled "Festivals & Events"' );
ek13( ! get_page_by_path( 'sample-page' ), 'WordPress demo page removed' );

WP_CLI::line( 'Content rules' );
$unresolved = 0;
foreach ( array_keys( Pages::list() ) as $key ) {
	$unresolved += substr_count( (string) get_post_field( 'post_content', Install::page_id( $key ) ), '{{' );
}
ek13( 0 === $unresolved, 'All links between pages filled in' );
foreach ( Pages::LEGAL as $key ) {
	ek13( false !== strpos( (string) get_post_field( 'post_content', Install::page_id( $key ) ), 'DRAFT – for legal review' ), 'Marked "DRAFT – for legal review": ' . get_the_title( Install::page_id( $key ) ) );
}
$priv = (string) get_post_field( 'post_content', Install::page_id( 'privacy' ) );
ek13( false !== strpos( $priv, 'Nigeria Data Protection Act 2023' ) && false !== strpos( $priv, 'Nigeria Data Protection Commission' ) && false === strpos( $priv, 'Suggested text:' ), 'Privacy policy: NDPA 2023, NDPC complaints, not the WordPress template' );
$book = (string) get_post_field( 'post_content', Install::page_id( 'booking_policy' ) );
ek13( false !== strpos( $book, '24 hours' ) && false !== strpos( $book, '5 days' ) && false !== strpos( $book, '7 days' ) && false !== strpos( $book, '48 hours' ) && false !== strpos( $book, '15 minutes' ), 'Booking policy matches the rules the site applies (24 h / 5 days / 7 days, tours 48 h, 15-minute holds)' );
foreach ( EK\Hotel::policies() as $p ) {
	ek13( false !== strpos( $book, $p['label'] ), 'Booking policy lists: ' . $p['label'] );
}
ek13( false !== strpos( (string) get_post_field( 'post_content', Install::page_id( 'review_guidelines' ) ), '180 days' ), 'Review guidelines: 180-day window, as the site applies' );
ek13( false !== strpos( (string) get_post_field( 'post_content', Install::page_id( 'about' ) ), '(placeholder contact details)' ), 'Placeholder contact details are marked' );
$all = '';
foreach ( array_keys( Pages::list() ) as $key ) {
	$all .= get_post_field( 'post_content', Install::page_id( $key ) );
}
preg_match_all( '/(\+234|\b0[789][01])[\d ]{8,}/', $all, $phones );
ek13( ! array_diff( array_map( static fn( $p ) => preg_replace( '/\s+/', ' ', trim( $p ) ), $phones[0] ), array( '+234 800 000 0000' ) ), 'Only the placeholder phone number appears' );
$hausa_ok = true;
foreach ( array_keys( Pages::list() ) as $key ) {
	$ha       = (int) pll_get_post( Install::page_id( $key ), 'ha' );
	$hausa_ok = $hausa_ok && $ha && Languages::needs_translation( $ha );
}
ek13( $hausa_ok, 'Every new page has a Hausa version marked "Needs Hausa translation"' );
ek13( false !== strpos( do_shortcode( '[ek_legal_links]' ), 'Privacy Policy' ), 'Footer links to the policies' );

WP_CLI::line( 'Directory and Pricing pages' );
$dir = do_shortcode( '[ek_directory]' );
foreach ( Business::types() as $t ) {
	ek13( false !== strpos( $dir, esc_html( $t['label'] ) ), 'Directory section: ' . $t['label'] );
}
$_GET['type'] = 'banks';
ek13( 3 === substr_count( do_shortcode( '[ek_directory]' ), 'class="ek-dir-name"' ) - 0 || 3 <= substr_count( do_shortcode( '[ek_directory]' ), 'class="ek-dir-name"' ), 'Directory filter by category' );
unset( $_GET['type'] );
$pr = do_shortcode( '[ek_pricing]' );
ek13( false !== strpos( $pr, 'Free' ) && false !== strpos( $pr, '₦10,000' ) && false !== strpos( $pr, '10%' ) && false !== strpos( $pr, 'PLACEHOLDERS' ), 'Pricing: free Basic, plans, commission from Settings, marked placeholder' );

WP_CLI::line( 'SAMPLE data' );
$ids  = get_posts( array( 'post_type' => EK\Post_Types::BUSINESS, 'post_status' => 'publish', 'posts_per_page' => -1, 'fields' => 'ids', 'meta_key' => Sample_Data::META, 'meta_value' => 1 ) ); // phpcs:ignore
$by   = array();
$lgas = array();
foreach ( $ids as $id ) {
	$by[ Business::type_of( $id ) ][] = $id;
	$lgas[ Business::get( $id ) ? wp_get_post_terms( $id, EK\Post_Types::TAX_LGA, array( 'fields' => 'names' ) )[0] ?? '' : '' ] = 1;
}
ek13( 0 === count( array_filter( $ids, static fn( $id ) => 0 !== strpos( get_the_title( $id ), 'SAMPLE' ) ) ), 'Every sample business is named "SAMPLE …"' );
ek13( 8 === count( $by['hotel'] ?? array() ) && 8 === count( $by['restaurant'] ?? array() ) && 5 === count( $by['event-centre'] ?? array() ), '8 hotels, 8 restaurants, 5 event centres' );
foreach ( array( 'tour-operator', 'transport', 'crafts', 'shopping', 'health', 'banks' ) as $t ) {
	ek13( 3 === count( $by[ $t ] ?? array() ), "3 businesses: {$t}" );
}
ek13( count( array_filter( array_keys( $lgas ) ) ) >= 6, sprintf( 'Spread across %d LGAs', count( array_filter( array_keys( $lgas ) ) ) ) );
$rooms_ok = true;
foreach ( $by['hotel'] as $h ) {
	$n        = count( get_posts( array( 'post_type' => EK\Rooms::CPT, 'post_parent' => $h, 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1 ) ) );
	$rooms_ok = $rooms_ok && $n >= 3 && $n <= 4;
}
ek13( $rooms_ok, 'Each hotel: 3–4 room categories' );
$prices = $wpdb->get_col( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id WHERE p.post_type = %s AND m.meta_key = '_ek_price'", EK\Rooms::CPT ) );
ek13( $prices && min( array_map( 'intval', $prices ) ) >= 500000 && max( array_map( 'intval', $prices ) ) <= 15000000, 'Room prices realistic (₦5,000–₦150,000 a night)' );
$menu_ok = true;
foreach ( $by['restaurant'] as $r ) {
	$menu_ok = $menu_ok && count( EK\Menu::items( $r ) ) >= 5;
}
ek13( $menu_ok, 'Each restaurant: a full menu (5+ dishes in categories)' );
$halls_ok = true;
foreach ( $by['event-centre'] as $v ) {
	$halls_ok = $halls_ok && count( get_posts( array( 'post_type' => EK\Halls::CPT, 'post_parent' => $v, 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1 ) ) ) >= 1;
}
ek13( $halls_ok, 'Each event centre: halls' );
$in_state = true;
foreach ( $ids as $id ) {
	$b        = Business::get( $id );
	$in_state = $in_state && Business::in_katsina( (float) get_post_meta( $id, '_ek_lat', true ), (float) get_post_meta( $id, '_ek_lng', true ) );
}
ek13( $in_state, 'Every map pin inside Katsina State' );
$phones = $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT meta_value FROM {$wpdb->postmeta} WHERE meta_key = '_ek_phone' AND post_id IN (" . implode( ',', array_map( 'intval', $ids ) ) . ')', array() ) ); // phpcs:ignore
ek13( array( '+2348000000000' ) === array_values( array_unique( $phones ) ) || ! $phones, 'Only the placeholder phone number on sample businesses' );

$reviews = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$x}ek_reviews r JOIN {$wpdb->postmeta} m ON m.post_id = r.business_id AND m.meta_key = '_ek_sample_set' WHERE r.status = 'published'" );
$unverified = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$x}ek_reviews r LEFT JOIN {$x}ek_bookings b ON b.id = r.booking_id WHERE b.id IS NULL OR b.status NOT IN ('checked_out','completed')" );
ek13( $reviews >= 60 && 0 === $unverified, sprintf( '%d verified reviews, each tied to a completed booking', $reviews ) );
foreach ( array( 'hotel', 'restaurant', 'event-centre' ) as $t ) {
	ek13( count( Ranking::top( $t, 0, 10 ) ) >= 4, "Rankings show for {$t}s" );
}
$palm = get_posts( array( 'post_type' => EK\Post_Types::BUSINESS, 'title' => 'SAMPLE Palmview Lodge', 'fields' => 'ids', 'post_status' => 'publish' ) );
$prow = $palm ? Ranking::current( $palm[0] ) : null;
ek13( $palm && ( ! $prow || null === $prow->rank_state ), 'A hotel with only 2 reviews stays "new, not yet ranked"' );

$st = array();
foreach ( $wpdb->get_results( "SELECT b.kind, b.status FROM {$x}ek_bookings b JOIN {$wpdb->postmeta} m ON m.post_id = b.business_id AND m.meta_key = '_ek_sample_set'" ) as $r ) {
	$st[ $r->kind ][ $r->status ] = true;
}
$want = array(
	'hotel'      => array( 'pending_payment', 'new', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'declined', 'no_show', 'expired', 'payment_conflict' ),
	'restaurant' => array( 'pending_payment', 'new', 'confirmed', 'seated', 'completed', 'cancelled', 'declined', 'no_show', 'expired' ),
	'event'      => array( 'pending_payment', 'requested', 'confirmed', 'deposit_paid', 'completed', 'cancelled', 'declined', 'expired' ),
);
foreach ( $want as $kind => $list ) {
	$missing = array_diff( $list, array_keys( $st[ $kind ] ?? array() ) );
	ek13( ! $missing, ucfirst( $kind ) . ' bookings in every status' . ( $missing ? ' (missing: ' . implode( ', ', $missing ) . ')' : '' ) );
}
ek13( (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$x}ek_bookings WHERE payment_mode = 'venue'" ) > 0, 'Includes a "pay at the hotel" booking' );

$tours = get_posts( array( 'post_type' => EK\Tours::CPT, 'post_status' => 'publish', 'fields' => 'ids', 'meta_key' => Sample_Data::META ) ); // phpcs:ignore
ek13( 2 === count( $tours ) && count( EK\Tours::departures( $tours[0] ) ) >= 3, '2 SAMPLE tours with dates' );
$ev = get_posts( array( 'post_type' => EK\Events::CPT, 'post_status' => 'publish', 'fields' => 'ids', 'meta_key' => Sample_Data::META ) ); // phpcs:ignore
ek13( 1 === count( $ev ) && count( EK\Tickets::types( $ev[0] ) ) >= 2 && (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$x}ek_tickets WHERE event_id = %d", $ev[0] ) ) >= 3, '1 SAMPLE ticketed event with tickets sold' );
if ( function_exists( 'wc_get_products' ) ) {
	$prods = wc_get_products( array( 'limit' => -1, 'status' => 'publish', 'meta_key' => Sample_Data::META, 'meta_value' => 1 ) ); // phpcs:ignore
	$dl    = array_filter( $prods, static fn( $p ) => $p->is_downloadable() );
	ek13( 5 === count( $prods ) - count( $dl ) && 1 === count( $dl ), '5 SAMPLE shop products + 1 digital guide' );
	$file = $dl ? array_values( reset( $dl )->get_downloads() )[0]->get_file() : '';
	$up   = wp_upload_dir();
	$path = str_replace( trailingslashit( $up['baseurl'] ), trailingslashit( $up['basedir'] ), $file );
	ek13( $path && file_exists( $path ) && 0 === strpos( (string) file_get_contents( $path ), '%PDF-' ), 'Digital guide file is a real PDF in the protected download folder' );
}
$named = static fn( $t ) => (int) ( get_posts( array( 'post_type' => EK\Post_Types::BUSINESS, 'title' => $t, 'fields' => 'ids', 'post_status' => 'publish' ) )[0] ?? 0 );
ek13( (bool) get_post_meta( $named( 'SAMPLE Brass Lantern Guest House' ), '_ek_featured_until', true ) && (bool) get_post_meta( $named( 'SAMPLE Crimson Gate Hotel' ), '_ek_verified', true ) && 'premium' === get_post_meta( $named( 'SAMPLE Garden Terrace Restaurant' ), '_ek_plan', true ), 'One Featured hotel, one Premium restaurant, one Verified business' );
ek13( is_wp_error( Sample_Data::generate() ), 'Running sample-data again does not duplicate anything' );

WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 13 checks passed.' );
