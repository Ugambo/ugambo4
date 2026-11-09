/**
 * Phase 4 browser journey: restaurant sets details, menu and table settings →
 * guest finds it with "Near me", sees the menu, reserves a table → restaurant confirms.
 * Then 6 guests race for the last seats; and online ordering stays hidden while switched off.
 *
 * Usage: node tests/e2e/phase4.js
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

// A Monday 2–3 weeks ahead (avoid today's opening-hours edge cases).
const iso = ( d ) => d.toISOString().slice( 0, 10 );
const base = new Date(); base.setUTCHours( 12 ); base.setUTCDate( base.getUTCDate() + 14 + ( ( 8 - base.getUTCDay() ) % 7 ) );
const day = ( n ) => { const d = new Date( base ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); };

( async () => {
	const stamp = Date.now().toString( 36 );
	const lat = ( 12.95 + Math.random() * 0.08 ).toFixed( 5 );
	const lng = ( 7.56 + Math.random() * 0.08 ).toFixed( 5 );
	const fx = JSON.parse( wp( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ lat } ${ lng } restaurant` ).split( '\n' ).pop() );
	console.log( `Fixture restaurant ${ fx.id }` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];

	/* ---------- 1. Restaurant owner ---------- */
	console.log( '1. Restaurant owner: details, menu, table settings' );
	const oc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } );
	const o = await oc.newPage();
	o.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await o.goto( BASE + '/business-dashboard/' );
	await o.fill( '#user_login', fx.user );
	await o.fill( '#user_pass', fx.pass );
	await Promise.all( [ o.waitForNavigation(), o.click( '#wp-submit' ) ] );
	const dash = ( s, extra = '' ) => `${ BASE }/business-dashboard/?section=${ s }&business=${ fx.id }${ extra }`;

	check( await o.locator( '.ek-app-tabs a:has-text("Menu")' ).count() === 1 && await o.locator( '.ek-app-tabs a:has-text("Online orders")' ).count() === 0, 'Dashboard has Menu and Table settings, and no "Online orders" (switched off)' );
	await o.goto( dash( 'restaurant' ) );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save restaurant details")' ) ] );
	check( await o.locator( '.has-error' ).count() > 0, 'Must choose at least one type of food' );
	for ( const c of [ 'hausa', 'grills' ] ) { await o.check( `input[name="cuisines[]"][value="${ c }"]` ); }
	await o.check( 'input[name=price_level][value="2"]' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save restaurant details")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Restaurant details saved' );

	await o.goto( dash( 'menu' ) );
	const addCat = async ( n ) => { await o.fill( '#m-cat', n ); await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Add category")' ) ] ); };
	await addCat( 'Rice dishes' );
	await addCat( 'Grills' );
	const addDish = async ( cat, name, price, desc = '' ) => {
		const sec = o.locator( '.ek-menucat', { hasText: cat } );
		const det = sec.locator( 'details.ek-add-dish' );
		if ( ! ( await det.getAttribute( 'open' ) !== null ) ) { await det.locator( 'summary' ).click(); }
		const f = det.locator( 'form' );
		await f.locator( 'input[name=item_name]' ).fill( name );
		await f.locator( 'input[name=item_price]' ).fill( price );
		if ( desc ) { await f.locator( 'input[name=item_description]' ).fill( desc ); }
		await Promise.all( [ o.waitForNavigation(), f.locator( 'button:has-text("Add dish")' ).click() ] );
	};
	await addDish( 'Rice dishes', 'Jollof rice with chicken', '2,500', 'SAMPLE dish' );
	await addDish( 'Rice dishes', 'Fried rice', '2200' );
	await addDish( 'Grills', 'Suya (beef, per portion)', '1500', 'SAMPLE dish' );
	check( await o.locator( '.ek-dish' ).count() === 3, 'Menu has 2 categories and 3 dishes' );
	await Promise.all( [ o.waitForNavigation(), o.locator( '.ek-dish', { hasText: 'Fried rice' } ).locator( 'button:has-text("Sold out")' ).click() ] );
	check( await o.locator( '.ek-dish.is-soldout' ).count() === 1, 'Fried rice marked sold out' );
	await o.screenshot( { path: path.join( SHOTS, 'p4-menu-builder-390.png' ), fullPage: true } );

	await o.goto( dash( 'tables' ) );
	await o.fill( '#t-cap', '8' );
	await o.selectOption( '#t-len', '60' );
	await o.fill( '#t-max', '4' );
	await o.fill( '#t-notice', '1' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save table settings")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0 && await o.locator( '.ek-slotgrid .ek-slot' ).count() > 5, 'Table settings saved; preview shows reservation times' );
	await o.screenshot( { path: path.join( SHOTS, 'p4-table-settings-390.png' ), fullPage: true } );

	/* ---------- 2. Guest ---------- */
	console.log( '2. Guest finds the restaurant, sees the menu, reserves' );
	const gc = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, geolocation: { latitude: parseFloat( lat ) + 0.0003, longitude: parseFloat( lng ) + 0.0003 }, permissions: [ 'geolocation' ] } );
	const g = await gc.newPage();
	g.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await g.goto( BASE + '/restaurants/' );
	await g.selectOption( '#r-cuis', 'grills' );
	await Promise.all( [ g.waitForNavigation(), g.click( '[data-ek-near-me]' ) ] );
	const first = g.locator( '.ek-result' ).first();
	check( ( await first.textContent() ).includes( stamp ) && /m away|km away/.test( await first.textContent() ), 'Near me + "Grills": this restaurant first, with distance' );
	check( ( await first.textContent() ).includes( 'Open now' ), 'Shows "Open now"' );
	await g.screenshot( { path: path.join( SHOTS, 'p4-search-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), first.locator( 'a:has-text("See menu")' ).click() ] );
	check( await g.locator( '.ek-menu-item' ).count() === 3 && await g.locator( '.ek-menu-item.is-soldout' ).count() === 1, 'Restaurant page shows the full menu with the sold-out dish marked' );
	check( await g.locator( '[data-ek-order-form], input[name^="items["]' ).count() === 0, 'No ordering buttons (online ordering is off)' );
	check( await g.locator( 'a:has-text("WhatsApp")' ).count() > 0 && await g.locator( 'a:has-text("Call")' ).count() > 0, 'WhatsApp and Call buttons present' );

	await g.fill( '#rs-date', day( 0 ) );
	await g.fill( '#rs-party', '3' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Find a time")' ) ] );
	await g.screenshot( { path: path.join( SHOTS, 'p4-restaurant-page-360.png' ), fullPage: true } );
	const slot = g.locator( '#reserve a.ek-slot', { hasText: '19:00' } );
	check( await slot.count() === 1, 'Times shown, 19:00 bookable' );
	await Promise.all( [ g.waitForNavigation(), slot.click() ] );
	await g.fill( '#g-name', 'SAMPLE Guest Zainab' );
	await g.fill( '#g-email', `zainab_${ stamp }@example.test` );
	await g.fill( '#g-phone', '0803 000 0041' );
	await g.fill( '#g-notes', 'Birthday (SAMPLE)' );
	await g.screenshot( { path: path.join( SHOTS, 'p4-reserve-form-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Request reservation")' ) ] );
	const code = ( await g.locator( '.ek-code' ).textContent() ).trim();
	check( /^EK-/.test( code ) && ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'waiting for the restaurant' ), `Reservation ${ code } received, waiting for the restaurant` );
	await g.screenshot( { path: path.join( SHOTS, 'p4-confirmation-360.png' ), fullPage: true } );

	/* ---------- 3. Restaurant confirms ---------- */
	console.log( '3. Restaurant confirms' );
	await o.goto( dash( 'bookings' ) );
	const card = o.locator( '.ek-booking', { hasText: code } );
	check( await card.count() === 1 && ( await card.textContent() ).includes( '19:00' ) && ( await card.textContent() ).includes( '3 people' ), 'Reservation listed with time and party size' );
	await Promise.all( [ o.waitForNavigation(), card.locator( 'button:has-text("Confirm")' ).click() ] );
	await o.screenshot( { path: path.join( SHOTS, 'p4-reservations-390.png' ), fullPage: true } );
	await g.reload();
	check( ( await g.locator( '.ek-confirm-head h1' ).textContent() ).includes( 'confirmed' ), 'Guest sees "Your table is confirmed"' );

	/* ---------- 4. Race for the last seats (8 seats, 3 taken, parties of 4) ---------- */
	console.log( '4. Six parties of 4 race for 5 remaining seats at 19:00' );
	const formUrl = `${ BASE }/book/?reserve=${ fx.id }&date=${ day( 0 ) }&time=19:00&party=4`;
	const pages = [];
	for ( let i = 0; i < 6; i++ ) {
		const pg = await ( await browser.newContext() ).newPage();
		await pg.goto( formUrl );
		await pg.fill( '#g-name', `SAMPLE Racer ${ i }` );
		await pg.fill( '#g-email', `r${ i }_${ stamp }@example.test` );
		await pg.fill( '#g-phone', '0803 000 00' + String( 50 + i ) );
		pages.push( pg );
	}
	await Promise.all( pages.map( ( pg ) => Promise.all( [ pg.waitForLoadState( 'load' ), pg.click( 'button:has-text("Request reservation")' ) ] ) ) );
	await new Promise( ( r ) => setTimeout( r, 1500 ) );
	let won = 0, lost = 0;
	for ( const pg of pages ) {
		if ( await pg.locator( '.ek-code' ).count() ) { won++; }
		if ( await pg.locator( 'text=fully booked' ).count() ) { lost++; }
	}
	check( 1 === won && 5 === lost, `Exactly one party of 4 got in (${ won } succeeded, ${ lost } told "fully booked")` );
	const booked = wp( `db query "SELECT booked FROM wp_ek_slots WHERE business_id=${ fx.id } AND slot_at='${ day( 0 ) } 19:00:00'" --skip-column-names` );
	check( '7' === booked, 'Database: 7 of 8 seats taken (3 + 4), never more than 8' );

	/* ---------- 5. Ordering hidden ---------- */
	console.log( '5. Online ordering stays hidden while switched off' );
	await g.goto( `${ BASE }/book/?order=${ fx.id }` );
	check( ( await g.textContent( '.ek' ) ).includes( 'Online ordering is not available' ), 'Order page refuses while ordering is off' );

	/* ---------- 6. Layout ---------- */
	console.log( '6. Layout at 360 / 768 / 1280' );
	const wide = [];
	const pub = new URL( fx.url ).pathname;
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 900 } } );
		const pg = await c.newPage();
		for ( const u of [ '/restaurants/', `${ pub }?date=${ day( 0 ) }&party=2`, `/book/?reserve=${ fx.id }&date=${ day( 0 ) }&time=20:00&party=2` ] ) {
			await pg.goto( BASE + u );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
		const oc2 = await browser.newContext( { viewport: { width: w, height: 900 }, storageState: await oc.storageState() } );
		const op = await oc2.newPage();
		for ( const s of [ 'menu', 'tables', 'bookings', 'restaurant' ] ) {
			await op.goto( dash( s ) );
			const over = await op.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `dash:${ s }@${ w }:${ over }` ); }
		}
		if ( 1280 === w ) { await op.goto( dash( 'menu' ) ); await op.screenshot( { path: path.join( SHOTS, 'p4-menu-builder-1280.png' ), fullPage: true } ); }
		await oc2.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );

	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll restaurant browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
