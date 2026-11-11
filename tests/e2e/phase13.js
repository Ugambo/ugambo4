/**
 * Phase 13 browser journey: every page in the brief opens at 360 / 768 / 1280 without errors or sideways
 * scrolling; the homepage and Top 10 show the SAMPLE rankings; a SAMPLE hotel page with verified reviews,
 * a SAMPLE restaurant menu; the Directory filter; Pricing; a legal draft; a SAMPLE owner's dashboard with
 * bookings in several statuses.
 *
 * Usage: node tests/e2e/phase13.js   (after `wp ek sample-data`)
 */
const { chromium, devices } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const SHOTS = path.join( __dirname, 'screenshots' );
fs.mkdirSync( SHOTS, { recursive: true } );
const ROOT = path.join( __dirname, '..', '..' );
const wp = ( cmd ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp ${ cmd }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim();

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };

( async () => {
	wp( 'ek sample-data' ); // Makes sure it is there (does nothing if it already is).
	wp( `eval 'EK\\Integrations::clear_page_cache();'` );
	const pages = JSON.parse( wp( `eval 'echo wp_json_encode( array_map( static fn( $k ) => wp_make_link_relative( EK\\Install::page_url( $k ) ), array( "home","explore","map","hotels","restaurants","event_centres","things_to_do","tours","events","top_hotels","top_restaurants","top_event_centres","guides","directory","plan_trip","stories","list_business","pricing","advertise","account","about","contact","faq_travellers","faq_businesses","booking_policy","refund_policy","review_guidelines","agreement","privacy","terms" ) ) );'` ).split( '\n' ).pop() );
	pages.push( '/shop/', '/plan-your-trip/itineraries/', '/plan-your-trip/safety-and-travel-tips/' );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );

	console.log( `1. All ${ pages.length } pages at 360 / 768 / 1280` );
	const bad = [];
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 800 } } );
		const pg = await c.newPage();
		watch( pg );
		for ( const u of pages ) {
			const r = await pg.goto( BASE + u );
			const html = await pg.content();
			if ( ! r || r.status() >= 400 || /wpdberror|Fatal error|critical error/.test( html ) ) { bad.push( `${ u }@${ w }` ); }
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
	}
	check( 0 === bad.length, 'Every page opens without errors' + ( bad.length ? ' → ' + bad.join( ', ' ) : '' ) );
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );

	console.log( '2. Sample content on a computer' );
	const dc = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const d = await dc.newPage();
	watch( d );
	await d.goto( BASE + '/' );
	const top = await d.locator( '[data-ekt-top="hotel"] li' ).allTextContents();
	check( top.length === 3 && top[ 0 ].includes( 'SAMPLE' ), 'Homepage: top-ranked SAMPLE hotels' );
	check( await d.locator( '#ekt-tours .ekt-card' ).count() >= 2 && await d.locator( '#ekt-events .ekt-event' ).count() >= 2, 'Homepage: SAMPLE tours and the ticketed event' );
	await d.screenshot( { path: path.join( SHOTS, 'p13-home-1280.png' ), fullPage: true } );
	await d.goto( BASE + '/top-hotels/' );
	const ranks = await d.locator( '.ek-top-list li' ).count();
	check( ranks >= 7, `Top 10 hotels lists ${ ranks } ranked SAMPLE hotels` );
	await d.locator( '.ek-top-list a:has-text("SAMPLE Crimson Gate Hotel")' ).first().click();
	await d.waitForLoadState();
	const hp = await d.locator( 'main' ).textContent();
	check( /Verified booking/i.test( hp ) && /SAMPLE review/.test( hp ) && /#\d+ of \d+ hotels/.test( hp ), 'Hotel page: its rank and verified SAMPLE reviews' );
	check( /Royal Suite|Standard Room/.test( hp ) && /₦/.test( hp ), 'Hotel page: room categories with Naira prices' );
	await d.screenshot( { path: path.join( SHOTS, 'p13-hotel-1280.png' ), fullPage: true } );
	await d.goto( BASE + '/top-restaurants/' );
	await d.locator( '.ek-top-list a:has-text("SAMPLE Mama Tuwo Kitchen")' ).first().click();
	await d.waitForLoadState();
	const menu = await d.locator( 'main' ).textContent();
	check( /Tuwo|Suya|Jollof|Masa/.test( menu ) && /₦1,\d{3}|₦\d,\d{3}/.test( menu ), 'Restaurant page: full menu with prices' );
	await d.goto( BASE + '/directory/' );
	check( await d.locator( '.ek-dir-name' ).count() >= 39, 'Directory lists all the SAMPLE businesses' );
	await d.selectOption( '#ek-dir-type', 'health' );
	await Promise.all( [ d.waitForNavigation(), d.click( '.ek-dir-filter button' ) ] );
	check( await d.locator( '.ek-dir-name' ).count() === 3 && /Health/.test( await d.locator( '.ek-directory h2' ).first().textContent() ), 'Directory filter: Health & Emergency (3)' );
	await d.screenshot( { path: path.join( SHOTS, 'p13-directory-1280.png' ), fullPage: true } );
	await d.goto( BASE + '/pricing/' );
	check( /Free/.test( await d.locator( '.ek-pricing' ).textContent() ) && await d.locator( '.ek-price-card' ).count() === 3, 'Pricing: Basic (free), Featured, Premium' );
	await d.screenshot( { path: path.join( SHOTS, 'p13-pricing-1280.png' ), fullPage: true } );
	await d.goto( BASE + '/privacy-policy/' );
	check( await d.locator( '.ek-legal-draft' ).isVisible() && /Nigeria Data Protection Act 2023/.test( await d.locator( 'main' ).textContent() ), 'Privacy policy: draft notice and NDPA 2023' );
	await d.screenshot( { path: path.join( SHOTS, 'p13-privacy-1280.png' ), fullPage: true } );
	await d.goto( BASE + '/guides/' );
	check( /Pocket Guide/.test( await d.locator( 'main' ).textContent() ), 'Guides page: the SAMPLE digital guide' );

	console.log( '3. A SAMPLE owner\'s dashboard' );
	const pass = 'Sample-owner-' + Date.now().toString( 36 );
	wp( `user update sample_crimson-gate-hotel --user_pass=${ pass } --skip-email` );
	const oc = await browser.newContext( { ...devices[ 'Pixel 5' ] } );
	const o = await oc.newPage();
	watch( o );
	await o.goto( BASE + '/wp-login.php' );
	await o.fill( '#user_login', 'sample_crimson-gate-hotel' );
	await o.fill( '#user_pass', pass );
	await o.click( '#wp-submit' );
	await o.waitForLoadState();
	await o.goto( BASE + '/business-dashboard/?section=bookings' );
	const dash = await o.locator( 'body' ).textContent();
	check( /SAMPLE Crimson Gate Hotel/.test( dash ) && /Awaiting payment|New|Confirmed|Declined|Payment issue|Expired/.test( dash ), 'Dashboard: bookings in several statuses' );
	await o.screenshot( { path: path.join( SHOTS, 'p13-dashboard-phone.png' ), fullPage: true } );

	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + [ ...new Set( jsErrors ) ].join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll pages & sample-data browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
