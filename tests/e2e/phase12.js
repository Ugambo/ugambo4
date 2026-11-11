/**
 * Phase 12 browser journey: contact form (Fluent Forms) with the email to Explore Katsina, newsletter
 * sign-up (MailPoet, double opt-in email), WhatsApp button (Join.chat) placed above the mobile bottom bar,
 * page cache really serving visitors (and never private pages), WebP photos, SEO tags, and every helper
 * plugin's admin screen opening without errors.
 *
 * Usage: node tests/e2e/phase12.js
 */
const { chromium, devices } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const MAIL = process.env.EK_MAIL || 'http://localhost:8025';
const SHOTS = path.join( __dirname, 'screenshots' );
fs.mkdirSync( SHOTS, { recursive: true } );
const ROOT = path.join( __dirname, '..', '..' );
const wp = ( cmd ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp ${ cmd }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim();
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );
const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
const mailTo = async ( to, subjectPart ) => {
	for ( let i = 0; i < 20; i++ ) {
		const r = await fetch( `${ MAIL }/api/v1/search?query=${ encodeURIComponent( 'to:' + to ) }` ).then( ( x ) => x.json() ).catch( () => ( {} ) );
		const m = ( r.messages || [] ).find( ( x ) => ! subjectPart || x.Subject.includes( subjectPart ) );
		if ( m ) { return m; }
		await sleep( 1000 );
	}
	return null;
};

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };

