/**
 * Phase 3 browser journey: hotel sets up rooms, prices and calendar → guest uses "Near me",
 * sorts by distance, books 2 nights with full online (test) payment → hotel confirms.
 * Then 8 guests try to book the last room for the same night at the same moment.
 *
 * Usage: node tests/e2e/phase3.js
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

// Dates: a Monday 3–4 weeks ahead (Lagos), so nothing clashes with other tests.
const iso = ( d ) => d.toISOString().slice( 0, 10 );
const base = new Date(); base.setUTCHours( 12 ); base.setUTCDate( base.getUTCDate() + 21 + ( ( 8 - base.getUTCDay() ) % 7 ) );
const day = ( n ) => { const d = new Date( base ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); };

( async () => {
	const stamp = Date.now().toString( 36 );
	// Each run gets its own spot (SAMPLE hotels from earlier runs stay on the map).
	const lat = ( 12.62 + Math.random() * 0.06 ).toFixed( 5 ); // Near Ingawa: over 25 km from the SAMPLE towns (and their Featured hotel).
	const lng = ( 8.05 + Math.random() * 0.06 ).toFixed( 5 );
	const fx = JSON.parse( wp( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ lat } ${ lng }` ).split( '\n' ).pop() );
	console.log( `Fixture hotel ${ fx.id } (${ fx.url })` );

	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];

	/* ---------- 1. Hotel owner sets up the hotel ---------- */
	console.log( '1. Hotel owner: details, rooms, calendar' );
	const oc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } );
	const o = await oc.newPage();
	o.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await o.goto( BASE + '/business-dashboard/' );
	await o.fill( '#user_login', fx.user );
	await o.fill( '#user_pass', fx.pass );
	await Promise.all( [ o.waitForNavigation(), o.click( '#wp-submit' ) ] );
	const dash = ( s, extra = '' ) => `${ BASE }/business-dashboard/?section=${ s }&business=${ fx.id }${ extra }`;

	await o.goto( dash( 'hotel' ) );
	await o.selectOption( '#ek-stars', '3' );
	for ( const a of [ 'wifi', 'parking', 'power', 'restaurant' ] ) { await o.check( `input[name="amenities[]"][value="${ a }"]` ); }
	await o.check( 'input[name=policy][value=moderate]' );
	await o.check( 'input[name=pay_deposit]' );
	await o.fill( '#ek-rules', 'Valid ID required at check-in. No smoking in rooms.' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save hotel details")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Hotel details saved' );
	await o.screenshot( { path: path.join( SHOTS, 'p3-hotel-details-390.png' ), fullPage: true } );

	const addRoom = async ( name, price, units, guests, bed, weekend = '' ) => {
		await o.goto( dash( 'rooms', '&room=new' ) );
		await o.fill( '#r-name', name );
		await o.fill( '#r-units', String( units ) );
		await o.fill( '#r-price', price );
		if ( weekend ) { await o.fill( '#r-wprice', weekend ); }
		await o.fill( '#r-guests', String( guests ) );
		await o.selectOption( '#r-bed', bed );
		await o.check( 'input[name="room_amenities[]"][value="tv"]' );
		await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save room category")' ) ] );
	};
	// Validation first.
	await o.goto( dash( 'rooms', '&room=new' ) );
	await Promise.all( [ o.waitForLoadState(), o.click( 'button:has-text("Save room category")' ) ] );
	check( await o.locator( '.ek-field.has-error' ).count() >= 3, 'Empty room form shows errors' );
	await addRoom( 'Standard', '18,000', 4, 2, 'double', '22,000' );
	await addRoom( 'Executive Suite', '45,000', 1, 3, 'king' );
	check( await o.locator( '.ek-roomcard' ).count() === 2, 'Two room categories added' );
	await o.screenshot( { path: path.join( SHOTS, 'p3-rooms-390.png' ), fullPage: true } );

	await o.goto( dash( 'calendar' ) );
	await o.click( 'a.ek-pill:has-text("Standard")' );
	await o.fill( '#s-label', 'Sallah peak (SAMPLE)' );
	await o.fill( '#s-from', day( 5 ) );
	await o.fill( '#s-to', day( 6 ) );
	await o.fill( '#s-price', '30000' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Add seasonal price")' ) ] );
	check( await o.locator( '.ek-rules li' ).count() === 1, 'Seasonal price added' );
	await o.fill( '#c-from', day( 9 ) );
	await o.fill( '#c-to', day( 9 ) );
	await o.selectOption( '#c-op', 'close' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Apply")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Date closed in calendar' );
	await o.goto( dash( 'calendar', `&month=${ day( 0 ).slice( 0, 7 ) }` ) );
	await o.screenshot( { path: path.join( SHOTS, 'p3-calendar-390.png' ), fullPage: true } );

	/* ---------- 2. Guest: Near me → distance → book 2 nights, pay online ---------- */
	console.log( '2. Guest books with "Near me" and online payment' );
	const gc = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, geolocation: { latitude: parseFloat( lat ) + 0.0004, longitude: parseFloat( lng ) + 0.0003 }, permissions: [ 'geolocation' ] } );
	const g = await gc.newPage();
	g.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await g.goto( BASE + '/hotels/' );
	await g.fill( '#s-in', day( 0 ) );
	await g.fill( '#s-out', day( 2 ) );
	await Promise.all( [ g.waitForNavigation(), g.click( '[data-ek-near-me]' ) ] );
	check( /sort=distance/.test( g.url() ) && /lat=1[23]\./.test( g.url() ), '"Near me" searches by location, sorted by distance' );
	const first = g.locator( '.ek-result' ).first();
	check( ( await first.locator( '.ek-result-name' ).textContent() ).includes( stamp ), 'Nearest hotel is first' );
	check( /\d+ m away|km away/.test( await first.textContent() ), 'Shows distance ("… m away")' );
	check( /₦36,000/.test( await first.textContent() ), 'Shows the 2-night total for the cheapest room (₦36,000)' );
	await g.screenshot( { path: path.join( SHOTS, 'p3-search-360.png' ), fullPage: true } );
	await g.goto( g.url().replace( /view=[^&]*&?/, '' ) + '&view=map' );
	check( await g.locator( '[data-ek-results-map] .leaflet-marker-icon' ).count() >= 1, 'Map view shows hotel pins' );

	await g.goto( g.url().replace( '&view=map', '' ) );
	await Promise.all( [ g.waitForNavigation(), first.locator( 'a:has-text("See rooms")' ).click() ] );
	check( await g.locator( '.ek-room' ).count() === 2, 'Hotel page lists both room categories' );
	await g.screenshot( { path: path.join( SHOTS, 'p3-hotel-page-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.locator( '.ek-room', { hasText: 'Standard' } ).locator( 'a:has-text("Book now")' ).click() ] );
	check( /₦36,000/.test( await g.locator( '.ek-book-summary' ).textContent() ), 'Booking summary total ₦36,000 for 2 nights' );
	await g.fill( '#g-name', 'SAMPLE Guest Aisha' );
	await g.fill( '#g-email', `guest_${ stamp }@example.test` );
	await g.fill( '#g-phone', '0803 000 0022' );
	await g.check( 'input[name=payment][value=full]' );
	await g.check( 'input[name=agree]' );
	await g.screenshot( { path: path.join( SHOTS, 'p3-booking-form-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Confirm booking")' ) ] );
	check( await g.locator( 'text=Test payment: no real money' ).count() === 1, 'Guest sent to the (test) payment page' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Pay (test, succeeds)")' ) ] );
	const code = ( await g.locator( '.ek-code' ).textContent() ).trim();
	check( /^EK-[A-Z2-9]{6}$/.test( code ), `Confirmation shows booking code ${ code }` );
	check( ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'waiting for the hotel' ), 'Status: waiting for the hotel to confirm' );
	await g.screenshot( { path: path.join( SHOTS, 'p3-confirmation-360.png' ), fullPage: true } );
	const confirmUrl = g.url();

	/* ---------- 3. Hotel confirms ---------- */
	console.log( '3. Hotel confirms' );
	await o.goto( dash( 'bookings' ) );
	const card = o.locator( '.ek-booking', { hasText: code } );
	check( await card.count() === 1, 'Booking appears under "Needs action"' );
	await o.screenshot( { path: path.join( SHOTS, 'p3-dashboard-bookings-390.png' ), fullPage: true } );
	await Promise.all( [ o.waitForNavigation(), card.locator( 'button:has-text("Confirm")' ).click() ] );
	await g.goto( confirmUrl );
	check( ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'confirmed' ), 'Guest’s page now says "confirmed"' );
	await o.goto( dash( 'earnings' ) );
	check( /₦36,000/.test( await o.locator( '.ek-stats' ).textContent() ) && /₦3,600/.test( await o.locator( '.ek-stats' ).textContent() ), 'Earnings: ₦36,000 earned, ₦3,600 commission, on hold' );

	/* ---------- 4. Last room race ---------- */
	console.log( '4. Eight guests race for the last Executive Suite' );
	const roomId = parseInt( wp( `post list --post_type=ek_room --post_parent=${ fx.id } --name=executive-suite --field=ID` ), 10 )
		|| parseInt( wp( `post list --post_type=ek_room --post_parent=${ fx.id } --s=Executive --field=ID` ), 10 );
	const formUrl = `${ BASE }/book/?room=${ roomId }&checkin=${ day( 3 ) }&checkout=${ day( 4 ) }&guests=2&rooms=1`;
	const pages = [];
	for ( let i = 0; i < 8; i++ ) {
		const c = await browser.newContext();
		const pg = await c.newPage();
		await pg.goto( formUrl );
		await pg.fill( '#g-name', `SAMPLE Racer ${ i }` );
		await pg.fill( '#g-email', `racer${ i }_${ stamp }@example.test` );
		await pg.fill( '#g-phone', '0803 000 00' + String( 30 + i ) );
		await pg.check( 'input[name=payment][value=venue]' );
		await pg.check( 'input[name=agree]' );
		pages.push( pg );
	}
	await Promise.all( pages.map( ( pg ) => Promise.all( [ pg.waitForLoadState( 'load' ), pg.click( 'button:has-text("Confirm booking")' ) ] ) ) );
	await new Promise( ( r ) => setTimeout( r, 1500 ) );
	let won = 0, lost = 0;
	for ( const pg of pages ) {
		if ( await pg.locator( '.ek-code' ).count() ) { won++; }
		if ( await pg.locator( 'text=just booked by someone else' ).count() ) { lost++; }
	}
	check( 1 === won && 7 === lost, `Exactly one guest got the room (${ won } succeeded, ${ lost } told "just booked")` );
	const dbCount = parseInt( wp( `db query "SELECT COUNT(*) FROM wp_ek_bookings WHERE item_id=${ roomId } AND start_date='${ day( 3 ) }' AND status='new'" --skip-column-names` ), 10 );
	const nightRow = wp( `db query "SELECT booked FROM wp_ek_nights WHERE item_id=${ roomId } AND night='${ day( 3 ) }'" --skip-column-names` );
	check( 1 === dbCount && '1' === nightRow, 'Database: one booking, calendar shows 1 of 1 booked' );
	const losing = pages.find( async ( pg ) => ( await pg.locator( '.ek-code' ).count() ) === 0 );
	for ( const pg of pages ) { if ( await pg.locator( 'text=just booked by someone else' ).count() ) { await pg.screenshot( { path: path.join( SHOTS, 'p3-sold-out-message.png' ), fullPage: true } ); break; } }

	/* ---------- 5. Layout checks ---------- */
	console.log( '5. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 900 }, deviceScaleFactor: 1 } );
		const pg = await c.newPage();
		for ( const u of [ `/hotels/?checkin=${ day( 0 ) }&checkout=${ day( 2 ) }`, `${ new URL( fx.url ).pathname }?checkin=${ day( 0 ) }&checkout=${ day( 2 ) }`, `/book/?room=${ roomId }&checkin=${ day( 10 ) }&checkout=${ day( 11 ) }&guests=2` ] ) {
			await pg.goto( BASE + u );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		if ( 1280 === w ) {
			await pg.goto( `${ BASE }/hotels/?checkin=${ day( 0 ) }&checkout=${ day( 2 ) }` );
			await pg.screenshot( { path: path.join( SHOTS, 'p3-search-1280.png' ), fullPage: true } );
		}
		await c.close();
	}
	const ownerCtx = await browser.newContext( { viewport: { width: 1280, height: 900 }, storageState: await oc.storageState() } );
	const op = await ownerCtx.newPage();
	await op.goto( dash( 'calendar', `&month=${ day( 0 ).slice( 0, 7 ) }` ) );
	await op.screenshot( { path: path.join( SHOTS, 'p3-calendar-1280.png' ), fullPage: true } );
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );

	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll hotel browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
