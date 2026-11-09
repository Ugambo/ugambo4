/**
 * Phase 7 browser journey: admin sets commission → hotel gets its own rate → guest pays online →
 * stays → reports a problem → admin refunds part → hotel's share released → hotel requests a payout →
 * admin approves and marks it paid → monthly invoice for a pay-at-hotel stay → hotel pays it from
 * earnings → reports.
 *
 * Usage: node tests/e2e/phase7.js
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
const iso = ( d ) => d.toISOString().slice( 0, 10 );
const base = new Date(); base.setUTCHours( 12 ); base.setUTCDate( base.getUTCDate() + 49 + ( ( 8 - base.getUTCDay() ) % 7 ) );
const day = ( n ) => { const d = new Date( base ); d.setUTCDate( d.getUTCDate() + n ); return iso( d ); };
const rnd = ( a ) => ( a + Math.random() * 0.08 ).toFixed( 5 );

( async () => {
	const stamp = Date.now().toString( 36 );
	const fx = json( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ rnd( 12.95 ) } ${ rnd( 7.56 ) } hotel` );
	const { room } = json( `eval-file ek-tests/e2e/fixture-phase7.php setup ${ fx.id }` );
	console.log( `Fixture hotel ${ fx.id }` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];

	/* 1. Admin: commission */
	console.log( '1. Admin sets commission rates' );
	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const a = await ac.newPage();
	await a.goto( BASE + '/wp-login.php' );
	await a.fill( '#user_login', env.EK_ADMIN_USER );
	await a.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await Promise.all( [ a.waitForNavigation(), a.click( '#wp-submit' ) ] );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-settings' );
	check( await a.inputValue( 'input[name="commission[hotel]"]' ) === '10' && await a.inputValue( 'input[name="commission[tour-operator]"]' ) === '15', 'Settings show the placeholder rates (hotels 10%, tours 15%)' );
	await a.locator( 'input[name="commission[hotel]"]' ).scrollIntoViewIfNeeded();
	await a.screenshot( { path: path.join( SHOTS, 'p7-admin-commission-1280.png' ), fullPage: false } );
	await a.goto( `${ BASE }/wp-admin/admin.php?page=ek-approvals&business=${ fx.id }` );
	await a.fill( 'input[name=commission]', '8' );
	await a.fill( 'input[name=reason]', 'SAMPLE launch discount' );
	await Promise.all( [ a.waitForNavigation(), a.click( 'button:has-text("Save rate")' ) ] );
	check( ( await a.locator( '.wrap' ).textContent() ).includes( 'Hotel bookings: 8%' ), 'This hotel gets its own 8% rate' );

	/* 2. Guest pays, stays, reports a problem */
	console.log( '2. Guest pays ₦25,000 online, stays, reports a problem' );
	const gc = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 } );
	const g = await gc.newPage();
	g.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await g.goto( `${ fx.url }?checkin=${ day( 0 ) }&checkout=${ day( 1 ) }` );
	await Promise.all( [ g.waitForNavigation(), g.locator( '.ek-room', { hasText: 'Standard' } ).locator( 'a:has-text("Book now")' ).click() ] );
	await g.fill( '#g-name', 'SAMPLE Guest Zainab' );
	await g.fill( '#g-email', `zainab_${ stamp }@example.test` );
	await g.fill( '#g-phone', '0803 000 0091' );
	await g.check( 'input[name=payment][value=full]' );
	await g.check( 'input[name=agree]' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Confirm booking")' ) ] );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Pay (test, succeeds)")' ) ] );
	const code = ( await g.locator( '.ek-code' ).textContent() ).trim();
	const confirmUrl = g.url();
	check( await g.locator( '#problem' ).count() === 0, `Paid (${ code }); no "report a problem" before the stay` );
	json( `eval-file ek-tests/e2e/fixture-phase7.php stay ${ code }` );
	await g.goto( confirmUrl );
	check( await g.locator( '#problem summary:has-text("Report a problem")' ).count() === 1, 'After check-out: "Problem with your booking?" (within 3 days)' );
	await g.click( '#problem summary' );
	await g.fill( '#pb-msg', 'SAMPLE report: no hot water during the stay, reception could not fix it.' );
	await Promise.all( [ g.waitForNavigation(), g.click( 'button:has-text("Send report")' ) ] );
	check( ( await g.locator( '#problem' ).textContent() ).includes( 'Being looked into' ), 'Report sent; status "being looked into"' );
	await g.locator( '#problem' ).scrollIntoViewIfNeeded();
	await g.screenshot( { path: path.join( SHOTS, 'p7-guest-report-360.png' ), fullPage: true } );

	/* 3. Owner sees money frozen */
	const oc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } );
	const o = await oc.newPage();
	o.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );
	await o.goto( BASE + '/business-dashboard/' );
	await o.fill( '#user_login', fx.user );
	await o.fill( '#user_pass', fx.pass );
	await Promise.all( [ o.waitForNavigation(), o.click( '#wp-submit' ) ] );
	const dash = ( s ) => `${ BASE }/business-dashboard/?section=${ s }&business=${ fx.id }`;
	await o.goto( dash( 'earnings' ) );
	const earn = await o.locator( 'main' ).textContent();
	check( /On hold \(guest complaint\)/.test( earn ) && /Hotel bookings 8%/.test( earn ), 'Hotel sees ₦23,000 on hold because of the complaint, and its 8% rate' );

	/* 4. Admin decides */
	console.log( '3. Admin refunds ₦5,000; the hotel’s share is released' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-complaints' );
	const card = a.locator( '.card', { hasText: code } );
	check( await card.count() === 1 && ( await card.textContent() ).includes( 'no hot water' ), 'Complaint listed with the guest’s words' );
	await a.screenshot( { path: path.join( SHOTS, 'p7-admin-complaints-1280.png' ), fullPage: true } );
	await card.locator( 'input[value=refund]' ).check();
	await card.locator( 'input[name=refund]' ).fill( '5,000' );
	await card.locator( 'textarea[name=note]' ).fill( 'Partial refund for the hot water problem.' );
	await Promise.all( [ a.waitForNavigation(), card.locator( 'button:has-text("Decide")' ).click() ] );
	check( await a.locator( '.notice-success' ).count() === 1, 'Decision saved' );
	await o.goto( dash( 'earnings' ) );
	check( /₦18,400/.test( await o.locator( '.ek-stat--accent' ).textContent() ), 'Hotel: ₦20,000 kept − 8% = ₦18,400 available now' );
	await o.screenshot( { path: path.join( SHOTS, 'p7-earnings-390.png' ), fullPage: true } );
	await g.goto( confirmUrl );
	check( /Refund of ₦5,000 agreed/.test( await g.locator( '#problem' ).textContent() ), 'Guest sees the decision and the ₦5,000 refund' );

	/* 5. Payout */
	console.log( '4. Payout: requested, approved, paid' );
	await o.goto( dash( 'payouts' ) );
	await o.fill( '#ek-amount', '10,000' );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Request payout")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0, 'Hotel requests ₦10,000' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-payouts' );
	const prow = a.locator( 'tr', { hasText: stamp } ).first();
	await Promise.all( [ a.waitForNavigation(), prow.locator( 'a:has-text("Show full account details")' ).click() ] );
	check( ( await a.locator( 'tr', { hasText: stamp } ).first().textContent() ).includes( '0123456789' ), 'Admin reveals the account number (logged)' );
	await a.screenshot( { path: path.join( SHOTS, 'p7-admin-payouts-1280.png' ), fullPage: true } );
	await Promise.all( [ a.waitForNavigation(), a.locator( 'tr', { hasText: stamp } ).first().locator( 'button:has-text("Approve")' ).click() ] );
	await a.locator( 'tr', { hasText: stamp } ).first().locator( 'input[name=reference]' ).fill( 'SAMPLE-TRF-001' );
	await Promise.all( [ a.waitForNavigation(), a.locator( 'tr', { hasText: stamp } ).first().locator( 'button:has-text("Mark paid")' ).click() ] );
	await o.goto( dash( 'payouts' ) );
	const hist = await o.locator( '#poh-h' ).locator( '..' ).textContent();
	check( /Paid/.test( hist ) && /SAMPLE-TRF-001/.test( hist ), 'Hotel sees "Paid" with the transfer reference' );
	check( /₦8,400/.test( await o.locator( '.ek-display' ).first().textContent() ), 'Remaining available: ₦8,400' );

	/* 6. Invoice */
	console.log( '5. Monthly invoice for a pay-at-hotel stay, paid from earnings' );
	const v = json( `eval-file ek-tests/e2e/fixture-phase7.php venue-last-month ${ room }` );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-invoices' );
	await a.fill( 'input[name=month]', v.month );
	await Promise.all( [ a.waitForNavigation(), a.click( 'button:has-text("Create")' ) ] );
	check( ( await a.locator( 'tr', { hasText: stamp } ).first().textContent() ).includes( '₦2,000' ), 'Invoice created: 8% of ₦25,000 = ₦2,000' );
	await a.screenshot( { path: path.join( SHOTS, 'p7-admin-invoices-1280.png' ), fullPage: true } );
	await o.goto( dash( 'invoices' ) );
	await o.click( '.ek-invoice summary' );
	check( ( await o.locator( '.ek-invoice' ).first().textContent() ).includes( v.code ), 'Hotel sees the invoice and the booking it covers' );
	await o.screenshot( { path: path.join( SHOTS, 'p7-invoice-390.png' ), fullPage: true } );
	await Promise.all( [ o.waitForNavigation(), o.click( 'button:has-text("Pay from my earnings")' ) ] );
	check( await o.locator( '.ek-notice--ok' ).count() > 0 && ( await o.locator( '.ek-invoice' ).first().textContent() ).includes( 'Paid' ), 'Paid from earnings' );
	await o.goto( dash( 'earnings' ) );
	check( /₦6,400/.test( await o.locator( '.ek-stat--accent' ).textContent() ), 'Available balance now ₦6,400' );

	/* 7. Reports */
	console.log( '6. Reports' );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-reports' );
	const rep = await a.locator( '.wrap' ).textContent();
	check( rep.includes( 'Commission earned' ) && rep.includes( 'Hotel no-show rates' ) && new RegExp( stamp ).test( rep ), 'Reports show commission, money owed per business and no-show rates' );
	await a.screenshot( { path: path.join( SHOTS, 'p7-admin-reports-1280.png' ), fullPage: true } );
	const csvHref = await a.locator( 'a:has-text("Download bookings")' ).getAttribute( 'href' );
	const csv = await a.request.get( csvHref );
	check( csv.ok() && ( await csv.text() ).includes( code ), 'CSV download includes this period’s bookings' );
	const anon = await ( await browser.newContext() ).request.get( csvHref );
	check( ! ( await anon.text() ).includes( code ), 'CSV is not available to visitors who are not logged in as admin' );

	/* 8. Layout */
	console.log( '7. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 900 }, storageState: await oc.storageState() } );
		const pg = await c.newPage();
		for ( const s of [ 'earnings', 'payouts', 'invoices' ] ) {
			await pg.goto( dash( s ) );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ s }@${ w }:${ over }` ); }
		}
		await pg.goto( confirmUrl );
		const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
		if ( over > 1 ) { wide.push( `confirmation@${ w }:${ over }` ); }
		await c.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll money browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