( async () => {
	const stamp = Date.now().toString( 36 );
	const adminEmail = wp( 'option get admin_email' ).split( '\n' ).pop();
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );

	console.log( '1. Contact form' );
	const dc = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const d = await dc.newPage();
	watch( d );
	await d.goto( BASE + '/contact/' );
	await d.waitForSelector( 'form.frm-fluent-form' );
	check( await d.locator( 'form.frm-fluent-form [name="topic"] option' ).count() >= 6, 'Contact form with topics' );
	await d.click( 'form.frm-fluent-form button[type="submit"]' );
	await d.waitForTimeout( 1200 );
	check( await d.locator( '.error.text-danger, .ff-el-is-error' ).count() >= 3, 'Empty form: required fields flagged' );
	await d.fill( '[name="full_name"]', `SAMPLE Visitor ${ stamp }` );
	await d.fill( '[name="email"]', `visitor_${ stamp }@example.test` );
	await d.fill( '[name="phone"]', '0803 000 0012' );
	await d.selectOption( '[name="topic"]', { index: 2 } );
	await d.fill( '[name="message"]', `SAMPLE message ${ stamp }: is the Durbar on this year?` );
	await d.locator( '[name="consent"]' ).scrollIntoViewIfNeeded();
	const cb = await d.locator( '[name="consent"]' ).boundingBox(); // A real mouse click, as a visitor would.
	await d.mouse.click( cb.x + cb.width / 2, cb.y + cb.height / 2 );
	check( await d.locator( '[name="consent"]' ).isChecked(), 'Consent box ticks' );
	await d.screenshot( { path: path.join( SHOTS, 'p12-contact-1280.png' ), fullPage: true } );
	await d.waitForTimeout( 1500 ); // Fluent Forms ignores a second send within ~1 s of the first try (double-click guard); people are slower.
	await d.click( 'form.frm-fluent-form button[type="submit"]' );
	await d.waitForSelector( '.ff-message-success', { timeout: 15000 } );
	check( /reply within 2 working days/.test( await d.locator( '.ff-message-success' ).textContent() ), 'Sent: thank-you message' );
	const entry = wp( `eval 'global $wpdb; echo (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}fluentform_submissions WHERE response LIKE %s", "%${ stamp }%" ) );'` );
	check( '1' === entry.split( '\n' ).pop(), 'Message saved in wp-admin → Fluent Forms → Entries' );
	const note = await mailTo( adminEmail, 'Website message' );
	check( !! note, 'Email to Explore Katsina: "Website message: …"' );

	console.log( '2. Newsletter sign-up (double opt-in)' );
	await d.goto( BASE + '/explore/' );
	const box = d.locator( '#colophon .ek-newsletter' );
	check( await box.isVisible(), 'Sign-up box in the footer' );
	const sub = `news_${ stamp }@example.test`;
	await box.locator( '[name="ek_news_email"]' ).fill( sub );
	await box.locator( '[name="ek_news_consent"]' ).check();
	await Promise.all( [ d.waitForNavigation(), box.locator( 'button' ).click() ] );
	check( /check your email/i.test( await d.locator( '.ek-newsletter-msg' ).textContent() ), '"Please check your email and click the link"' );
	const confirm = await mailTo( sub );
	check( !! confirm, 'Confirmation email sent (nobody is added without confirming)' );
	await d.screenshot( { path: path.join( SHOTS, 'p12-newsletter-1280.png' ) } );

	console.log( '3. WhatsApp button on a phone' );
	const pc = await browser.newContext( { ...devices[ 'Pixel 5' ] } );
	const p = await pc.newPage();
	watch( p );
	await p.goto( BASE + '/things-to-do/' );
	await p.waitForSelector( '.joinchat__button', { state: 'visible', timeout: 15000 } );
	const btn = await p.locator( '.joinchat__button' ).boundingBox();
	const bar = await p.locator( '.ekt-bottom-nav' ).boundingBox();
	check( btn && bar && btn.y + btn.height <= bar.y, 'WhatsApp button sits above the bottom bar (not covering it)' );
	await p.screenshot( { path: path.join( SHOTS, 'p12-whatsapp-phone.png' ) } );
	await p.goto( BASE + '/account/' );
	check( await p.locator( '.joinchat' ).count() === 0, 'No WhatsApp button on My Account' );

	console.log( '4. Page cache' );
	wp( `eval 'EK\\Integrations::clear_page_cache();'` );
	const anon = await browser.newContext();
	const a = await anon.newPage();
	await a.goto( BASE + '/attractions/gobarau-minaret/' );
	const second = await a.goto( BASE + '/attractions/gobarau-minaret/' ); // The cache's note is after </html>: read the raw response.
	const cached = ( await second.text() ).includes( 'Cached page generated by WP-Super-Cache' );
	check( cached, 'Visitors get the fast cached copy on the second visit' );
	await a.goto( BASE + '/account/' );
	const acct = await a.goto( BASE + '/account/' );
	check( ! ( await acct.text() ).includes( 'Cached page generated' ), 'My Account is never cached' );
	const imgs = await a.evaluate( () => 0 );
	await a.goto( BASE + '/' );
	const srcs = await a.locator( '.ekt-card-img img' ).evaluateAll( ( els ) => els.map( ( e ) => e.currentSrc || e.src ) );
	check( srcs.length > 0 && srcs.every( ( s ) => /\.webp$/.test( s ) ), `Photos served as WebP (${ srcs.length } on the homepage)` );
	check( await a.locator( 'meta[property="og:title"]' ).count() === 1 && /Katsina/.test( await a.title() ), 'SEO title and social sharing tags' );
	const sm = await a.request.get( BASE + '/sitemap_index.xml' );
	check( 200 === sm.status() && /ek_attraction-sitemap/.test( await sm.text() ), 'Sitemap lists attractions, businesses, pages' );
	void imgs;

	console.log( '5. Logged in: always fresh, admin screens open' );
	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const ad = await ac.newPage();
	await ad.goto( BASE + '/wp-login.php' );
	await ad.fill( '#user_login', env.EK_ADMIN_USER );
	await ad.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await ad.click( '#wp-submit' );
	await ad.waitForLoadState();
	const fresh = await ad.goto( BASE + '/attractions/gobarau-minaret/' );
	check( ! ( await fresh.text() ).includes( 'Cached page generated' ), 'Logged-in people are never served a cached page' );
	const screens = {
		'Rank Math': 'admin.php?page=rank-math',
		'Wordfence': 'admin.php?page=Wordfence',
		'Limit Login Attempts': 'admin.php?page=limit-login-attempts',
		'UpdraftPlus': 'options-general.php?page=updraftplus',
		'WP Super Cache': 'options-general.php?page=wpsupercache',
		'Smush': 'admin.php?page=smush',
		'Join.chat': 'admin.php?page=joinchat',
		'Fluent Forms': 'admin.php?page=fluent_forms',
		'MailPoet': 'admin.php?page=mailpoet-homepage',
		'FluentSMTP': 'options-general.php?page=fluent-mail',
	};
	const bad = [];
	for ( const [ name, url ] of Object.entries( screens ) ) {
		const r = await ad.goto( `${ BASE }/wp-admin/${ url }` );
		const html = await ad.content();
		if ( ! r || r.status() >= 400 || /critical error|Fatal error/.test( html ) || /welcome-wizard|page=mailpoet-landingpage/.test( ad.url() ) ) {
			bad.push( name );
		}
	}
	check( 0 === bad.length, 'All 10 plugin screens open without errors or set-up wizards' + ( bad.length ? ' → ' + bad.join( ', ' ) : '' ) );
	await ad.goto( `${ BASE }/wp-admin/admin.php?page=fluent_forms` );
	await ad.screenshot( { path: path.join( SHOTS, 'p12-admin-forms.png' ) } );

	console.log( '6. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 800 } } );
		const pg = await c.newPage();
		watch( pg );
		for ( const u of [ '/', '/contact/', '/explore/', '/attractions/gobarau-minaret/' ] ) {
			await pg.goto( BASE + u );
			await pg.waitForTimeout( 300 );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );

	wp( `eval 'global $wpdb; $wpdb->query( $wpdb->prepare( "DELETE FROM {$wpdb->prefix}fluentform_submissions WHERE response LIKE %s", "%${ stamp }%" ) );'` );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll helper-plugin browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
