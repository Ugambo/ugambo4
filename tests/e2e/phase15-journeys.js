/**
 * Phase 15: the 14 journeys from the brief, end to end in a real browser, in payment test mode.
 *
 *  1. Hotel signs up → admin approves → rooms, prices, calendar → appears on the map
 *  2. Guest "Near me" → sorted by distance → 2 nights paid in full → hotel confirms → check-out →
 *     earnings released → payout
 *  3. Two guests try to book the last room for the same night → only one succeeds
 *  4. Pay-at-hotel booking → commission invoice → unpaid invoice pauses the listing (paying resumes it)
 *  5. Restaurant adds a menu → guest reserves → reservation completed → verified review
 *  6. Event centre adds a hall → request → confirmed → deposit paid → event completed → earnings released
 *  7. Guest cancels within policy → refund applied
 *  8. Featured → highlighted pin + top placement → rank number unchanged → plan expires → back to normal
 *  9. One 5★ review does not outrank an established high-rated business
 * 10. Map with 200+ pins on a phone: loads quickly; filters, toggles, clusters and the list all work
 * 11. Ad created → shown in its zone → views and clicks counted
 * 12. Ticket bought → QR code emailed → scanned at check-in (with a simulated camera)
 * 13. Digital guide bought → instant download
 * 14. Online food ordering stays hidden while switched off
 *
 * Time-dependent steps (a stay ending, money holds, invoice due dates, plan expiry) use
 * tests/e2e/fixture-phase15.php to move dates; everything people do is done in the browser.
 *
 * Usage: node tests/e2e/phase15-journeys.js   (after ./setup.sh; uses the SAMPLE data)
 */
const { chromium } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const MAIL = process.env.EK_MAIL || 'http://localhost:8025';
const SHOTS = path.join( __dirname, 'screenshots' );
const FIX = path.join( __dirname, 'fixtures' );
fs.mkdirSync( SHOTS, { recursive: true } );
const ROOT = path.join( __dirname, '..', '..' );
const TMP = fs.mkdtempSync( path.join( require( 'os' ).tmpdir(), 'ek15-' ) );
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );
const wp = ( cmd ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp ${ cmd }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim();
const fx = ( ...a ) => JSON.parse( wp( `eval-file ek-tests/e2e/fixture-phase15.php ${ a.map( ( x ) => `'${ x }'` ).join( ' ' ) }` ).split( '\n' ).pop() );
const json = ( cmd ) => JSON.parse( wp( cmd ).split( '\n' ).pop() );

let failures = 0;
const results = [];
let current = '';
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; results.push( `${ current }: ${ m }` ); } };
const shot = ( pg, name, full = true ) => pg.screenshot( { path: path.join( SHOTS, `p15-${ name }.png` ), fullPage: full } );

// Dates: a Monday about 9 weeks ahead (no clash with the other tests' dates).
const iso = ( d ) => d.toISOString().slice( 0, 10 );
const base = new Date(); base.setUTCHours( 12 ); base.setUTCDate( base.getUTCDate() + 63 + ( ( 8 - base.getUTCDay() ) % 7 ) );
const day = ( n ) => { const d = new Date( base ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); };
const soon = ( n ) => { const d = new Date(); d.setUTCHours( 12 ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); }; // Restaurants take bookings up to 60 days ahead.

/** fetch() that tries again when the local server drops an idle connection. */
const rfetch = async ( url, opt = {}, tries = 4 ) => {
	try {
		return await fetch( url, opt );
	} catch ( e ) {
		if ( tries <= 1 ) {
			throw e;
		}
		await new Promise( ( r ) => setTimeout( r, 500 ) );
		return rfetch( url, opt, tries - 1 );
	}
};
const mails = async ( to ) => {
	const r = await rfetch( `${ MAIL }/api/v1/search?query=${ encodeURIComponent( 'to:"' + to + '"' ) }&limit=50` );
	return r.ok ? ( ( await r.json() ).messages || [] ) : [];
};
const mailHtml = async ( id ) => ( await ( await rfetch( `${ MAIL }/api/v1/message/${ id }` ) ).json() ).HTML || '';

