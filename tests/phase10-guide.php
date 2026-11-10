<?php
/**
 * Phase 10 checks: the tourism guide. Attraction categories and fields, the researched content
 * (sources on every page, nothing invented: no hours, fees or phone numbers, "not verified" ticked),
 * nearest hotels/restaurants/event centres with distances, festivals with "date TBC", "Plan your
 * trip" pages, the safety page (official advisories, no claims about safe areas), draft stories,
 * galleries with photo credits, and the importer being safe to re-run.
 * Run: wp eval-file ek-tests/phase10-guide.php (after `wp ek import-guide`).
 */

use EK\Attractions;
use EK\Business;
use EK\Events;
use EK\Gallery;
use EK\Guide_Import;
use EK\Install;
use EK\Map_Index;
use EK\Stories;
use EK\View;

$GLOBALS['ek_fail'] = 0;
function ek10( $cond, $msg ) {
	WP_CLI::line( ( $cond ? '  ✔ ' : '  ✘ ' ) . $msg );
	if ( ! $cond ) {
		$GLOBALS['ek_fail']++;
	}
}
add_filter( 'pre_wp_mail', '__return_true' );
global $wpdb;
$stamp = 't' . wp_rand( 10000, 99999 );
$kat   = get_term_by( 'name', 'Katsina', 'ek_lga' );
$dau   = get_term_by( 'name', 'Daura', 'ek_lga' );

// Make sure the guide is there (re-run safe), then count what a second run would add.
( new Guide_Import( ABSPATH . 'ek-sample-data/media' ) )->run();
$again = ( new Guide_Import( ABSPATH . 'ek-sample-data/media' ) )->run();

WP_CLI::line( 'Categories and types' );
$names = array_map( 'wp_specialchars_decode', wp_list_pluck( get_terms( array( 'taxonomy' => Attractions::TAX, 'hide_empty' => false ) ), 'name' ) );
foreach ( array( 'Historic site', 'Religious site', 'Nature & dams', 'Markets', 'Museums', 'Palaces', 'Crafts' ) as $n ) {
	ek10( in_array( $n, $names, true ), "Attraction category: {$n}" );
}
ek10( ! term_exists( 'heritage', Attractions::TAX ) && ! term_exists( 'festival', Attractions::TAX ), 'Old Phase 8 categories renamed or removed' );
ek10( (bool) term_exists( 'festival', Events::TAX ), 'Event type "Festival" exists' );
foreach ( Stories::categories() as $slug => $n ) {
	ek10( (bool) term_exists( $slug, 'category' ), "Story category: {$n}" );
}

