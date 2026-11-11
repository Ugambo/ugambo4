/**
 * Phase 9 browser journey: Featured plan + Verified application (owner and admin), event tickets with QR codes
 * and staff check-in, own tour booking and cancellation, event promotion, listing setup order, banner ad and
 * partner link counting, Advertise enquiry, admin sales and revenue screens.
 *
 * Usage: node tests/e2e/phase9.js
 */
const { chromium } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const SHOTS = path.join( __dirname, 'screenshots' );
fs.mkdirSync( SHOTS, { recursive: true } );
const ROOT = path.join( __dirname, '..', '..' );
const wp = ( cmd ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp ${ cmd }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim();
const json = ( cmd ) => JSON.parse( wp( cmd ).split( '\n' ).pop() );
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };
const rnd = ( a ) => ( a + Math.random() * 0.08 ).toFixed( 5 );

( async () => {
	const stamp = Date.now().toString( 36 );
	const fx = json( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ rnd( 12.95 ) } ${ rnd( 7.56 ) } hotel` );
	json( `eval-file ek-tests/e2e/fixture-phase7.php setup ${ fx.id }` );
	const f9 = json( `eval-file ek-tests/e2e/fixture-phase9.php ${ stamp }` );
	console.log( `Fixture hotel ${ fx.id }, event ${ f9.event }, tour ${ f9.tour }` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	const testPay = async ( pg ) => { await Promise.all( [ pg.waitForNavigation(), pg.click( 'button:has-text("Pay (test, succeeds)")' ) ] ); };

	/* 1. Owner buys Featured, applies for Verified */
	console.log( '1. Hotel owner: Featured plan and Verified application' );
	const oc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } );
	const o = await oc.newPage();
	watch( o );
	await o.goto( BASE + '/business-dashboard/' );
	await o.fill( '#user_login', fx.user );
	await o.fill( '#user_pass', fx.pass );
	await Promise.all( [ o.waitForNavigation(), o.click( '#wp-submit' ) ] );
	const dash = ( s ) => `${ BASE }/business-dashboard/?section=${ s }&business=${ fx.id }`;
	await o.goto( dash( 'plan' ) );
	check( ( await o.locator( '#pl-h' ).locator( '..' ).textContent() ).includes( 'Basic (free)' ), 'Plan page: currently Basic (free)' );
	await o.screenshot( { path: path.join( SHOTS, 'p9-plan-390.png' ), fullPage: true } );
	await Promise.all( [ o.waitForNavigation(), o.locator( '.ek-plan', { hasText: 'Featured' } ).first().locator( 'button:has-text("1 month")' ).click() ] );
	check( await o.locator( 'text=Test payment: no real money' ).count() === 1 && /₦10,000/.test( await o.locator( '.ek-book h1' ).textContent() ), 'Sent to pay ₦10,000 (test payment page)' );
	await testPay( o );
	check( o.url().includes( 'section=plan' ) && await o.locator( 'text=Payment received' ).count() === 1, 'Back on the Plan page: payment received' );
	check( ( await o.locator( '#pl-h' ).locator( '..' ).textContent() ).includes( 'Featured' ) && /Active until/.test( await o.locator( '#pl-h' ).locator( '..' ).textContent() ), 'Plan: Featured, with its end date' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Apply for Verified")' ) ] );
	await testPay( o );
	check( ( await o.locator( '#vf-h' ).locator( '..' ).textContent() ).includes( 'Application being reviewed' ), 'Verified application paid: "being reviewed"' );
	const pins = await ( await oc.request.get( `${ BASE }/wp-json/ek/v1/map?bbox=11,6,14,9&types=hotel` ) ).json();
	check( pins.pins.some( ( p ) => p.id === fx.id && p.featured ), 'Map: the hotel now has a highlighted (Featured) pin' );
	// Only 3 Featured places get the top spots: clear Featured from test hotels left by earlier runs (not the demo data).
	wp( `eval 'foreach ( get_posts( array( "post_type" => "ek_business", "post_status" => "any", "fields" => "ids", "posts_per_page" => -1, "meta_key" => "_ek_featured_until" ) ) as $id ) { if ( ${ fx.id } !== $id && 0 === strpos( get_the_title( $id ), "SAMPLE" ) && ! get_post_meta( $id, "_ek_sample_set", true ) ) { delete_post_meta( $id, "_ek_featured_until" ); update_post_meta( $id, "_ek_plan", "basic" ); } }'` );
	const hs = await ( await browser.newContext( { viewport: { width: 1280, height: 900 }, userAgent: UA } ) ).newPage();
	watch( hs );
	await hs.goto( BASE + '/hotels/' );
	const firstRes = await hs.locator( '.ek-result' ).first().textContent();
	check( firstRes.includes( 'Featured' ) && ( await hs.locator( '.ek-result', { hasText: stamp } ).first().textContent() ).includes( 'Featured' ), 'Hotel search: Featured places at the top, marked "Featured"' );
	check( await hs.locator( '.ek-ad--search img' ).count() === 1 && ( await hs.locator( '.ek-ad--search' ).textContent() ).includes( 'Advertisement' ), 'Search page shows the banner ad, labelled "Advertisement"' );
	await hs.screenshot( { path: path.join( SHOTS, 'p9-search-featured-1280.png' ) } );
	const adHref = await hs.locator( '.ek-ad--search a' ).getAttribute( 'href' );
	const adGo = await hs.request.get( adHref, { maxRedirects: 0 } );
	check( 302 === adGo.status() && adGo.headers().location === 'https://example.com/sample-ad', 'Ad click is counted, then goes to the advertiser' );

	/* 2. Admin approves Verified */
	console.log( '2. Admin: approve Verified, see sales and revenue' );
	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const a = await ac.newPage();
	await a.goto( BASE + '/wp-login.php' );
	await a.fill( '#user_login', env.EK_ADMIN_USER );
	await a.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await Promise.all( [ a.waitForNavigation(), a.click( '#wp-submit' ) ] );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-sales' );
	const vrow = a.locator( 'tr', { hasText: `Durbar View Hotel ${ stamp }` } );
	check( await vrow.count() === 1, 'Verified application waiting in Sales & services' );
	await a.screenshot( { path: path.join( SHOTS, 'p9-admin-sales-1280.png' ), fullPage: true } );
	await Promise.all( [ a.waitForNavigation(), vrow.locator( 'button:has-text("Approve")' ).click() ] );
	await o.goto( dash( 'plan' ) );
	check( ( await o.locator( '#vf-h' ).locator( '..' ).textContent() ).includes( 'Your business is Verified' ), 'Owner now sees "Your business is Verified"' );

	/* 3. Tickets */
	console.log( '3. Visitor buys event tickets; staff check them in' );
	const gc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, userAgent: UA } );
	const g = await gc.newPage();
	watch( g );
	await g.goto( f9.event_url );
	check( ( await g.locator( '#tickets' ).textContent() ).includes( '₦3,000' ) && ( await g.locator( '#tickets' ).textContent() ).includes( 'VIP' ), 'Event page lists Regular ₦3,000 and VIP tickets' );
	await g.locator( 'select[name^="qty"]' ).first().selectOption( '2' );
	await g.fill( '#tk-name', 'SAMPLE Hauwa Musa' );
	await g.fill( '#tk-email', `hauwa_${ stamp }@example.test` );
	await g.fill( '#tk-phone', '0803 000 0093' );
	await g.screenshot( { path: path.join( SHOTS, 'p9-event-tickets-390.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( '#tickets button:has-text("Get tickets")' ) ] );
	check( /₦6,000/.test( await g.locator( '.ek-book h1' ).first().textContent() ), 'Pay ₦6,000 for 2 Regular tickets' );
	await testPay( g );
	await g.waitForSelector( '.ek-ticket-qr svg' );
	const codes = await g.locator( '.ek-ticket-qr' ).evaluateAll( ( els ) => els.map( ( e ) => e.getAttribute( 'data-ek-qr' ) ) );
	check( codes.length === 2 && await g.locator( '.ek-ticket-qr svg' ).count() === 2, 'Receipt shows 2 tickets, each with its own QR code' );
	await g.screenshot( { path: path.join( SHOTS, 'p9-tickets-390.png' ), fullPage: true } );
	const sc = await browser.newContext( { viewport: { width: 390, height: 844 } } );
	const s = await sc.newPage();
	watch( s );
	await s.goto( BASE + '/check-in/' );
	check( await s.locator( 'text=Staff only' ).count() === 1, 'Check-in page asks staff to log in' );
	await s.fill( '#user_login', f9.staff );
	await s.fill( '#user_pass', f9.staff_pass );
	await Promise.all( [ s.waitForNavigation(), s.click( '#wp-submit' ) ] );
	await s.selectOption( '[data-event]', String( f9.event ) );
	await s.fill( '[data-code]', codes[ 0 ] );
	await s.click( '[data-manual] button' );
	await s.waitForSelector( '.ek-ci-result.is-ok' );
	check( ( await s.locator( '[data-result]' ).textContent() ).includes( 'Welcome' ), 'Staff: ticket 1 checked in ("Welcome!")' );
	await s.screenshot( { path: path.join( SHOTS, 'p9-checkin-390.png' ), fullPage: true } );
	await s.fill( '[data-code]', codes[ 0 ] );
	await s.click( '[data-manual] button' );
	await s.waitForSelector( '.ek-ci-result.is-already' );
	check( ( await s.locator( '[data-result]' ).textContent() ).includes( 'Already used' ), 'Same ticket again: "Already used"' );
	check( /1 \/ 2 checked in/.test( await s.locator( '[data-counts]' ).textContent() ), 'Counter: 1 / 2 checked in' );

	/* 4. Tour */
	console.log( '4. Visitor books a tour and cancels' );
	await g.goto( f9.tour_url );
	await g.fill( '#bt-people', '2' );
	await g.fill( '#bt-name', 'SAMPLE Hauwa Musa' );
	await g.fill( '#bt-email', `hauwa_${ stamp }@example.test` );
	await g.fill( '#bt-phone', '0803 000 0093' );
	await g.screenshot( { path: path.join( SHOTS, 'p9-tour-390.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Book and pay")' ) ] );
	check( /₦24,000/.test( await g.locator( '.ek-book h1' ).first().textContent() ), '2 people × ₦12,000 = ₦24,000' );
	await testPay( g );
	check( ( await g.locator( '#tr-h' ).locator( '..' ).textContent() ).includes( 'SAMPLE pickup point' ), 'Receipt shows the date, people and pickup point' );
	await g.click( 'summary:has-text("Cancel this booking")' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Yes, cancel it")' ) ] );
	check( ( await g.locator( '.ek-confirm-head' ).textContent() ).includes( 'refunded' ), 'Cancelled more than 48 hours before: refunded' );

	/* 5. Promotion and setup orders */
	console.log( '5. Organiser promotes an event; a business orders listing setup' );
	await g.goto( BASE + '/promote-event/' );
	await g.fill( '#pe-title', `SAMPLE Craft Fair ${ stamp }` );
	await g.fill( '#pe-venue', 'SAMPLE Ground' );
	await g.fill( '#pe-about', 'SAMPLE craft fair created by the automated test. Not a real event.' );
	await g.fill( '#pe-name', 'SAMPLE Organiser' );
	await g.fill( '#pe-phone', '0803 000 0094' );
	await g.fill( '#pe-email', `org_${ stamp }@example.test` );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Continue to payment")' ) ] );
	await testPay( g );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-sales' );
	const prow = a.locator( 'tr', { hasText: `SAMPLE Craft Fair ${ stamp }` } );
	await Promise.all( [ a.waitForNavigation(), prow.locator( 'button:has-text("Approve")' ).click() ] );
	await g.goto( BASE + '/events/' );
	const cards = await g.locator( '.ek-event-card' ).allTextContents();
	const mine = cards.findIndex( ( t ) => t.includes( `SAMPLE Craft Fair ${ stamp }` ) );
	const firstPlain = cards.findIndex( ( t ) => ! t.includes( 'Promoted' ) );
	check( mine >= 0 && cards[ mine ].includes( 'Promoted' ) && ( firstPlain === -1 || mine < firstPlain ), 'Approved promotion: the event is listed above all ordinary events, labelled "Promoted"' );
	await g.screenshot( { path: path.join( SHOTS, 'p9-events-390.png' ), fullPage: true } );
	await g.goto( BASE + '/listing-setup/' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Continue to payment")' ) ] );
	check( await g.locator( '.has-error' ).count() >= 4, 'Setup order form: missing details are pointed out' );
	await g.check( 'input[name=package][value=photos]' );
	await g.fill( '#su-name', `SAMPLE Leather Shop ${ stamp }` );
	await g.selectOption( '#su-type', 'restaurant' );
	await g.selectOption( '#su-lga', { label: 'Daura' } );
	await g.fill( '#su-cn', 'SAMPLE Owner' );
	await g.fill( '#su-ph', '0803 000 0095' );
	await g.fill( '#su-em', `shop_${ stamp }@example.test` );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Continue to payment")' ) ] );
	check( /₦30,000/.test( await g.locator( '.ek-book h1' ).first().textContent() ), 'Setup + photo visit: pay ₦30,000' );
	await testPay( g );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-sales' );
	check( ( await a.locator( '.wrap' ).textContent() ).includes( `SAMPLE Leather Shop ${ stamp }` ), 'Admin sees the setup order' );

	/* 6. Advertise + partner link */
	console.log( '6. Advertise page and partner link' );
	await g.goto( BASE + '/advertise/' );
	await g.fill( '#en-name', 'SAMPLE Marketer' );
	await g.fill( '#en-email', `ads_${ stamp }@example.test` );
	await g.selectOption( '#en-int', 'banner' );
	await g.fill( '#en-msg', 'SAMPLE: we would like a homepage banner for one month.' );
	await g.screenshot( { path: path.join( SHOTS, 'p9-advertise-390.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Send enquiry")' ) ] );
	check( await g.locator( 'text=we have received your enquiry' ).count() === 1, 'Enquiry sent' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-enquiries' );
	check( ( await a.locator( '.wrap' ).textContent() ).includes( `ads_${ stamp }@example.test` ), 'Admin sees the enquiry' );
	const go = await g.request.get( `${ BASE }/go/${ f9.partner }/`, { maxRedirects: 0 } );
	check( 302 === go.status() && go.headers().location.includes( 'ref=explorekatsina' ), 'Partner link counts the click and forwards with our referral code' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-partners' );
	check( '1' === ( await a.locator( 'tr', { hasText: `SAMPLE Car Hire ${ stamp }` } ).locator( 'td' ).last().textContent() ).trim(), 'Partner report shows the click this month' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-revenue' );
	const rev = await a.locator( '.wrap' ).textContent();
	check( rev.includes( 'Featured / Premium plans' ) && rev.includes( 'Event tickets' ) && rev.includes( 'Own tours' ) && rev.includes( 'Banner ads' ), 'Revenue dashboard: monthly income from every source' );
	await a.screenshot( { path: path.join( SHOTS, 'p9-admin-revenue-1280.png' ), fullPage: true } );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-ads' );
	check( ( await a.locator( 'tr', { hasText: `SAMPLE Banner ${ stamp }` } ).textContent() ).match( /\t?\s*[1-9]\d*\s*/ ) !== null, 'Ads screen shows views and clicks' );

	/* 7. Layout */
	console.log( '7. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 800 } } );
		const pg = await c.newPage();
		watch( pg );
		for ( const u of [ '/events/', '/tours/', '/promote-event/', '/listing-setup/', '/advertise/', new URL( f9.event_url ).pathname, new URL( f9.tour_url ).pathname ] ) {
			await pg.goto( BASE + u );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
		const c2 = await browser.newContext( { viewport: { width: w, height: 800 }, storageState: await oc.storageState() } );
		const p2 = await c2.newPage();
		await p2.goto( dash( 'plan' ) );
		const over = await p2.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
		if ( over > 1 ) { wide.push( `plan@${ w }:${ over }` ); }
		await c2.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	await browser.close();
	// Leave no Featured sample hotel behind (other tests expect plain search order).
	wp( `eval 'delete_post_meta( ${ fx.id }, "_ek_featured_until" ); update_post_meta( ${ fx.id }, "_ek_plan", "basic" ); EK\\Map_Index::refresh( ${ fx.id } );'` );
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll revenue-feature browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
