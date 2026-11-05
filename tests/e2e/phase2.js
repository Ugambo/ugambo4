/**
 * Phase 2 browser journey (run against the local site):
 *   sign-up on a phone → pending dashboard → owner blocked from wp-admin →
 *   admin approves → public page live → visitor taps tracked → emails sent.
 *
 * Usage: node tests/e2e/phase2.js   (needs the local site on :8888 and Mailpit on :8025)
 * Screenshots go to tests/e2e/screenshots/.
 */
const { chromium } = require( 'playwright' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const MAIL = process.env.EK_MAIL || 'http://localhost:8025';
const ADMIN_USER = process.env.EK_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.EK_ADMIN_PASSWORD;
const SHOTS = path.join( __dirname, 'screenshots' );
const FIX = path.join( __dirname, 'fixtures' );
fs.mkdirSync( SHOTS, { recursive: true } );

const stamp = Date.now().toString( 36 );
const owner = { email: `owner-${ stamp }@example.test`, pass: 'Test-pass-2026!' };
let failures = 0;
function check( cond, msg ) {
	console.log( ( cond ? '  ✔ ' : '  ✘ ' ) + msg );
	if ( ! cond ) { failures++; }
}

function launchOpts() {
	const o = {};
	// Map tiles come from openstreetmap.org through the session proxy, if one is set.
	if ( process.env.HTTPS_PROXY ) { o.proxy = { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }; }
	return o;
}

( async () => {
	const browser = await chromium.launch( launchOpts() );

	/* ---------- 1. Sign-up on a 360px phone ---------- */
	console.log( '1. Sign-up at 360px' );
	const phone = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2, geolocation: { latitude: 12.9895, longitude: 7.6005 }, permissions: [ 'geolocation' ] } );
	const p = await phone.newPage();
	const errors = [];
	p.on( 'pageerror', ( e ) => errors.push( e.message ) );
	await p.goto( BASE + '/list-your-business/' );
	await p.screenshot( { path: path.join( SHOTS, 'signup-step1-360.png' ), fullPage: true } );

	// Continue with an empty step → client-side errors shown.
	await p.click( '[data-ek-next]' );
	check( await p.locator( '.ek-step[data-step="1"] .has-error' ).count() > 0, 'Empty step 1 shows field errors' );

	await p.fill( '#ek-name', `SAMPLE Test Guest House ${ stamp }` );
	await p.selectOption( '#ek-type', 'hotel' );
	await p.selectOption( '#ek-lga', { label: 'Katsina' } );
	await p.fill( '#ek-description', 'SAMPLE listing created by the automated test. Clean rooms, 24-hour power, parking and a small restaurant near the city centre.' );
	await p.click( '[data-ek-next]' );

	await p.fill( '#ek-address', 'SAMPLE address, near the central market, Katsina' );
	await p.click( '[data-ek-next]' );
	check( await p.locator( '[data-ek-required-pin].has-error' ).count() === 1, 'Cannot continue without a map pin' );
	await p.click( '[data-ek-locate]' );
	await p.waitForFunction( () => document.getElementById( 'ek-lat' ).value !== '' );
	check( ( await p.inputValue( '#ek-lat' ) ).startsWith( '12.98' ), '"Use my location" places the pin' );
	await p.waitForTimeout( 1500 );
	await p.screenshot( { path: path.join( SHOTS, 'signup-step2-map-360.png' ), fullPage: true } );
	await p.click( '[data-ek-next]' );

	await p.fill( '#ek-phone', '0803 000 0001' );
	await p.fill( '#ek-whatsapp', '0803 000 0001' );
	await p.fill( '#ek-email', `biz-${ stamp }@example.test` );
	await p.check( 'input[name="hours[sun][closed]"]' );
	await p.click( '[data-ek-next]' );

	await p.setInputFiles( '#ek-photos', [ path.join( FIX, 'photo-1.jpg' ), path.join( FIX, 'photo-2.jpg' ) ] );
	await p.fill( '#ek-owner', 'SAMPLE Owner Name' );
	await p.setInputFiles( '#ek-id', path.join( FIX, 'id-sample.png' ) );
	await p.screenshot( { path: path.join( SHOTS, 'signup-step4-360.png' ), fullPage: true } );
	await p.click( '[data-ek-next]' );

	await p.fill( '#ek-bank', 'Zenith Bank' );
	await p.fill( '#ek-acct', '0123456789' );
	await p.fill( '#ek-acctname', 'SAMPLE OWNER NAME' );
	await p.fill( '#ek-login-email', owner.email );
	await p.fill( '#ek-login-pass', owner.pass );
	await p.click( '[data-ek-submit]' );
	check( await p.locator( '.ek-step[data-step="5"] .has-error' ).count() > 0, 'Submit blocked until the agreement is accepted' );
	await p.check( 'input[name=agreement]' );
	await p.screenshot( { path: path.join( SHOTS, 'signup-step5-360.png' ), fullPage: true } );
	await Promise.all( [ p.waitForNavigation(), p.click( '[data-ek-submit]' ) ] );

	check( p.url().includes( '/business-dashboard/' ), 'After sign-up the owner lands on the dashboard' );
	check( await p.locator( '.ek-pill--pending' ).count() === 1, 'New business shows "Waiting for approval"' );
	const businessId = parseInt( new URL( p.url() ).searchParams.get( 'business' ), 10 );
	check( businessId > 0, `Business created (id ${ businessId })` );
	await p.screenshot( { path: path.join( SHOTS, 'dashboard-overview-360.png' ), fullPage: true } );

	// Pending business is not visible to the public.
	const anon = await browser.newContext();
	const ap = await anon.newPage();
	const pendingResp = await ap.goto( BASE + '/?ek_business=' + businessId );
	check( pendingResp.status() === 404, 'Pending business is hidden from visitors (404)' );

	/* ---------- 2. Owner is kept out of wp-admin ---------- */
	console.log( '2. Owner cannot use wp-admin' );
	await p.goto( BASE + '/wp-admin/' );
	check( p.url().includes( '/business-dashboard/' ), 'wp-admin redirects the owner to the dashboard' );
	check( await p.locator( '#wpadminbar' ).count() === 0, 'No WordPress admin bar for owners' );

	/* ---------- 3. Each dashboard section loads (360 / 768 / 1280) ---------- */
	console.log( '3. Dashboard sections' );
	const sections = [ 'profile', 'photos', 'bookings', 'earnings', 'payouts', 'invoices', 'reviews', 'ranking', 'analytics' ];
	for ( const s of sections ) {
		const r = await p.goto( `${ BASE }/business-dashboard/?section=${ s }&business=${ businessId }` );
		check( r.status() === 200 && await p.locator( '.ek-app-main h1' ).count() === 1, `Section "${ s }" loads` );
	}
	const overflow = {};
	for ( const w of [ 360, 768, 1280 ] ) {
		const ctx = await browser.newContext( { viewport: { width: w, height: 900 }, deviceScaleFactor: 2, storageState: await phone.storageState() } );
		const pg = await ctx.newPage();
		for ( const s of [ 'overview', 'profile', 'payouts' ] ) {
			await pg.goto( `${ BASE }/business-dashboard/?section=${ s }&business=${ businessId }` );
			await pg.waitForTimeout( 400 );
			overflow[ `${ s }@${ w }` ] = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			await pg.screenshot( { path: path.join( SHOTS, `dashboard-${ s }-${ w }.png` ), fullPage: true } );
		}
		await ctx.close();
	}
	const wide = Object.entries( overflow ).filter( ( [ , v ] ) => v > 1 );
	check( wide.length === 0, 'No sideways scrolling at 360 / 768 / 1280' + ( wide.length ? ' → ' + JSON.stringify( wide ) : '' ) );

	// Profile edit validation + save.
	await p.goto( `${ BASE }/business-dashboard/?section=profile&business=${ businessId }` );
	await p.fill( '#ek-phone', '12345' );
	await Promise.all( [ p.waitForLoadState(), p.click( 'button[type=submit]:has-text("Save profile")' ) ] );
	check( await p.locator( '.ek-field.has-error #ek-phone' ).count() === 1, 'Invalid phone is rejected on the profile form' );
	await p.fill( '#ek-phone', '0803 000 0002' );
	await Promise.all( [ p.waitForNavigation(), p.click( 'button[type=submit]:has-text("Save profile")' ) ] );
	check( await p.locator( '.ek-notice--ok' ).count() > 0, 'Profile saves' );

	// Payout below minimum is refused (no balance yet).
	await p.goto( `${ BASE }/business-dashboard/?section=payouts&business=${ businessId }` );
	check( await p.locator( 'button:has-text("Request payout")[disabled]' ).count() === 1, 'Payout button disabled with a ₦0 balance' );

	/* ---------- 4. Admin approves ---------- */
	console.log( '4. Admin approval' );
	const adm = await browser.newContext( { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 } );
	const a = await adm.newPage();
	await a.goto( BASE + '/wp-login.php' );
	await a.fill( '#user_login', ADMIN_USER );
	await a.fill( '#user_pass', ADMIN_PASS );
	await Promise.all( [ a.waitForNavigation(), a.click( '#wp-submit' ) ] );
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-approvals' );
	check( await a.locator( `text=SAMPLE Test Guest House ${ stamp }` ).count() > 0, 'Business appears in the approval queue' );
	await a.screenshot( { path: path.join( SHOTS, 'admin-approvals-1280.png' ), fullPage: true } );
	await a.goto( `${ BASE }/wp-admin/admin.php?page=ek-approvals&business=${ businessId }` );
	await a.waitForTimeout( 800 );
	check( await a.locator( 'text=View ID (logged)' ).count() === 1, 'Admin can open the ID document link' );
	const idUrl = await a.locator( 'a:has-text("View ID (logged)")' ).getAttribute( 'href' );
	const idResp = await a.request.get( idUrl );
	check( idResp.status() === 200 && idResp.headers()[ 'content-type' ].includes( 'image/png' ), 'ID document opens for the admin' );
	const ownerIdResp = await p.request.get( idUrl );
	check( ownerIdResp.status() === 403, 'The same ID link is refused for the business owner' );
	check( await a.locator( '.ek-secret' ).textContent() === '0123456789', 'Admin sees the decrypted account number' );
	await a.screenshot( { path: path.join( SHOTS, 'admin-business-1280.png' ), fullPage: true } );
	await Promise.all( [ a.waitForNavigation(), a.click( 'button:has-text("Approve and publish")' ) ] );
	check( await a.locator( '.ek-pill--publish' ).count() === 1, 'Business approved' );

	/* ---------- 5. Public page + tracking ---------- */
	console.log( '5. Public page' );
	await p.goto( `${ BASE }/business-dashboard/?business=${ businessId }` );
	const publicUrl = await p.locator( 'a:has-text("View my listing")' ).getAttribute( 'href' );
	check( /\/hotels\//.test( publicUrl ), `Clean URL for hotels: ${ publicUrl }` );
	const visitor = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 } );
	const v = await visitor.newPage();
	await v.goto( publicUrl );
	await v.waitForTimeout( 1500 );
	await v.screenshot( { path: path.join( SHOTS, 'public-business-360.png' ), fullPage: true } );
	check( await v.locator( 'a:has-text("WhatsApp")' ).count() === 1, 'WhatsApp button on public page' );
	await v.locator( 'a:has-text("Call")' ).evaluate( ( el ) => { el.addEventListener( 'click', ( e ) => e.preventDefault() ); el.click(); } );
	await v.waitForTimeout( 1200 );
	await p.goto( `${ BASE }/business-dashboard/?section=analytics&business=${ businessId }` );
	const statsText = await p.locator( '.ek-stats' ).textContent();
	check( /Page views\s*1/.test( statsText ) && /Call clicks\s*1/.test( statsText ), 'Visitor view and call tap counted in analytics' );
	await p.screenshot( { path: path.join( SHOTS, 'dashboard-analytics-360.png' ), fullPage: true } );

	/* ---------- 6. Emails ---------- */
	console.log( '6. Emails' );
	const mail = await ( await a.request.get( MAIL + '/api/v1/messages?limit=50' ) ).json();
	const subjects = ( mail.messages || [] ).filter( ( m ) => ( m.To || [] ).some( ( t ) => t.Address === owner.email ) || ( m.Subject || '' ).includes( stamp ) ).map( ( m ) => m.Subject );
	check( subjects.some( ( s ) => /received your listing/i.test( s ) ), 'Owner got "We received your listing"' );
	check( subjects.some( ( s ) => /waiting for approval/i.test( s ) ), 'Admin got "New business waiting for approval"' );
	check( subjects.some( ( s ) => /now live/i.test( s ) ), 'Owner got "Your business is now live"' );

	check( errors.length === 0, 'No JavaScript errors' + ( errors.length ? ': ' + errors.join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