WP_CLI::line( 'Researched attractions' );
$want = array( 'gobarau-minaret', 'emir-of-katsina-palace', 'katsina-city-walls-and-gates', 'kusugu-well-daura', 'emir-of-daura-palace', 'zobe-dam', 'ajiwa-dam', 'katsina-central-market', 'durbi-takusheyi', 'national-museum-katsina' );
$ids  = array();
foreach ( $want as $slug ) {
	$ids[ $slug ] = Guide_Import::find( Attractions::CPT, 'attraction:' . $slug );
}
ek10( 10 === count( array_filter( $ids ) ), 'All 8 requested attractions + 2 suggested ones imported' );
$all_ok = array( 'sources' => true, 'unverified' => true, 'nohours' => true, 'nophone' => true, 'links' => true, 'lga' => true, 'pin' => 0, 'history' => true );
foreach ( $ids as $slug => $id ) {
	$a   = Attractions::data( $id );
	$src = Attractions::parse_sources( $a['sources'] );
	$all_ok['sources']    = $all_ok['sources'] && $src && count( array_filter( wp_list_pluck( $src, 1 ) ) ) === count( $src );
	$all_ok['unverified'] = $all_ok['unverified'] && $a['unverified'];
	$all_ok['nohours']    = $all_ok['nohours'] && '' === $a['hours'] && '' === $a['entry_fee'];
	$text                 = get_post_field( 'post_content', $id ) . $a['history'] . $a['directions'] . $a['best_time'];
	$all_ok['nophone']    = $all_ok['nophone'] && ! preg_match( '/(\+234|\b0[789][01]\d{8}\b)/', $text );
	$all_ok['links']      = $all_ok['links'] && false === strpos( $text, '{{' );
	$all_ok['lga']        = $all_ok['lga'] && '' !== $a['lga'] && '' !== $a['category'];
	$all_ok['history']    = $all_ok['history'] && '' !== trim( $a['history'] );
	$all_ok['pin']       += is_numeric( $a['lat'] ) && Business::in_katsina( (float) $a['lat'], (float) $a['lng'] ) ? 1 : 0;
}
ek10( $all_ok['sources'], 'Every attraction lists its sources, each with a link' );
ek10( $all_ok['unverified'], 'Every imported attraction is marked "not yet verified on the ground"' );
ek10( $all_ok['nohours'], 'No opening hours or fees were invented (left empty until confirmed)' );
ek10( $all_ok['nophone'], 'No phone numbers in the guide text' );
ek10( $all_ok['links'], 'All internal links resolved' );
ek10( $all_ok['lga'] && $all_ok['history'], 'Every attraction has an LGA, a category and a history section' );
ek10( 9 === $all_ok['pin'], sprintf( '9 attractions have a map pin inside Katsina State (the museum waits for a confirmed location): %d', $all_ok['pin'] ) );
ek10( 9 === (int) $wpdb->get_var( 'SELECT COUNT(*) FROM ' . $wpdb->prefix . "ek_map_index WHERE type = 'attraction' AND object_id IN (" . implode( ',', array_map( 'intval', $ids ) ) . ')' ), 'The 9 pinned attractions are on the Katsina Map' );
ek10( 0 === $again['created'] && 0 === $again['updated'], 'Running the importer again adds nothing twice' );
$gk = Attractions::data( $ids['gobarau-minaret'] );
ek10( false !== strpos( $gk['history'], 'Korau' ) && false !== strpos( $gk['history'], '14th to the 16th century' ), 'Gobarau: history with the dating conflict stated, not hidden' );
ek10( false !== strpos( get_post_field( 'post_content', $ids['kusugu-well-daura'] ), 'According to the legend' ), 'Kusugu: the Bayajidda story is presented as legend' );
ek10( false !== strpos( Attractions::data( $ids['ajiwa-dam'] )['pin_note'], 'Sources differ' ), 'Ajiwa: uncertain LGA flagged on the page' );

