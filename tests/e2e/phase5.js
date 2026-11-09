/**
 * Phase 5 browser journey (Phase 15 journey 6): event centre adds a hall → guest requests to book →
 * centre confirms → guest pays the deposit → event completed (simulated date) → money on hold until
 * 3 days after the event.
 *
 * Usage: node tests/e2e/phase5.js
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

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };
const iso = ( d ) => d.toISOString().slice( 0, 10 );
const base = new Date(); base.setUTCHours( 12 ); base.setUTCDate( base.getUTCDate() + 28 + ( ( 8 - base.getUTCDay() ) % 7 ) );
const day = ( n ) => { const d = new Date( base ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); };

( async () => {
	const stamp = Date.now().toString( 36 );
	const lat = ( 12.95 + Math.random() * 0.08 ).toFixed( 5 );
	const lng = ( 7.56 + Math.random() * 0.08 ).toFixed( 5 );
	const fx = JSON.parse( wp( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ lat } ${ lng } event-centre` ).split( '\n' ).pop() );
	console.log( `Fixture event centre ${ fx.id }` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];

	/* 1. Event centre sets up */
	console.log( '1. Event centre: venue details, hall, calendar' );
	const oc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } );
	const o = await oc.newPage();
	o.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await o.goto( BASE + '/business-dashboard/' );
	await o.fill( '#user_login', fx.user );
	await o.fill( '#user_pass', fx.pass );
	await Promise.all( [ o.waitForNavigation(), o.click( '#wp-submit' ) ] );
	const dash = ( s, extra = '' ) => `${ BASE }/business-dashboard/?section=${ s }&business=${ fx.id }${ extra }`;
	check( await o.locator( '.ek-app-tabs a:has-text("Halls")' ).count() === 1, 'Dashboard has Venue details, Halls and Calendar' );

	await o.goto( dash( 'venue' ) );
	for ( const a of [ 'parking', 'power', 'ac', 'chairs', 'sound', 'security' ] ) { await o.check( `input[name="amenities[]"][value="${ a }"]` ); }
	await o.check( 'input[name=booking_mode][value=request]' );
	await o.fill( '#v-dep', '30' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save venue details")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Venue details saved (request to book, 30% deposit)' );

	await o.goto( dash( 'halls', '&hall=new' ) );
	await o.fill( '#h-name', 'Grand Hall' );
	await o.fill( '#h-seat', '400' );
	await o.fill( '#h-stand', '600' );
	await o.fill( '#h-price', '350,000' );
	await o.fill( '#h-wprice', '450,000' );
	await o.selectOption( '#h-set', 'indoor' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save hall")' ) ] );
	check( await o.locator( '.ek-roomcard' ).count() === 1, 'Hall added' );
	await o.screenshot( { path: path.join( SHOTS, 'p5-halls-390.png' ), fullPage: true } );
	await o.goto( dash( 'calendar', `&month=${ day( 0 ).slice( 0, 7 ) }` ) );
	await o.fill( '#c-from', day( 9 ) );
	await o.fill( '#c-to', day( 9 ) );
	await o.selectOption( '#c-op', 'close' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Apply")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Blocked a date in the hall calendar' );

	/* 2. Guest requests to book */
	console.log( '2. Guest finds the venue and requests to book' );
	const gc = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, geolocation: { latitude: parseFloat( lat ) + 0.0004, longitude: parseFloat( lng ) + 0.0004 }, permissions: [ 'geolocation' ] } );
	const g = await gc.newPage();
	g.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await g.goto( BASE + '/event-centres/' );
	await g.fill( '#v-date', day( 1 ) );
	await g.fill( '#v-guests', '300' );
	await Promise.all( [ g.waitForNavigation(), g.click( '[data-ek-near-me]' ) ] );
	const first = g.locator( '.ek-result' ).first();
	check( ( await first.textContent() ).includes( stamp ) && /m away|km away/.test( await first.textContent() ), 'Near me + date + 300 guests: this venue first, with distance' );
	await g.screenshot( { path: path.join( SHOTS, 'p5-search-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), first.locator( 'a:has-text("See halls")' ).click() ] );
	check( /₦350,000/.test( await g.locator( '#halls' ).textContent() ) && /400 seated/.test( await g.locator( '#halls' ).textContent() ), 'Venue page shows the hall, capacity and price for the date' );
	await g.screenshot( { path: path.join( SHOTS, 'p5-venue-page-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( '#halls a:has-text("Request to book")' ) ] );
	await g.fill( '#g-name', 'SAMPLE Host Fatima' );
	await g.fill( '#g-email', `fatima_${ stamp }@example.test` );
	await g.fill( '#g-phone', '0803 000 0061' );
	await g.screenshot( { path: path.join( SHOTS, 'p5-request-form-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Send booking request")' ) ] );
	const code = ( await g.locator( '.ek-code' ).textContent() ).trim();
	check( ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'reply within 48 hours' ), `Request ${ code } sent; venue replies within 48 hours` );
	const confirmUrl = g.url();

	/* 3. Venue accepts, guest pays */
	console.log( '3. Venue accepts, guest pays the deposit' );
	await o.goto( dash( 'bookings' ) );
	const card = o.locator( '.ek-booking', { hasText: code } );
	check( await card.count() === 1 && ( await card.textContent() ).includes( 'Grand Hall' ), 'Request appears under "Needs action"' );
	await o.screenshot( { path: path.join( SHOTS, 'p5-requests-390.png' ), fullPage: true } );
	await Promise.all( [ o.waitForNavigation(), card.locator( 'button:has-text("Accept request")' ).click() ] );
	await g.goto( confirmUrl );
	check( ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'Pay the deposit' ), 'Guest sees "Accepted! Pay the deposit"' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'a:has-text("deposit")' ) ] );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Pay (test, succeeds)")' ) ] );
	check( ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'secured' ), 'Deposit ₦105,000 paid: "your date is secured"' );
	await g.screenshot( { path: path.join( SHOTS, 'p5-confirmation-360.png' ), fullPage: true } );

	/* 4. Event completed (pretend the date has passed) → money on hold 3 days */
	console.log( '4. Event completed, earnings released 3 days after the event' );
	wp( `db query "UPDATE wp_ek_bookings SET start_date=DATE_SUB(CURDATE(), INTERVAL 1 DAY), end_date=DATE_SUB(CURDATE(), INTERVAL 1 DAY) WHERE code='${ code }'"` );
	await o.goto( dash( 'bookings', '&tab=upcoming' ) );
	await Promise.all( [ o.waitForNavigation(), o.locator( '.ek-booking', { hasText: code } ).locator( 'button:has-text("Mark event completed")' ).click() ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Venue marks the event completed' );
	await o.goto( dash( 'earnings' ) );
	const stats = await o.locator( '.ek-stats' ).textContent();
	check( /₦105,000/.test( stats ) && /₦10,500/.test( stats ), 'Earnings: ₦105,000 deposit, ₦10,500 commission (10%), on hold' );

	/* 5. Layout */
	console.log( '5. Layout at 360 / 768 / 1280' );
	const wide = [];
	const pub = new URL( fx.url ).pathname;
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 900 } } );
		const pg = await c.newPage();
		for ( const u of [ `/event-centres/?date=${ day( 2 ) }`, `${ pub }?date=${ day( 2 ) }&guests=200` ] ) {
			await pg.goto( BASE + u );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		if ( 1280 === w ) { await pg.goto( `${ BASE }${ pub }?date=${ day( 2 ) }&guests=200` ); await pg.screenshot( { path: path.join( SHOTS, 'p5-venue-page-1280.png' ), fullPage: true } ); }
		await c.close();
		const oc2 = await browser.newContext( { viewport: { width: w, height: 900 }, storageState: await oc.storageState() } );
		const op = await oc2.newPage();
		for ( const s of [ 'venue', 'halls', 'calendar', 'bookings' ] ) {
			await op.goto( dash( s ) );
			const over = await op.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `dash:${ s }@${ w }:${ over }` ); }
		}
		await oc2.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll event centre browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
