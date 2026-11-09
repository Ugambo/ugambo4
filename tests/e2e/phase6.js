/**
 * Phase 6 browser journey: a visitor creates an account → books a hotel and pays → adds it to their calendar →
 * cancels in time and sees the refund → reserves a table → after the meal writes a verified review →
 * the review appears on the restaurant page → the owner replies → favourites → profile.
 *
 * Usage: node tests/e2e/phase6.js
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
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };
const iso = ( d ) => d.toISOString().slice( 0, 10 );
const base = new Date(); base.setUTCHours( 12 ); base.setUTCDate( base.getUTCDate() + 35 + ( ( 8 - base.getUTCDay() ) % 7 ) );
const day = ( n ) => { const d = new Date( base ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); };
const rnd = ( a ) => ( a + Math.random() * 0.08 ).toFixed( 5 );

( async () => {
	const stamp = Date.now().toString( 36 );
	const hx = JSON.parse( wp( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp }h ${ rnd( 12.95 ) } ${ rnd( 7.56 ) } hotel` ).split( '\n' ).pop() );
	const rx = JSON.parse( wp( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp }r ${ rnd( 12.95 ) } ${ rnd( 7.56 ) } restaurant` ).split( '\n' ).pop() );
	wp( `eval-file ek-tests/e2e/fixture-phase6.php ${ hx.id } ${ rx.id }` );
	console.log( `Fixture hotel ${ hx.id }, restaurant ${ rx.id }` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const email = `amina_${ stamp }@example.test`;

	/* 1. Create an account */
	console.log( '1. Visitor creates an account' );
	const gc = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 } );
	const g = await gc.newPage();
	g.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await g.goto( BASE + '/account/' );
	await g.screenshot( { path: path.join( SHOTS, 'p6-account-login-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Create account")' ) ] );
	check( await g.locator( '.has-error .ek-error' ).count() >= 2, 'Empty sign-up form shows what is missing' );
	await g.fill( '#reg-name', 'SAMPLE Amina Bello' );
	await g.fill( '#reg-email', email );
	await g.fill( '#reg-phone', '0803 000 0071' );
	await g.fill( '#reg-pass', 'Amina-pass-' + stamp );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Create account")' ) ] );
	check( await g.locator( '.ek-acct-tabs a[aria-current]' ).textContent() === 'My Bookings', 'Account created; lands on My Bookings' );
	check( await g.locator( 'text=No bookings yet' ).count() === 1, 'Empty state links to hotels and event centres' );
	await g.goto( BASE + '/wp-admin/' );
	check( g.url().includes( '/account/' ), 'Customer is kept out of wp-admin (sent back to My Account)' );

	/* 2. Book a hotel and pay */
	console.log( '2. Books a hotel (2 nights) and pays in full' );
	await g.goto( `${ hx.url }?checkin=${ day( 0 ) }&checkout=${ day( 2 ) }` );
	await Promise.all( [ g.waitForNavigation(), g.locator( '.ek-room', { hasText: 'Standard' } ).locator( 'a:has-text("Book now")' ).click() ] );
	check( await g.inputValue( '#g-name' ) === 'SAMPLE Amina Bello' && await g.inputValue( '#g-email' ) === email && /0803|234/.test( await g.inputValue( '#g-phone' ) ), 'Name, email and phone filled in from the account' );
	await g.check( 'input[name=payment][value=full]' );
	await g.check( 'input[name=agree]' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Confirm booking")' ) ] );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Pay (test, succeeds)")' ) ] );
	const code = ( await g.locator( '.ek-code' ).textContent() ).trim();
	const confirmUrl = g.url();
	check( /^EK-[A-Z2-9]{6}$/.test( code ), `Paid ₦50,000; booking code ${ code }` );
	check( await g.locator( 'a:has-text("Google Calendar")' ).count() === 1 && await g.locator( 'a:has-text(".ics")' ).count() === 1, 'Add-to-calendar buttons (phone/Outlook/Apple and Google)' );
	check( await g.locator( 'a:has-text("Directions"), a[href*="google.com/maps"]' ).count() >= 1, 'Directions link' );
	check( /₦50,000 of the ₦50,000/.test( await g.locator( '#cx-h' ).locator( '..' ).textContent() ), 'Cancel section: "you get back ₦50,000 of the ₦50,000" (moderate policy, 5+ days ahead)' );
	await g.screenshot( { path: path.join( SHOTS, 'p6-confirmation-360.png' ), fullPage: true } );

	const icsHref = await g.locator( 'a:has-text(".ics")' ).getAttribute( 'href' );
	const ics = await g.request.get( icsHref );
	const icsText = await ics.text();
	check( ics.ok() && ( ics.headers()[ 'content-type' ] || '' ).includes( 'text/calendar' ) && icsText.replace( /\r\n /g, '' ).includes( code ) && icsText.includes( 'DTSTART;VALUE=DATE:' + day( 0 ).replace( /-/g, '' ) ), 'Calendar file downloads with the right dates and code' );
	const bad = await g.request.get( icsHref.replace( /key=[^&]+/, 'key=wrong' ) );
	check( 404 === bad.status(), 'Calendar file with a wrong key: not found' );

	await g.goto( BASE + '/account/' );
	check( ( await g.locator( '.ek-trip', { hasText: code } ).count() ) === 1, 'Booking appears in My Bookings' );
	await g.screenshot( { path: path.join( SHOTS, 'p6-my-bookings-360.png' ), fullPage: true } );

	/* 3. Cancel */
	console.log( '3. Cancels in time and gets a full refund' );
	await g.goto( confirmUrl );
	await g.click( 'summary:has-text("Cancel this booking")' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Yes, cancel it")' ) ] );
	const after = await g.locator( 'main' ).textContent();
	check( /cancelled/i.test( await g.locator( '.ek-confirm-head' ).textContent() ), 'Booking shows as cancelled' );
	check( /₦50,000/.test( after ) && /refund/i.test( after ), 'Refund of ₦50,000 shown' );
	check( await g.locator( 'button:has-text("Yes, cancel it")' ).count() === 0, 'Cancel button is gone' );
	await g.screenshot( { path: path.join( SHOTS, 'p6-cancelled-360.png' ), fullPage: true } );
	const nights = wp( `db query "SELECT COUNT(*) FROM wp_ek_bookings WHERE code='${ code }' AND status='cancelled'" --skip-column-names` );
	check( '1' === nights.trim(), 'Saved as cancelled' );

	/* 4. Reserve a table, eat, review */
	console.log( '4. Reserves a table; after the meal writes a verified review' );
	await g.goto( `${ BASE }/book/?reserve=${ rx.id }&date=${ day( 1 ) }&time=19:00&party=2` );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Request reservation")' ) ] );
	const rcode = ( await g.locator( '.ek-code' ).textContent() ).trim();
	check( /^EK-/.test( rcode ), `Table reserved: ${ rcode }` );
	check( await g.locator( '#review form' ).count() === 0, 'No review form before the meal' );
	wp( `eval 'EK\\Booking::set_status( EK\\Booking::by_code( "${ rcode }" ), "completed", 0 );'` );
	await g.goto( BASE + '/account/?tab=reservations' );
	const trip = g.locator( '.ek-trip', { hasText: rcode } );
	check( await trip.count() === 1 && await trip.locator( 'a:has-text("Write a review")' ).count() === 1, 'My Reservations: "Write a review" after the meal' );
	await Promise.all( [ g.waitForNavigation(), trip.locator( 'a:has-text("Write a review")' ).click() ] );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Publish review")' ) ] );
	check( await g.locator( '.ek-notice--error, [role=alert]' ).count() >= 1, 'Empty review: asks for stars and words' );
	await g.click( 'label[for=ro-4]' );
	await g.selectOption( '#rp-cleanliness', '5' );
	await g.selectOption( '#rp-service', '4' );
	await g.fill( '#rv-title', 'Lovely tuwo' );
	await g.fill( '#rv-body', 'SAMPLE review: warm welcome, tasty tuwo shinkafa and quick service.' );
	await g.screenshot( { path: path.join( SHOTS, 'p6-review-form-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Publish review")' ) ] );
	check( await g.locator( 'text=Your review is published' ).count() === 1, 'Review published' );
	await g.goto( rx.url );
	const revs = g.locator( '#reviews' );
	check( await revs.count() === 1 && ( await revs.textContent() ).includes( 'Lovely tuwo' ) && ( await revs.textContent() ).includes( 'Verified booking' ), 'Review shows on the restaurant page as "Verified booking"' );

	/* 5. Owner replies */
	console.log( '5. Restaurant owner replies' );
	const oc = await browser.newContext( { viewport: { width: 390, height: 844 } } );
	const o = await oc.newPage();
	o.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await o.goto( BASE + '/business-dashboard/' );
	await o.fill( '#user_login', rx.user );
	await o.fill( '#user_pass', rx.pass );
	await Promise.all( [ o.waitForNavigation(), o.click( '#wp-submit' ) ] );
	await o.goto( `${ BASE }/business-dashboard/?section=reviews&business=${ rx.id }` );
	await o.click( 'summary:has-text("Reply")' );
	await o.fill( 'textarea[name=reply]', 'Thank you, Amina! Come again soon.' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Publish reply")' ) ] );
	await g.goto( rx.url );
	check( ( await g.locator( '#reviews .ek-reply' ).textContent() ).includes( 'Come again soon' ), 'Owner’s reply shows under the review' );
	await g.locator( '#reviews' ).scrollIntoViewIfNeeded();
	await g.screenshot( { path: path.join( SHOTS, 'p6-reviews-on-page-360.png' ), fullPage: true } );

	/* 6. Favourites */
	console.log( '6. Favourites' );
	await Promise.all( [ g.waitForNavigation(), g.click( '.ek-fav-btn' ) ] );
	check( ( await g.locator( '.ek-fav-btn' ).textContent() ).includes( 'Saved' ), 'Tap ♡ Save → ♥ Saved' );
	await g.goto( BASE + '/account/?tab=favourites' );
	check( await g.locator( '.ek-favcard' ).count() === 1, 'Restaurant listed under Favourites' );
	await g.screenshot( { path: path.join( SHOTS, 'p6-favourites-360.png' ), fullPage: true } );
	await Promise.all( [ g.waitForNavigation(), g.click( '.ek-favcard .ek-fav-btn' ) ] );
	check( await g.locator( '.ek-favcard' ).count() === 0, 'Removed from Favourites' );
	const anon = await ( await browser.newContext() ).newPage();
	await anon.goto( rx.url );
	await Promise.all( [ anon.waitForNavigation(), anon.click( '.ek-fav-btn' ) ] );
	check( anon.url().includes( '/account/' ) && await anon.locator( '#reg-name' ).count() === 1, 'Logged-out visitors are asked to log in or sign up' );

	/* 7. Profile */
	console.log( '7. Profile' );
	await g.goto( BASE + '/account/?tab=profile' );
	await g.fill( '#p-phone', '0803 000 0072' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Save")' ) ] );
	check( await g.locator( '.ek-notice--ok' ).count() > 0 && /803 000 0072/.test( await g.inputValue( '#p-phone' ) ), 'Phone number updated' );

	await g.goto( BASE + '/my-account/' );
	check( g.url().includes( '/account/' ) && g.url().includes( 'tab=orders' ), 'WooCommerce\'s own account page forwards to My Account → My Orders' );
	const menu = await g.evaluate( () => [ ...document.querySelectorAll( 'header nav a' ) ].map( ( a ) => a.textContent.trim() ) );
	check( menu.filter( ( t ) => /my account/i.test( t ) ).length === 1 && ! menu.some( ( t ) => /^(Book|Cart|Checkout|Sample Page)$/.test( t ) ), 'Menu has one "My Account" and no utility pages' );

	/* 8. Admin refunds screen */
	console.log( '8. Admin Refunds screen' );
	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const a = await ac.newPage();
	await a.goto( BASE + '/wp-login.php' );
	await a.fill( '#user_login', env.EK_ADMIN_USER );
	await a.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await Promise.all( [ a.waitForNavigation(), a.click( '#wp-submit' ) ] );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-refunds' );
	check( ( await a.locator( '.wrap' ).textContent() ).includes( code ), 'Admin sees the refund under "Recent refunds"' );
	await a.screenshot( { path: path.join( SHOTS, 'p6-admin-refunds-1280.png' ), fullPage: true } );

	/* 9. Layout */
	console.log( '9. Layout at 360 / 768 / 1280' );
	{
		const c = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
		const pg = await c.newPage();
		await pg.goto( hx.url );
		const zoom = await pg.evaluate( () => [ ...document.querySelectorAll( '.ek-gallery img' ) ].map( ( i ) => i.clientHeight ) );
		check( zoom.length > 1 && Math.max( ...zoom ) <= 460, 'Photo gallery keeps photos at a sensible size (no zoomed-in crops)' );
		await c.close();
	}
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 900 }, storageState: await gc.storageState() } );
		const pg = await c.newPage();
		for ( const u of [ '/account/', '/account/?tab=reservations', '/account/?tab=favourites', '/account/?tab=profile', confirmUrl.replace( BASE, '' ), new URL( rx.url ).pathname ] ) {
			await pg.goto( BASE + u );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		if ( 1280 === w ) {
			await pg.goto( BASE + '/account/?tab=reservations' );
			await pg.screenshot( { path: path.join( SHOTS, 'p6-account-1280.png' ), fullPage: true } );
			await pg.goto( rx.url );
			await pg.screenshot( { path: path.join( SHOTS, 'p6-restaurant-reviews-1280.png' ), fullPage: true } );
		}
		await c.close();
		const lc = await browser.newContext( { viewport: { width: w, height: 900 } } );
		const lp = await lc.newPage();
		await lp.goto( BASE + '/account/' );
		const over = await lp.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
		if ( over > 1 ) { wide.push( `login@${ w }:${ over }` ); }
		await lc.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll accounts & reviews browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