WP_CLI::line( 'Attraction page: nearest places with distances' );
$owner = wp_insert_user( array( 'user_login' => "ek10_{$stamp}", 'user_email' => "ek10_{$stamp}@example.test", 'user_pass' => 'x' . $stamp, 'role' => Install::ROLE_OWNER ) );
$made  = array();
$mk    = static function ( $name, $type, $lga, $lat, $lng ) use ( $owner, &$made ) {
	$id = Business::create( array( 'name' => $name, 'type' => $type, 'lga_id' => $lga->term_id, 'address' => 'Test', 'lat' => $lat, 'lng' => $lng, 'phone' => '+2348030000000', 'whatsapp' => '', 'email' => 't@example.test', 'website' => '', 'socials' => array(), 'hours' => array( 'always' => 1 ), 'description' => str_repeat( 'Test business. ', 5 ) ), $owner );
	wp_update_post( array( 'ID' => $id, 'post_status' => 'publish' ) );
	$made[] = $id;
	return $id;
};
$glat  = (float) $gk['lat'];
$glng  = (float) $gk['lng'];
$h1    = $mk( "SAMPLE Guide Hotel Near {$stamp}", 'hotel', $kat, $glat + 0.0009, $glng ); // ~100 m.
$h2    = $mk( "SAMPLE Guide Hotel Far {$stamp}", 'hotel', $kat, $glat + 0.0005, $glng + 0.0005 ); // ~78 m: the closer one.
$r1    = $mk( "SAMPLE Guide Kitchen {$stamp}", 'restaurant', $kat, $glat - 0.0015, $glng ); // ~170 m.
$kd    = Attractions::data( $ids['kusugu-well-daura'] );
$hd    = $mk( "SAMPLE Daura Lodge {$stamp}", 'hotel', $dau, (float) $kd['lat'] + 0.004, (float) $kd['lng'] ); // ~440 m.
Map_Index::flush();
$near = Map_Index::nearest( $glat, $glng, 'hotel', 3 );
ek10( $near && $h2 === $near[0]['id'] && $h1 === $near[1]['id'], 'Nearest hotels: closest first' );
ek10( $near && abs( $near[1]['distance'] - Map_Index::distance_m( $glat, $glng, $glat + 0.0009, $glng ) ) < 1, sprintf( 'Distance worked out: %d m', $near[1]['distance'] ?? -1 ) );
ek10( ! in_array( $ids['gobarau-minaret'], wp_list_pluck( Map_Index::nearest( $glat, $glng, 'attraction', 4, 40, $ids['gobarau-minaret'] ), 'id' ), true ), 'Other attractions nearby: not itself' );
$html = View::render( 'public/attraction', array( 'id' => $ids['gobarau-minaret'], 'a' => $gk ) );
ek10( false !== strpos( $html, "SAMPLE Guide Hotel Far {$stamp}" ) && false !== strpos( $html, "SAMPLE Guide Kitchen {$stamp}" ) && false !== strpos( $html, ' m away' ), 'Gobarau page: nearest hotel and restaurant with distances' );
ek10( false !== strpos( $html, 'No event centres listed nearby yet' ) || false !== strpos( $html, 'data-ek-nearest-type="event-centre"' ), 'Gobarau page: event centres section' );
ek10( 2 === substr_count( $html, 'Not yet confirmed. Please check locally' ), 'Gobarau page: hours and fee shown as "Not yet confirmed"' );
ek10( false !== strpos( $html, 'id="ek-history-h"' ) && false !== strpos( $html, 'id="ek-sources-h"' ) && false !== strpos( $html, 'en.wikipedia.org/wiki/Gobarau_Minaret' ), 'Gobarau page: history and sources sections' );
ek10( false !== strpos( $html, 'not yet been checked on the ground' ), 'Gobarau page: "not verified" notice' );
$khtml = View::render( 'public/attraction', array( 'id' => $ids['kusugu-well-daura'], 'a' => $kd ) );
ek10( false !== strpos( $khtml, "SAMPLE Daura Lodge {$stamp}" ) && false !== strpos( $khtml, 'Emir of Daura' ), 'Kusugu page: nearest Daura hotel and the palace nearby' );
$mhtml = View::render( 'public/attraction', array( 'id' => $ids['national-museum-katsina'], 'a' => Attractions::data( $ids['national-museum-katsina'] ) ) );
ek10( false === strpos( $mhtml, 'data-ek-mini-map' ) && false !== strpos( $mhtml, 'Visitor information' ), 'Museum without a confirmed pin: no map, details still shown' );

WP_CLI::line( 'Saving an attraction in wp-admin' );
wp_set_current_user( 1 );
$aid   = wp_insert_post( array( 'post_type' => Attractions::CPT, 'post_status' => 'publish', 'post_title' => "SAMPLE Guide Attraction {$stamp}" ) );
$_POST = array(
	'ek_attraction_nonce' => wp_create_nonce( 'ek_attraction_save' ),
	'ek_lat'              => '12.99',
	'ek_lng'              => '7.60',
	'ek_entry_fee'        => 'Free',
	'ek_hours_text'       => '',
	'ek_directions'       => 'Ask locally.',
	'ek_best_time'        => 'Mornings',
	'ek_history'          => '<p>Built long ago.</p><script>alert(1)</script>',
	'ek_sources'          => "Example | https://example.org/a\nhttps://example.org/b\nBook without link",
	'ek_pin_note'         => 'Approximate',
	'ek_unverified'       => '1',
	'ek_gallery'          => '',
);
Attractions::save( $aid, get_post( $aid ) );
$sd = Attractions::data( $aid );
ek10( 'Mornings' === $sd['best_time'] && 'Approximate' === $sd['pin_note'] && false !== strpos( $sd['history'], 'Built long ago' ) && false === strpos( $sd['history'], '<script' ), 'Best time, pin note and history saved (scripts stripped)' );
$ps = Attractions::parse_sources( $sd['sources'] );
ek10( 3 === count( $ps ) && 'Example' === $ps[0][0] && 'https://example.org/a' === $ps[0][1] && 'example.org' === $ps[1][0] && '' === $ps[2][1], 'Sources: "Title | link", bare links and plain references' );
$_POST = array();