( async () => {
	const stamp = Date.now().toString( 36 );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( `${ current }: ${ e.message }` ) );
	const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
	const phone = ( extra = {} ) => browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, userAgent: UA, ...extra } );
	const login = async ( pg, user, pass, url = '/wp-login.php' ) => {
		await pg.goto( BASE + url );
		await pg.fill( '#user_login', user );
		await pg.fill( '#user_pass', pass );
		await Promise.all( [ pg.waitForNavigation(), pg.click( '#wp-submit' ) ] );
	};
	const testPay = ( pg ) => Promise.all( [ pg.waitForNavigation(), pg.click( 'button:has-text("Pay (test, succeeds)")' ) ] );
	const code = async ( pg ) => ( await pg.locator( '.ek-code' ).first().textContent() ).trim();
	/** Click a booking action button for this code, on whichever bookings tab it is. */
	const act = async ( pg, biz, bcode, label ) => {
		for ( const tab of [ 'action', 'upcoming', 'inhouse', 'past' ] ) {
			await pg.goto( `${ BASE }/business-dashboard/?section=bookings&business=${ biz }&tab=${ tab }` );
			const btn = pg.locator( '.ek-booking', { hasText: bcode } ).locator( `button:has-text("${ label }")` );
			if ( await btn.count() ) {
				await Promise.all( [ pg.waitForNavigation(), btn.first().click() ] );
				return ( await pg.locator( '.ek-notice--ok' ).count() ) > 0;
			}
		}
		return false;
	};

	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const a = await ac.newPage();
	watch( a );
	await login( a, env.EK_ADMIN_USER, env.EK_ADMIN_PASSWORD );

	/* ================= Journey 1 ================= */
	current = 'J1';
	console.log( '1. Hotel signs up → approved → rooms, prices, calendar → on the map' );
	const lat = 12.62 + Math.random() * 0.06;
	const lng = 8.05 + Math.random() * 0.06;
	const owner = { email: `j15-owner-${ stamp }@example.test`, pass: `Kofar Kaura gate ${ stamp }` };
	const hotelName = `SAMPLE Journey Hotel ${ stamp }`;
	const oc = await phone( { geolocation: { latitude: lat, longitude: lng }, permissions: [ 'geolocation' ] } );
	const o = await oc.newPage();
	watch( o );
	await o.goto( BASE + '/list-your-business/' );
	await o.fill( '#ek-name', hotelName );
	await o.selectOption( '#ek-type', 'hotel' );
	await o.selectOption( '#ek-lga', { label: 'Ingawa' } );
	await o.fill( '#ek-description', 'SAMPLE listing created by the Phase 15 journey test. Clean rooms, 24-hour power and parking.' );
	await o.click( '[data-ek-next]' );
	await o.fill( '#ek-address', 'SAMPLE address, Ingawa' );
	await o.click( '[data-ek-locate]' );
	await o.waitForFunction( () => document.getElementById( 'ek-lat' ).value !== '' );
	await o.click( '[data-ek-next]' );
	await o.fill( '#ek-phone', '0803 000 0151' );
	await o.fill( '#ek-whatsapp', '0803 000 0151' );
	await o.fill( '#ek-email', `j15-biz-${ stamp }@example.test` );
	await o.click( '[data-ek-next]' );
	await o.setInputFiles( '#ek-photos', [ path.join( FIX, 'photo-1.jpg' ), path.join( FIX, 'photo-2.jpg' ) ] );
	await o.fill( '#ek-owner', 'SAMPLE Owner Journey' );
	await o.setInputFiles( '#ek-id', path.join( FIX, 'id-sample.png' ) );
	await o.click( '[data-ek-next]' );
	await o.fill( '#ek-bank', 'Test Bank' );
	await o.fill( '#ek-acct', '0123456789' );
	await o.fill( '#ek-acctname', 'SAMPLE OWNER JOURNEY' );
	await o.fill( '#ek-login-email', owner.email );
	await o.fill( '#ek-login-pass', owner.pass );
	await o.check( 'input[name=agreement]' );
	await o.waitForTimeout( 6000 ); // A person takes time to fill the form (the spam check refuses instant submissions).
	await Promise.all( [ o.waitForNavigation(), o.click( '[data-ek-submit]' ) ] );
	const hotel = parseInt( new URL( o.url() ).searchParams.get( 'business' ), 10 );
	if ( ! hotel ) { await shot( o, 'debug-signup' ); console.log( 'Sign-up errors:', ( await o.locator( '.ek-error, .ek-notice--error, .has-error' ).allTextContents() ).join( ' | ' ), o.url() ); }
	check( hotel > 0 && await o.locator( '.ek-pill--pending' ).count() === 1, `Signed up on a phone; waiting for approval (business ${ hotel })` );
	await a.goto( `${ BASE }/wp-admin/admin.php?page=ek-approvals&business=${ hotel }` );
	await Promise.all( [ a.waitForNavigation(), a.click( 'button:has-text("Approve and publish")' ) ] );
	check( await a.locator( '.ek-pill--publish' ).count() === 1, 'Admin approves it' );
	const dash = ( biz, s, extra = '' ) => `${ BASE }/business-dashboard/?section=${ s }&business=${ biz }${ extra }`;
	await o.goto( dash( hotel, 'hotel' ) );
	await o.check( 'input[name=policy][value=moderate]' );
	await o.check( 'input[name=pay_full]' );
	await o.check( 'input[name=pay_at_venue]' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save hotel details")' ) ] );
	const addRoom = async ( name, price, units, guests ) => {
		await o.goto( dash( hotel, 'rooms', '&room=new' ) );
		await o.fill( '#r-name', name );
		await o.fill( '#r-units', String( units ) );
		await o.fill( '#r-price', price );
		await o.fill( '#r-guests', String( guests ) );
		await o.selectOption( '#r-bed', 'double' );
		await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Save room category")' ) ] );
	};
	await addRoom( 'Standard', '18,000', 3, 2 );
	await addRoom( 'Executive', '45,000', 1, 2 );
	check( await o.locator( '.ek-roomcard' ).count() === 2, 'Two room categories with prices (₦18,000 × 3 rooms, ₦45,000 × 1 room)' );
	await o.goto( dash( hotel, 'calendar' ) );
	await o.click( 'a.ek-pill:has-text("Standard")' );
	await o.fill( '#s-label', 'SAMPLE festival week' );
	await o.fill( '#s-from', day( 20 ) );
	await o.fill( '#s-to', day( 22 ) );
	await o.fill( '#s-price', '25000' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Add seasonal price")' ) ] );
	await o.fill( '#c-from', day( 25 ) );
	await o.fill( '#c-to', day( 25 ) );
	await o.selectOption( '#c-op', 'close' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Apply")' ) ] );
	check( await o.locator( '.ek-rules li' ).count() === 1 && await o.locator( '.ek-notice--ok' ).count() > 0, 'Calendar: a seasonal price and a closed date' );
	await shot( o, 'j1-calendar-360' );
	const pins = await ( await rfetch( `${ BASE }/wp-json/ek/v1/map?bbox=${ lat - 0.1 },${ lng - 0.1 },${ lat + 0.1 },${ lng + 0.1 }&types=hotel` ) ).json();
	const pin = pins.pins.find( ( p ) => p.id === hotel );
	check( pin && /₦18,000/.test( pin.price || '' ), 'The hotel is on the Katsina Map with its price' );
	const mp = await ( await browser.newContext( { viewport: { width: 1280, height: 800 } } ) ).newPage();
	watch( mp );
	await mp.goto( `${ BASE }/map/?focus=${ hotel }` );
	await mp.waitForSelector( '.ek-kcard', { timeout: 15000 } );
	check( ( await mp.locator( '.ek-kcard' ).textContent() ).includes( hotelName ), 'Opening the map on it shows its card' );
	await shot( mp, 'j1-on-map-1280', false );

	/* ================= Journey 2 ================= */
	current = 'J2';
	console.log( '2. Near me → books 2 nights, paid in full → confirmed → check-out → released → payout' );
	const gc = await phone( { geolocation: { latitude: lat + 0.0004, longitude: lng + 0.0003 }, permissions: [ 'geolocation' ] } );
	const g = await gc.newPage();
	watch( g );
	await g.goto( BASE + '/hotels/' );
	await g.fill( '#s-in', day( 0 ) );
	await g.fill( '#s-out', day( 2 ) );
	await Promise.all( [ g.waitForNavigation(), g.click( '[data-ek-near-me]' ) ] );
	const first = g.locator( '.ek-result' ).first();
	check( /sort=distance/.test( g.url() ) && ( await first.textContent() ).includes( hotelName ) && /m away|km away/.test( await first.textContent() ), '"Near me": sorted by distance, this hotel first' );
	await Promise.all( [ g.waitForNavigation(), first.locator( 'a:has-text("See rooms")' ).click() ] );
	await Promise.all( [ g.waitForNavigation(), g.locator( '.ek-room', { hasText: 'Standard' } ).locator( 'a:has-text("Book now")' ).click() ] );
	const guestMail = `j15-guest-${ stamp }@example.test`;
	await g.fill( '#g-name', 'SAMPLE Guest Maryam' );
	await g.fill( '#g-email', guestMail );
	await g.fill( '#g-phone', '0803 000 0152' );
	await g.check( 'input[name=payment][value=full]' );
	await g.check( 'input[name=agree]' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Confirm booking")' ) ] );
	await testPay( g );
	const c2 = await code( g );
	const c2url = g.url();
	check( /₦36,000/.test( await g.locator( 'main' ).textContent() ), `2 nights paid in full: ₦36,000 (${ c2 })` );
	check( await act( o, hotel, c2, 'Confirm' ), 'Hotel confirms' );
	fx( 'shift', c2, -3 );
	check( await act( o, hotel, c2, 'Mark checked in' ), 'Guest arrives: checked in' );
	check( await act( o, hotel, c2, 'Mark checked out' ), 'Guest leaves: checked out' );
	await o.goto( dash( hotel, 'earnings' ) );
	check( /On hold/i.test( await o.locator( 'main' ).textContent() ) && /₦32,400/.test( await o.locator( 'main' ).textContent() ), 'Earnings ₦32,400 (₦36,000 − 10%) on hold for 3 days after check-out' );
	fx( 'release-booking', c2 );
	await o.goto( dash( hotel, 'earnings' ) );
	check( /₦32,400/.test( await o.locator( '.ek-stat--accent' ).textContent() ), 'After 3 days: ₦32,400 available' );
	await o.goto( dash( hotel, 'payouts' ) );
	await o.fill( '#ek-amount', '32,400' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Request payout")' ) ] );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-payouts' );
	const prow = () => a.locator( 'tr', { hasText: stamp } ).first();
	await Promise.all( [ a.waitForNavigation(), prow().locator( 'button:has-text("Approve")' ).click() ] );
	await prow().locator( 'input[name=reference]' ).fill( `SAMPLE-TRF-${ stamp }` );
	await Promise.all( [ a.waitForNavigation(), prow().locator( 'button:has-text("Mark paid")' ).click() ] );
	await o.goto( dash( hotel, 'payouts' ) );
	check( ( await o.locator( 'main' ).textContent() ).includes( `SAMPLE-TRF-${ stamp }` ) && /Paid/.test( await o.locator( 'main' ).textContent() ), 'Payout requested, approved and paid (reference shown to the hotel)' );
	await shot( o, 'j2-payout-paid-360' );
	const ownerSubjects = ( await mails( owner.email ) ).map( ( m ) => m.Subject ).join( ' | ' );
	check( /booking/i.test( ownerSubjects ) && /available for payout/i.test( ownerSubjects ) && /Payout of .* (sent|approved)/i.test( ownerSubjects ), 'Hotel emails: new booking, money released, payout' );
	check( ( await mails( guestMail ) ).length >= 2, 'Guest emails: booking received and confirmed' );

	/* ================= Journey 3 ================= */
	current = 'J3';
	console.log( '3. Two guests try to book the last room for the same night' );
	const exec = parseInt( wp( `post list --post_type=ek_room --post_parent=${ hotel } --s=Executive --field=ID` ), 10 );
	const racers = [];
	for ( let i = 0; i < 2; i++ ) {
		const pg = await ( await browser.newContext() ).newPage();
		await pg.goto( `${ BASE }/book/?room=${ exec }&checkin=${ day( 3 ) }&checkout=${ day( 4 ) }&guests=2&rooms=1` );
		await pg.fill( '#g-name', `SAMPLE Racer ${ i }` );
		await pg.fill( '#g-email', `j15-racer${ i }-${ stamp }@example.test` );
		await pg.fill( '#g-phone', '0803 000 016' + i );
		await pg.check( 'input[name=payment][value=venue]' );
		await pg.check( 'input[name=agree]' );
		racers.push( pg );
	}
	await Promise.all( racers.map( ( pg ) => Promise.all( [ pg.waitForLoadState( 'load' ), pg.click( 'button:has-text("Confirm booking")' ) ] ) ) );
	await new Promise( ( r ) => setTimeout( r, 1200 ) );
	let won = 0;
	let told = 0;
	for ( const pg of racers ) {
		won += ( await pg.locator( '.ek-code' ).count() ) ? 1 : 0;
		told += ( await pg.locator( 'text=just booked by someone else' ).count() ) ? 1 : 0;
	}
	check( 1 === won && 1 === told, `Only one succeeds (${ won } booked, ${ told } told "just booked by someone else")` );
	for ( const pg of racers ) { if ( await pg.locator( 'text=just booked by someone else' ).count() ) { await shot( pg, 'j3-sold-out-1280' ); } }

	/* ================= Journey 4 ================= */
	current = 'J4';
	console.log( '4. Pay at the hotel → commission invoice → unpaid invoice pauses the listing' );
	const g4 = await ( await phone() ).newPage();
	watch( g4 );
	await g4.goto( `${ BASE }/book/?room=${ parseInt( wp( `post list --post_type=ek_room --post_parent=${ hotel } --s=Standard --field=ID` ), 10 ) }&checkin=${ day( 6 ) }&checkout=${ day( 7 ) }&guests=2&rooms=1` );
	await g4.fill( '#g-name', 'SAMPLE Guest Sani' );
	await g4.fill( '#g-email', `j15-sani-${ stamp }@example.test` );
	await g4.fill( '#g-phone', '0803 000 0154' );
	await g4.check( 'input[name=payment][value=venue]' );
	await g4.check( 'input[name=agree]' );
	await Promise.all( [ g4.waitForNavigation(), g4.click( 'button:has-text("Confirm booking")' ) ] );
	const c4 = await code( g4 );
	check( /pay.*(at|on arrival)|at the hotel/i.test( await g4.locator( 'main' ).textContent() ), `Booked to pay at the hotel (${ c4 })` );
	await act( o, hotel, c4, 'Confirm' );
	fx( 'shift', c4, -2 );
	await act( o, hotel, c4, 'Mark checked in' );
	await act( o, hotel, c4, 'Mark checked out' );
	const month = fx( 'invoice-month', c4 ).month;
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-invoices' );
	await a.fill( 'input[name=month]', month );
	await Promise.all( [ a.waitForNavigation(), a.click( 'button:has-text("Create")' ) ] );
	check( ( await a.locator( 'tr', { hasText: hotelName } ).first().textContent() ).includes( '₦1,800' ), `Monthly invoice for ${ month }: 10% of ₦18,000 = ₦1,800` );
	await o.goto( dash( hotel, 'invoices' ) );
	check( ( await o.locator( '.ek-invoice' ).first().textContent() ).includes( '₦1,800' ), 'The hotel sees the invoice in its dashboard' );
	const paused = fx( 'invoice-due', hotel );
	const pub = await rfetch( pin.url, { redirect: 'manual' } );
	check( 'ek_paused' === paused.status && 404 === pub.status, 'Unpaid past the due date: listing paused and hidden from visitors' );
	const pins4 = await ( await rfetch( `${ BASE }/wp-json/ek/v1/map?bbox=${ lat - 0.1 },${ lng - 0.1 },${ lat + 0.1 },${ lng + 0.1 }&types=hotel` ) ).json();
	check( ! pins4.pins.some( ( p ) => p.id === hotel ), 'Paused listing is off the map' );
	await o.goto( dash( hotel, 'invoices' ) );
	check( /paused/i.test( await o.locator( '.ek-notice--warn' ).first().textContent() ), 'The owner is told why' );
	await shot( o, 'j4-paused-360' );
	await o.click( '.ek-invoice summary' ).catch( () => {} );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Pay online (test, succeeds)")' ) ] );
	const back = await rfetch( pin.url, { redirect: 'manual' } );
	check( 200 === back.status, 'Invoice paid online → listing live again' );
	const s4 = ( await mails( owner.email ) ).map( ( mm ) => mm.Subject ).join( ' | ' );
	check( /Invoice/i.test( s4 ) && /paused/i.test( s4 ), 'Hotel emails: invoice, listing paused, and it is live again' );

	/* ================= Journey 5 ================= */
	current = 'J5';
	console.log( '5. Restaurant adds a menu → guest reserves → completed → verified review' );
	const rx = json( `eval-file ek-tests/e2e/fixture-hotel.php r${ stamp } ${ ( 12.95 + Math.random() * 0.08 ).toFixed( 5 ) } ${ ( 7.56 + Math.random() * 0.08 ).toFixed( 5 ) } restaurant` );
	const rc = await ( await phone() ).newPage();
	watch( rc );
	await login( rc, rx.user, rx.pass, '/business-dashboard/' );
	await rc.goto( dash( rx.id, 'restaurant' ) );
	await rc.check( 'input[name="cuisines[]"][value="hausa"]' );
	await Promise.all( [ rc.waitForNavigation(), rc.click( 'button:has-text("Save restaurant details")' ) ] );
	await rc.goto( dash( rx.id, 'menu' ) );
	await rc.fill( '#m-cat', 'Swallow & soups' );
	await Promise.all( [ rc.waitForNavigation(), rc.click( 'button:has-text("Add category")' ) ] );
	for ( const [ n, p ] of [ [ 'Tuwo shinkafa with miyan kuka', '1,500' ], [ 'Fura da nono', '800' ] ] ) {
		const det = rc.locator( '.ek-menucat', { hasText: 'Swallow & soups' } ).locator( 'details.ek-add-dish' );
		if ( null === await det.getAttribute( 'open' ) ) { await det.locator( 'summary' ).click(); }
		await det.locator( 'input[name=item_name]' ).fill( n );
		await det.locator( 'input[name=item_price]' ).fill( p );
		await Promise.all( [ rc.waitForNavigation(), det.locator( 'button:has-text("Add dish")' ).click() ] );
	}
	check( await rc.locator( '.ek-dish' ).count() === 2, 'Menu: a category with 2 dishes' );
	await rc.goto( dash( rx.id, 'tables' ) );
	await rc.fill( '#t-cap', '12' );
	await rc.fill( '#t-notice', '1' );
	await Promise.all( [ rc.waitForNavigation(), rc.click( 'button:has-text("Save table settings")' ) ] );
	const g5 = await ( await phone() ).newPage();
	watch( g5 );
	await g5.goto( rx.url );
	check( ( await g5.locator( 'main' ).textContent() ).includes( 'Tuwo shinkafa' ), 'Guest sees the menu on the restaurant page' );
	await g5.fill( '#rs-date', soon( 9 ) );
	await g5.fill( '#rs-party', '2' );
	await Promise.all( [ g5.waitForNavigation(), g5.click( 'button:has-text("Find a time")' ) ] );
	await Promise.all( [ g5.waitForNavigation(), g5.locator( '#reserve a.ek-slot', { hasText: '19:00' } ).click() ] );
	await g5.fill( '#g-name', 'SAMPLE Guest Hadiza' );
	await g5.fill( '#g-email', `j15-hadiza-${ stamp }@example.test` );
	await g5.fill( '#g-phone', '0803 000 0155' );
	await Promise.all( [ g5.waitForNavigation(), g5.click( 'button:has-text("Request reservation")' ) ] );
	const c5 = await code( g5 );
	const c5url = g5.url();
	check( await act( rc, rx.id, c5, 'Confirm' ), `Restaurant confirms reservation ${ c5 }` );
	fx( 'shift', c5, 0 );
	check( await act( rc, rx.id, c5, 'Mark seated' ), 'Guests seated on the day' );
	check( await act( rc, rx.id, c5, 'Mark completed' ), 'Reservation completed' );
	await g5.goto( c5url );
	await g5.click( 'label[for=ro-5]' );
	await g5.fill( '#rv-title', 'Excellent tuwo' );
	await g5.fill( '#rv-body', 'SAMPLE review: warm welcome and very tasty miyan kuka. Quick service.' );
	await Promise.all( [ g5.waitForNavigation(), g5.click( 'button:has-text("Publish review")' ) ] );
	await g5.goto( rx.url );
	const rv = await g5.locator( '#reviews' ).textContent();
	check( rv.includes( 'Excellent tuwo' ) && rv.includes( 'Verified booking' ), 'The review shows on the restaurant page as "Verified booking"' );
	await g5.locator( '#reviews' ).scrollIntoViewIfNeeded();
	await shot( g5, 'j5-verified-review-360' );

	/* ================= Journey 6 ================= */
	current = 'J6';
	console.log( '6. Event centre: hall → request → confirmed → deposit → completed → released' );
	const vx = json( `eval-file ek-tests/e2e/fixture-hotel.php v${ stamp } ${ ( 12.95 + Math.random() * 0.08 ).toFixed( 5 ) } ${ ( 7.56 + Math.random() * 0.08 ).toFixed( 5 ) } event-centre` );
	const vc = await ( await phone() ).newPage();
	watch( vc );
	await login( vc, vx.user, vx.pass, '/business-dashboard/' );
	await vc.goto( dash( vx.id, 'venue' ) );
	await vc.check( 'input[name=booking_mode][value=request]' );
	await vc.fill( '#v-dep', '30' );
	await Promise.all( [ vc.waitForNavigation(), vc.click( 'button:has-text("Save venue details")' ) ] );
	await vc.goto( dash( vx.id, 'halls', '&hall=new' ) );
	await vc.fill( '#h-name', 'Grand Hall' );
	await vc.fill( '#h-seat', '400' );
	await vc.fill( '#h-stand', '600' );
	await vc.fill( '#h-price', '350,000' );
	await vc.selectOption( '#h-set', 'indoor' );
	await Promise.all( [ vc.waitForNavigation(), vc.click( 'button:has-text("Save hall")' ) ] );
	check( await vc.locator( '.ek-roomcard' ).count() === 1, 'Hall added (400 seated, ₦350,000)' );
	const g6 = await ( await phone() ).newPage();
	watch( g6 );
	await g6.goto( `${ vx.url }?date=${ day( 2 ) }&guests=300` );
	await Promise.all( [ g6.waitForNavigation(), g6.click( '#halls a:has-text("Request to book")' ) ] );
	await g6.fill( '#g-name', 'SAMPLE Host Aisha' );
	await g6.fill( '#g-email', `j15-aisha-${ stamp }@example.test` );
	await g6.fill( '#g-phone', '0803 000 0156' );
	await Promise.all( [ g6.waitForNavigation(), g6.click( 'button:has-text("Send booking request")' ) ] );
	const c6 = await code( g6 );
	const c6url = g6.url();
	check( await act( vc, vx.id, c6, 'Accept request' ), `Event centre accepts request ${ c6 }` );
	await g6.goto( c6url );
	await Promise.all( [ g6.waitForNavigation(), g6.click( 'a:has-text("deposit")' ) ] );
	await testPay( g6 );
	check( /secured/i.test( await g6.locator( '.ek-confirm-head h1' ).textContent() ), 'Guest pays the 30% deposit (₦105,000): date secured' );
	fx( 'shift', c6, -1 );
	check( await act( vc, vx.id, c6, 'Mark event completed' ), 'Event completed' );
	fx( 'release-booking', c6 );
	await vc.goto( dash( vx.id, 'earnings' ) );
	check( /₦94,500/.test( await vc.locator( '.ek-stat--accent' ).textContent() ), 'Earnings released: ₦94,500 available (₦105,000 − 10%)' );
	await shot( vc, 'j6-earnings-360' );

	/* ================= Journey 7 ================= */
	current = 'J7';
	console.log( '7. Guest cancels within the policy → refund' );
	const g7 = await ( await phone() ).newPage();
	watch( g7 );
	await g7.goto( `${ pin.url }?checkin=${ day( 14 ) }&checkout=${ day( 16 ) }` );
	await Promise.all( [ g7.waitForNavigation(), g7.locator( '.ek-room', { hasText: 'Standard' } ).locator( 'a:has-text("Book now")' ).click() ] );
	const g7mail = `j15-bello-${ stamp }@example.test`;
	await g7.fill( '#g-name', 'SAMPLE Guest Bello' );
	await g7.fill( '#g-email', g7mail );
	await g7.fill( '#g-phone', '0803 000 0157' );
	await g7.check( 'input[name=payment][value=full]' );
	await g7.check( 'input[name=agree]' );
	await Promise.all( [ g7.waitForNavigation(), g7.click( 'button:has-text("Confirm booking")' ) ] );
	await testPay( g7 );
	const c7 = await code( g7 );
	check( /₦36,000 of the ₦36,000/.test( await g7.locator( '#cx-h' ).locator( '..' ).textContent() ), 'Cancel section explains: ₦36,000 of ₦36,000 back (more than 5 days ahead, moderate policy)' );
	await g7.click( 'summary:has-text("Cancel this booking")' );
	await Promise.all( [ g7.waitForNavigation(), g7.click( 'button:has-text("Yes, cancel it")' ) ] );
	const after7 = await g7.locator( 'main' ).textContent();
	check( /cancelled/i.test( await g7.locator( '.ek-confirm-head' ).textContent() ) && /₦36,000/.test( after7 ) && /refund/i.test( after7 ), 'Cancelled; refund of ₦36,000 shown' );
	const refund = wp( `db query "SELECT r.amount_kobo FROM wp_ek_refunds r JOIN wp_ek_bookings b ON b.id = r.booking_id WHERE b.code='${ c7 }'" --skip-column-names` );
	check( '3600000' === refund.trim(), 'Refund of ₦36,000 recorded' );
	await shot( g7, 'j7-cancelled-refund-360' );
	check( ( await mails( g7mail ) ).some( ( m ) => /cancel/i.test( m.Subject ) ), 'Guest email: cancellation and refund' );

	/* ================= Journey 8 ================= */
	current = 'J8';
	console.log( '8. Featured → highlighted pin, top placement → rank unchanged → expires → normal' );
	const fo = fx( 'owner', 'SAMPLE Savanna Rest Inn' );
	const rankOf = async ( pg ) => { await pg.goto( fo.url ); return ( await pg.locator( '.ek-rankline' ).first().textContent() ).replace( /\s+/g, ' ' ).replace( /Featured/g, '' ).trim(); };
	const desk = await ( await browser.newContext( { viewport: { width: 1280, height: 900 }, userAgent: UA } ) ).newPage();
	watch( desk );
	const rankBefore = await rankOf( desk );
	const isFeaturedPin = async () => ( await ( await rfetch( `${ BASE }/wp-json/ek/v1/map?bbox=11,6,14,9&types=hotel` ) ).json() ).pins.find( ( p ) => p.id === fo.id ).featured;
	check( ! await isFeaturedPin(), `Before: ordinary pin; rank "${ rankBefore }"` );
	const f8 = await ( await phone() ).newPage();
	watch( f8 );
	await login( f8, fo.user, fo.pass, '/business-dashboard/' );
	await f8.goto( dash( fo.id, 'plan' ) );
	await Promise.all( [ f8.waitForNavigation(), f8.locator( '.ek-plan', { hasText: 'Featured' } ).first().locator( 'button:has-text("1 month")' ).click() ] );
	await testPay( f8 );
	check( /Featured/.test( await f8.locator( '#pl-h' ).locator( '..' ).textContent() ), 'Bought Featured for 1 month (test payment)' );
	check( await isFeaturedPin(), 'Map: highlighted (Featured) pin' );
	await desk.goto( BASE + '/hotels/' );
	const top3 = ( await desk.locator( '.ek-result' ).allTextContents() ).slice( 0, 3 );
	check( top3.some( ( t ) => t.includes( 'Savanna Rest Inn' ) && t.includes( 'Featured' ) ), 'Hotel search: in the top places, marked "Featured"' );
	await shot( desk, 'j8-featured-top-1280', false );
	check( await rankOf( desk ) === rankBefore, `Rank number unchanged ("${ rankBefore }")` );
	fx( 'expire-plan', fo.id );
	wp( `eval 'EK\\Integrations::clear_page_cache();'` );
	check( ! await isFeaturedPin(), 'Plan ended: ordinary pin again' );
	await desk.goto( BASE + '/hotels/' );
	const card8 = await desk.locator( '.ek-result', { hasText: 'Savanna Rest Inn' } ).first().textContent();
	check( ! card8.includes( 'Featured' ) && await rankOf( desk ) === rankBefore, 'No "Featured" mark; rank still the same' );

	/* ================= Journey 9 ================= */
	current = 'J9';
	console.log( '9. One 5★ review does not outrank an established high-rated business' );
	const r9 = fx( 'ranking', stamp, ( 12.7 + Math.random() * 0.05 ).toFixed( 5 ), ( 7.3 + Math.random() * 0.05 ).toFixed( 5 ) );
	check( 5 === r9.new_avg && r9.old_avg < 5 && r9.old_rank && r9.old_rank.rank_state && ! ( r9.new_rank && r9.new_rank.rank_state ), `Newcomer 5.0★ from 1 review is not ranked; the established ${ r9.old_avg }★ hotel is` );
	const top = await ( await browser.newContext() ).newPage();
	await top.goto( `${ BASE }/top-hotels/${ r9.lga }/` );
	const list = await top.locator( '.ek-top-list' ).textContent();
	check( list.includes( `Established Lodge ${ stamp }` ) && ! list.includes( `Newcomer Inn ${ stamp }` ), 'LGA Top 10: the established hotel is listed, the newcomer is not above it' );
	await top.goto( r9.new_url );
	check( /New, not yet ranked/.test( await top.locator( '.ek-rankline' ).first().textContent() ), 'Newcomer page: "New, not yet ranked"' );
	await shot( top, 'j9-newcomer-1280', false );

	/* ================= Journey 10 ================= */
	current = 'J10';
	console.log( '10. Map with 200+ pins on a phone' );
	const have = ( await ( await rfetch( `${ BASE }/wp-json/ek/v1/map?bbox=10.5,6.5,13.6,8.8` ) ).json() ).count;
	const made = fx( 'pins', Math.max( 0, 215 - have ), stamp );
	const all = await ( await rfetch( `${ BASE }/wp-json/ek/v1/map?bbox=10.5,6.5,13.6,8.8` ) ).json();
	check( all.pins.length >= 200, `${ all.pins.length } pins on the map (${ made.made } test pins added)` );
	const mc = await browser.newContext( { viewport: { width: 360, height: 740 }, deviceScaleFactor: 2, userAgent: UA, isMobile: true, hasTouch: true } );
	const m = await mc.newPage();
	watch( m );
	const cdp = await mc.newCDPSession( m );
	await cdp.send( 'Network.enable' );
	await cdp.send( 'Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 } );
	await cdp.send( 'Emulation.setCPUThrottlingRate', { rate: 4 } );
	const t0 = Date.now();
	await m.goto( `${ BASE }/map/` );
	await m.waitForSelector( '.ek-kcluster, .ek-kpin', { timeout: 30000 } );
	const loadMs = Date.now() - t0;
	check( loadMs < 8000, `Pins visible ${ ( loadMs / 1000 ).toFixed( 1 ) } s after opening, on a slow phone (4× slower processor, slow 4G)` );
	await cdp.send( 'Emulation.setCPUThrottlingRate', { rate: 1 } );
	await cdp.send( 'Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 } );
	check( await m.locator( '.ek-kcluster' ).count() >= 1, 'Pins grouped into numbered clusters' );
	await shot( m, 'j10-map-200-pins-360', false );
	await m.click( '[data-sheet-toggle]' );
	await m.waitForTimeout( 800 );
	const before10 = await m.locator( '.ek-kitem' ).count();
	await m.locator( '.ek-kmap-chip:has-text("Hotels")' ).click();
	await m.waitForTimeout( 1000 );
	const typesAfter = await m.locator( '.ek-kitem' ).evaluateAll( ( els ) => els.map( ( e ) => e.textContent ) );
	check( before10 > 0 && ! typesAfter.some( ( t ) => /Hotel \/ Guest House/.test( t ) ), 'Switching "Hotels" off removes hotels from the list (list follows the map)' );
	await m.locator( '.ek-kmap-chip:has-text("Hotels")' ).click();
	await m.waitForTimeout( 800 );
	await m.locator( '.ek-kitem' ).first().click();
	await m.waitForSelector( '.ek-kcard', { timeout: 10000 } );
	check( await m.locator( '.ek-kcard' ).count() === 1, 'Tapping a list item opens its card' );
	fx( 'cleanup', stamp );

	/* ================= Journey 11 ================= */
	current = 'J11';
	console.log( '11. Ad created → shown in its zone → views and clicks counted' );
	fx( 'ads-off' );
	const img = wp( `post list --post_type=attachment --post_mime_type=image --posts_per_page=1 --field=ID` ).split( '\n' ).pop();
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-ads' );
	await a.fill( '#ad-title', `SAMPLE Journey Banner ${ stamp }` );
	await a.fill( '#ad-adv', 'SAMPLE Advertiser' );
	await a.selectOption( '#ad-zone', 'search' );
	await a.evaluate( ( id ) => { document.getElementById( 'ad-img' ).value = id; }, img );
	await a.fill( '#ad-alt', 'SAMPLE advert' );
	await a.fill( '#ad-url', 'https://example.com/journey-ad' );
	await Promise.all( [ a.waitForNavigation(), a.click( 'input[type=submit][value="Add ad"]' ) ] );
	const v11 = await ( await phone() ).newPage();
	watch( v11 );
	await v11.goto( BASE + '/restaurants/' );
	await v11.goto( BASE + '/hotels/' );
	check( await v11.locator( '.ek-ad--search img' ).count() === 1 && /Advertisement/.test( await v11.locator( '.ek-ad--search' ).textContent() ), 'The banner shows in the search zone, labelled "Advertisement"' );
	const href = await v11.locator( '.ek-ad--search a' ).getAttribute( 'href' );
	const go = await v11.request.get( href, { maxRedirects: 0 } );
	check( 302 === go.status() && 'https://example.com/journey-ad' === go.headers().location, 'A click goes to the advertiser' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-ads' );
	const row = ( await a.locator( 'tr', { hasText: `Journey Banner ${ stamp }` } ).first().locator( 'td' ).allTextContents() ).map( ( t ) => t.trim() );
	check( parseInt( row[ 3 ], 10 ) >= 2 && 1 === parseInt( row[ 4 ], 10 ), `Counted: ${ row[ 3 ] } views, ${ row[ 4 ] } click` );
	await shot( a, 'j11-ads-counted-1280', false );
	fx( 'ads-restore' );

	/* ================= Journey 12 ================= */
	current = 'J12';
	console.log( '12. Ticket bought → QR code emailed → scanned at check-in' );
	const ev = fx( 'event', stamp );
	const g12 = await ( await phone() ).newPage();
	watch( g12 );
	const tkMail = `j15-tickets-${ stamp }@example.test`;
	await g12.goto( ev.url );
	await g12.locator( 'select[name^="qty"]' ).first().selectOption( '2' );
	await g12.fill( '#tk-name', 'SAMPLE Zainab Garba' );
	await g12.fill( '#tk-email', tkMail );
	await g12.fill( '#tk-phone', '0803 000 0158' );
	await Promise.all( [ g12.waitForNavigation(), g12.click( '#tickets button:has-text("Get tickets")' ) ] );
	await testPay( g12 );
	await g12.waitForSelector( '.ek-ticket-qr svg' );
	const tcodes = await g12.locator( '.ek-ticket-qr' ).evaluateAll( ( els ) => els.map( ( e ) => e.getAttribute( 'data-ek-qr' ) ) );
	check( 2 === tcodes.length, `2 tickets with QR codes on the receipt (${ tcodes.join( ', ' ) })` );
	let receipt = null;
	for ( let i = 0; i < 10 && ! receipt; i++ ) {
		receipt = ( await mails( tkMail ) ).find( ( mm ) => /Receipt/i.test( mm.Subject ) );
		if ( ! receipt ) { await new Promise( ( r ) => setTimeout( r, 500 ) ); }
	}
	const html = receipt ? await mailHtml( receipt.ID ) : '';
	check( 2 === ( html.match( /class="ek-qr"/g ) || [] ).length && tcodes.every( ( c ) => html.includes( c ) ), 'The receipt email carries both QR codes' );
	// Show the emailed QR code to a phone camera at the gate.
	const ep = await ( await browser.newContext( { viewport: { width: 600, height: 900 } } ) ).newPage();
	await ep.setContent( html );
	await shot( ep, 'j12-ticket-email-600' );
	const qrPng = path.join( TMP, 'qr.png' );
	await ep.locator( 'table.ek-qr' ).first().screenshot( { path: qrPng } );
	const y4m = path.join( TMP, 'qr.y4m' );
	execSync( `python3 "${ path.join( __dirname, 'png-to-y4m.py' ) }" "${ qrPng }" "${ y4m }"` );
	const cam = await chromium.launch( { args: [ '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${ y4m }` ] } );
	const sc = await cam.newContext( { viewport: { width: 390, height: 844 }, permissions: [ 'camera' ] } );
	const s = await sc.newPage();
	await login( s, ev.staff, ev.staff_pass, '/check-in/' );
	await s.selectOption( '[data-event]', String( ev.event ) );
	await s.click( '[data-start]' );
	await s.waitForSelector( '.ek-ci-result.is-ok, .ek-ci-result.is-already, .ek-ci-result.is-invalid', { timeout: 20000 } ).catch( () => {} );
	const res = ( await s.locator( '[data-result]' ).textContent().catch( () => '' ) ) || '';
	check( /Welcome/.test( res ), 'Staff phone camera scans the emailed QR code: "Welcome!" (ticket checked in)' );
	await shot( s, 'j12-camera-checkin-390' );
	await cam.close();
	const used = wp( `db query "SELECT COUNT(*) FROM wp_ek_tickets WHERE code='${ tcodes[ 0 ] }' AND checked_in_at IS NOT NULL" --skip-column-names` );
	check( '1' === used.trim(), 'Ticket marked as used (cannot be used twice)' );

	/* ================= Journey 13 ================= */
	current = 'J13';
	console.log( '13. Digital guide bought → instant download' );
	const g13 = await ( await phone() ).newPage();
	watch( g13 );
	const shopMail = `j15-shop-${ stamp }@example.test`;
	await g13.goto( BASE + '/product/sample-katsina-pocket-guide-pdf/' );
	await Promise.all( [ g13.waitForLoadState(), g13.click( '.single_add_to_cart_button' ) ] );
	await g13.goto( BASE + '/checkout/' );
	await g13.waitForSelector( '#billing-first_name', { timeout: 20000 } );
	await g13.fill( '#email', shopMail );
	await g13.fill( '#billing-first_name', 'SAMPLE' );
	await g13.fill( '#billing-last_name', 'Buyer' );
	await g13.fill( '#billing-address_1', 'SAMPLE address' );
	await g13.fill( '#billing-city', 'Katsina' );
	if ( await g13.locator( '#billing-phone' ).count() ) { await g13.fill( '#billing-phone', '08030000159' ); }
	await g13.check( '#radio-control-wc-payment-method-options-ek_test' ).catch( () => {} );
	await shot( g13, 'j13-checkout-360' );
	await Promise.all( [ g13.waitForURL( /order-received|receipt|thank/i, { timeout: 30000 } ), g13.click( '.wc-block-components-checkout-place-order-button' ) ] );
	const dl = g13.locator( 'a[href*="download_file="]' ).first();
	check( await dl.count() === 1, 'Order received: download link shown straight away' );
	const file = await g13.request.get( await dl.getAttribute( 'href' ) );
	const body = await file.body();
	check( file.ok() && body.slice( 0, 4 ).toString() === '%PDF', `The guide downloads (PDF, ${ Math.round( body.length / 1024 ) } KB)` );
	await shot( g13, 'j13-download-360' );
	check( ( await mails( shopMail ) ).length >= 1, 'Buyer gets an order email' );

	/* ================= Journey 14 ================= */
	current = 'J14';
	console.log( '14. Online food ordering stays hidden while switched off' );
	const g14 = await ( await phone() ).newPage();
	await g14.goto( rx.url );
	check( await g14.locator( '[data-ek-order-form], input[name^="items["], a:has-text("Order food"), button:has-text("Order")' ).count() === 0, 'Restaurant page: no ordering buttons' );
	await rc.goto( dash( rx.id, 'overview' ) );
	check( await rc.locator( '.ek-app-tabs a:has-text("Online orders")' ).count() === 0, 'Restaurant dashboard: no "Online orders" section' );
	const before14 = wp( `db query "SELECT COUNT(*) FROM wp_ek_bookings WHERE kind='order' AND business_id=${ rx.id }" --skip-column-names` ).trim();
	await g14.goto( rx.url );
	await g14.evaluate( ( id ) => { const f = document.createElement( 'form' ); f.method = 'post'; f.innerHTML = `<input name="ek_action" value="place_order"><input name="business_id" value="${ id }"><input name="items[1]" value="2">`; document.body.appendChild( f ); f.submit(); }, rx.id );
	await g14.waitForLoadState();
	const after14 = wp( `db query "SELECT COUNT(*) FROM wp_ek_bookings WHERE kind='order' AND business_id=${ rx.id }" --skip-column-names` ).trim();
	check( before14 === after14, 'A hand-made order form is refused (no order created)' );

	/* ================= Layout of the dashboards used ================= */
	current = 'layout';
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		for ( const [ ctx, biz, secs ] of [ [ oc, hotel, [ 'overview', 'bookings', 'rooms', 'calendar', 'earnings', 'payouts', 'invoices', 'plan', 'reviews', 'analytics' ] ], [ rc.context(), rx.id, [ 'menu', 'tables', 'bookings' ] ], [ vc.context(), vx.id, [ 'halls', 'venue', 'earnings' ] ] ] ) {
			const c = await browser.newContext( { viewport: { width: w, height: 900 }, storageState: await ctx.storageState() } );
			const pg = await c.newPage();
			for ( const sct of secs ) {
				await pg.goto( dash( biz, sct ) );
				const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
				if ( over > 1 ) { wide.push( `${ sct }@${ w }:${ over }` ); }
			}
			await c.close();
		}
	}
	check( 0 === wide.length, 'Dashboards used in the journeys: no sideways scrolling at 360 / 768 / 1280' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + [ ...new Set( jsErrors ) ].join( ' | ' ) : '' ) );

	await browser.close();
	fs.rmSync( TMP, { recursive: true, force: true } );
	console.log( failures ? `\n${ failures } check(s) FAILED:\n - ${ results.join( '\n - ' ) }` : '\nAll 14 journeys passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( `[${ current }]`, e ); try { fx( 'ads-restore' ); } catch ( x ) {} process.exit( 1 ); } );