WP_CLI::line( 'Gallery and photo credits' );
$up  = wp_upload_dir();
$img = $up['path'] . "/ek10-{$stamp}.png";
file_put_contents( $img, base64_decode( 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' ) ); // phpcs:ignore
$att = wp_insert_attachment( array( 'post_mime_type' => 'image/png', 'post_title' => 'SAMPLE', 'post_status' => 'inherit' ), $img, $aid );
update_post_meta( $att, '_ek_credit', array( 'author' => 'Test Author', 'license' => 'CC BY-SA 4.0', 'license_url' => 'https://creativecommons.org/licenses/by-sa/4.0/', 'source' => 'https://commons.wikimedia.org/wiki/File:Test.jpg' ) );
Gallery::set( $aid, array( $att, 999999999 ) );
ek10( array( $att ) === Gallery::ids( $aid ) && (int) get_post_thumbnail_id( $aid ) === $att, 'Gallery keeps only real photos; the first becomes the main photo' );
$g = Gallery::render( Gallery::ids( $aid ), 'x' );
ek10( false !== strpos( $g, 'ek-gallery--1' ) && false !== strpos( $g, 'Test Author' ) && false !== strpos( $g, 'CC BY-SA 4.0' ), 'Gallery shows photo credits (author, licence)' );
$gob_photos = Gallery::ids( $ids['gobarau-minaret'] );
if ( $gob_photos ) {
	$c = get_post_meta( $gob_photos[0], '_ek_credit', true );
	ek10( ! empty( $c['license'] ) && ! empty( $c['source'] ), 'Imported Commons photos carry their licence and source' );
} else {
	WP_CLI::line( '  · Commons photos not downloaded yet: photo checks skipped' );
}

WP_CLI::line( 'Festivals and events' );
$dur = Guide_Import::find( Events::CPT, 'event:sallah-durbar-katsina' );
$dd  = $dur ? Events::data( $dur ) : array();
ek10( $dur && 'publish' === get_post_status( $dur ), 'Sallah Durbar festival published' );
ek10( $dd && $dd['tbc'] && 'Date to be confirmed' === Events::when( $dd ), 'Sallah Durbar: date TBC (follows the moon sighting)' );
ek10( $dd && false !== strpos( $dd['type'], 'Festival' ) && in_array( $dur, Events::upcoming(), true ), 'Shown as an upcoming Festival on the Events page' );
$dhtml = do_shortcode( '[ek_events]' );
ek10( false !== strpos( $dhtml, 'Sallah Durbar, Katsina' ) && false !== strpos( $dhtml, 'Festival' ), 'Events list shows the festival with its type' );
ek10( false === strpos( (string) get_post_field( 'post_content', $dur ), 'UNESCO' ), 'No UNESCO claim for Katsina (the 2024 listing is for Kano)' );

WP_CLI::line( 'Plan your trip' );
$trip = Install::page_id( 'plan_trip' );
$kids = get_pages( array( 'child_of' => $trip, 'post_status' => 'publish' ) );
$kid_slugs = wp_list_pluck( $kids, 'post_name' );
ek10( $trip && 'plan-your-trip' === get_post_field( 'post_name', $trip ), '"Plan your trip" page' );
foreach ( array( 'getting-there', 'getting-around', 'etiquette-and-dress', 'best-time-to-visit', 'itineraries', 'safety-and-travel-tips' ) as $s ) {
	ek10( in_array( $s, $kid_slugs, true ), "Sub-page: {$s}" );
}
$pages_text = implode( "\n", array_map( static fn( $p ) => $p->post_content, $kids ) ) . get_post_field( 'post_content', $trip );
ek10( false === strpos( $pages_text, '{{' ) && ! preg_match( '/(\+234|\b0[789][01]\d{8}\b)/', $pages_text ), 'Trip pages: links resolved, no phone numbers' );
$getting = get_page_by_path( 'plan-your-trip/getting-there' );
ek10( $getting && false !== strpos( $getting->post_content, 'Yar\'Adua Airport' ) && false !== strpos( $getting->post_content, 'by road' ), 'Getting there: by air (Katsina airport) and by road' );
$itin = get_page_by_path( 'plan-your-trip/itineraries' );
ek10( $itin && false !== strpos( $itin->post_content, 'One day' ) && false !== strpos( $itin->post_content, 'Three days' ), 'Itineraries: one day and three days' );
$safety = get_page_by_path( 'plan-your-trip/safety-and-travel-tips' );
$st     = $safety ? $safety->post_content : '';
ek10( false !== strpos( $st, 'gov.uk/foreign-travel-advice/nigeria' ) && false !== strpos( $st, 'travel.state.gov' ) && false !== strpos( $st, 'travel.gc.ca' ) && false !== strpos( $st, 'smartraveller.gov.au' ), 'Safety: links to four official travel advisories' );
ek10( false !== strpos( $st, 'does not say which areas are safe' ) && ! preg_match( '/\b(is|are) (perfectly |completely |very )?safe\b/i', str_replace( 'which areas are safe', '', $st ) ), 'Safety: makes no claims about which areas are safe' );
ek10( (bool) Install::page_id( 'things_to_do' ) && false !== strpos( do_shortcode( '[ek_attractions]' ), 'Gobarau Minaret' ), '"Things to do" page lists the attractions' );
$_GET['type'] = 'nature';
$nature       = do_shortcode( '[ek_attractions]' );
unset( $_GET['type'] );
ek10( false !== strpos( $nature, 'Zobe Dam' ) && false === strpos( $nature, 'Gobarau Minaret' ), '"Things to do" category filter: Nature & dams' );

WP_CLI::line( 'Stories' );
$drafts = get_posts( array( 'post_type' => 'post', 'post_status' => 'any', 'meta_key' => Guide_Import::KEY, 'posts_per_page' => 20 ) ); // phpcs:ignore
ek10( 3 <= count( $drafts ) && ! array_filter( $drafts, static fn( $p ) => 'publish' === $p->post_status && false !== strpos( $p->post_content, 'DRAFT FOR REVIEW' ) ), 'Draft stories imported, waiting for review (not public)' );
ek10( (bool) Install::page_id( 'stories' ) && false !== strpos( do_shortcode( '[ek_stories]' ), 'Travel guides' ), 'Stories page with topic filter' );
$labels = get_post_type_object( 'post' )->labels;
ek10( 'Stories' === $labels->name, 'wp-admin calls posts "Stories"' );

// Clean up.
foreach ( $made as $id ) {
	$wpdb->delete( $wpdb->prefix . 'ek_map_index', array( 'object_id' => $id ) );
	$wpdb->delete( $wpdb->prefix . 'ek_business_private', array( 'business_id' => $id ) );
	wp_delete_post( $id, true );
}
wp_delete_attachment( $att, true );
wp_delete_post( $aid, true );
wp_delete_user( $owner );
Map_Index::flush();
WP_CLI::line( '' );
if ( $GLOBALS['ek_fail'] ) {
	WP_CLI::error( $GLOBALS['ek_fail'] . ' check(s) failed.' );
}
WP_CLI::success( 'All Phase 10 checks passed.' );
