/**
 * Phase 11 browser journey: the branded homepage (header, tabbed search with the keyboard, "Near you"
 * with the phone's location, lazy map preview, sections), mobile bottom navigation, Explore page,
 * English ↔ Hausa switcher and "needs translation" pages, keyboard focus, reduced motion, branded
 * login and wp-admin, and no sideways scrolling at 360 / 768 / 1280.
 *
 * Usage: node tests/e2e/phase11.js
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
const json = ( cmd ) => JSON.parse( wp( cmd ).split( '\n' ).pop() );
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };

( async () => {
	const stamp = Date.now().toString( 36 );
	const lat = 12.40 + Math.random() * 0.1;
	const lng = 8.60 + Math.random() * 0.1;
	const fx = json( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ lat.toFixed( 5 ) } ${ lng.toFixed( 5 ) } hotel` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );

	console.log( '1. Homepage on a computer' );
	const dc = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const d = await dc.newPage();
	watch( d );
	await d.goto( BASE + '/' );
	const headerBg = await d.locator( '#masthead .site-main-header-wrap .site-header-row-container-inner' ).first().evaluate( ( e ) => getComputedStyle( e ).backgroundColor );
	check( 'rgb(20, 27, 58)' === headerBg, 'Header in night indigo' );
	check( ( await d.locator( '.site-title' ).first().textContent() ).includes( 'Explore Katsina' ), 'Site name in the header' );
	const menu = await d.locator( '#primary-menu > li > a' ).allTextContents();
	check( [ 'Hotels', 'Restaurants', 'Event centres', 'Things to do', 'Events', 'Map', 'Plan your trip' ].every( ( t ) => menu.some( ( m ) => m.trim().startsWith( t ) ) ), 'Main menu: Hotels … Plan your trip' );
	check( ( await d.locator( '.header-button' ).getAttribute( 'href' ) || '' ).includes( '/list-your-business/' ), '"List your business" button' );
	check( await d.locator( '#masthead .ekt-lang a' ).count() === 2, 'Language switcher: English | Hausa' );
	const fonts = await d.evaluate( () => [ getComputedStyle( document.querySelector( '.ekt-hero h1' ) ).fontFamily, getComputedStyle( document.body ).fontFamily ] );
	check( /Unbounded/.test( fonts[ 0 ] ) && /Overpass/.test( fonts[ 1 ] ), 'Brand fonts: Unbounded headings, Overpass text' );
	check( await d.locator( '.ekt-arch img' ).count() === 1 && /public domain/.test( await d.locator( '.ekt-hero-photo figcaption' ).textContent() ), 'Arch-framed hero photo with credit' );
	await d.screenshot( { path: path.join( SHOTS, 'p11-home-1280.png' ), fullPage: true } );

	console.log( '2. Tabbed search with the keyboard' );
	await d.locator( '#ekt-tab-hotels' ).focus();
	await d.keyboard.press( 'ArrowRight' );
	check( await d.locator( '#ekt-tab-restaurants' ).getAttribute( 'aria-selected' ) === 'true' && await d.locator( '#ekt-panel-restaurants' ).isVisible() && ! await d.locator( '#ekt-panel-hotels' ).isVisible(), 'Arrow key moves to Restaurants and shows its form' );
	check( await d.evaluate( () => document.activeElement.id ) === 'ekt-tab-restaurants', 'Focus follows the selected tab' );
	await d.keyboard.press( 'End' );
	check( await d.locator( '#ekt-panel-todo' ).isVisible(), 'End key: Things to do' );
	const ring = await d.evaluate( () => getComputedStyle( document.activeElement ).outlineStyle + ' ' + getComputedStyle( document.activeElement ).outlineWidth );
	check( /solid 3px/.test( ring ), `Visible keyboard focus (${ ring })` );
	await d.keyboard.press( 'Home' );
	const inDate = new Date( Date.now() + 10 * 864e5 ).toISOString().slice( 0, 10 );
	await d.fill( '#ekt-h-in', inDate );
	await d.locator( '#ekt-h-in' ).dispatchEvent( 'change' );
	const outDate = await d.inputValue( '#ekt-h-out' );
	check( outDate > inDate, 'Check-out moves to the day after check-in' );
	await d.fill( '#ekt-h-g', '3' );
	await Promise.all( [ d.waitForNavigation(), d.click( '#ekt-panel-hotels .ekt-go' ) ] );
	check( d.url().includes( '/hotels/' ) && d.url().includes( 'checkin=' + inDate ) && d.url().includes( 'guests=3' ), 'Search hotels opens the hotel results with the dates and guests' );

	console.log( '3. Near you (phone location) and map preview' );
	const nc = await browser.newContext( { viewport: { width: 1280, height: 900 }, geolocation: { latitude: lat + 0.002, longitude: lng }, permissions: [ 'geolocation' ] } );
	const n = await nc.newPage();
	watch( n );
	await n.goto( BASE + '/' );
	await n.click( '[data-ekt-near-go]' );
	await n.waitForSelector( '[data-ekt-near-list] li', { timeout: 15000 } );
	const first = await n.locator( '[data-ekt-near-list] li' ).first().textContent();
	check( first.includes( stamp ) && /\d+ m away/.test( first ), 'Near you: the closest hotel first, with its distance' );
	await n.locator( '[data-ekt-map]' ).scrollIntoViewIfNeeded();
	await n.waitForSelector( '[data-ekt-map].leaflet-container', { timeout: 15000 } );
	check( await n.locator( '[data-ekt-map] .leaflet-interactive' ).count() > 5, 'Map preview loads when scrolled to, with pins' );

	console.log( '4. Phone: bottom navigation and Explore' );
	const pc = await browser.newContext( { ...devices[ 'Pixel 5' ] } );
	const p = await pc.newPage();
	watch( p );
	await p.goto( BASE + '/' );
	const bar = p.locator( '.ekt-bottom-nav' );
	check( await bar.isVisible() && ( await bar.locator( 'a span' ).allTextContents() ).join( ',' ) === 'Home,Explore,Map,Bookings,Account', 'Bottom bar on phones: Home, Explore, Map, Bookings, Account' );
	check( await bar.locator( 'a[aria-current="page"]' ).getAttribute( 'data-ekt-nav' ) === 'home', 'Current page highlighted' );
	await p.screenshot( { path: path.join( SHOTS, 'p11-home-phone.png' ) } );
	await p.screenshot( { path: path.join( SHOTS, 'p11-home-phone-full.png' ), fullPage: true } );
	await bar.locator( 'a[data-ekt-nav="explore"]' ).click();
	await p.waitForLoadState();
	check( p.url().includes( '/explore/' ) && await p.locator( '.ek-explore-tile' ).count() === 10 && await bar.locator( 'a[aria-current="page"]' ).getAttribute( 'data-ekt-nav' ) === 'explore', 'Explore: 10 tiles, Explore highlighted' );
	await p.screenshot( { path: path.join( SHOTS, 'p11-explore-phone.png' ), fullPage: true } );
	await bar.locator( 'a[data-ekt-nav="map"]' ).click();
	await p.waitForLoadState();
	check( p.url().includes( '/map/' ) && ! await p.locator( '.ekt-bottom-nav' ).isVisible(), 'The full-screen map keeps its own controls (no bottom bar over it)' );
	await p.goto( BASE + '/account/' );
	check( await p.locator( 'h1:visible' ).count() === 1, 'My Account: one heading (no duplicate title)' );
	await p.screenshot( { path: path.join( SHOTS, 'p11-account-phone.png' ), fullPage: true } );
	const dbar = await d.locator( '.ekt-bottom-nav' ).isVisible();
	check( ! dbar, 'No bottom bar on computers' );

	console.log( '5. English ↔ Hausa' );
	await d.goto( BASE + '/' );
	await d.locator( '#masthead .ekt-lang a[hreflang="ha"]' ).click();
	await d.waitForLoadState();
	check( /\/ha\/?$/.test( d.url() ) && await d.getAttribute( 'html', 'lang' ) === 'ha', 'Switcher opens the Hausa homepage (lang="ha")' );
	check( await d.locator( '.ekt-translation-note' ).isVisible(), 'Hausa homepage says it is still in English' );
	const haMenu = await d.locator( '#primary-menu a' ).evaluateAll( ( as ) => as.map( ( a ) => a.href ) );
	check( haMenu.length >= 7 && haMenu.filter( ( h ) => h.includes( '/ha/' ) ).length >= 7, 'Hausa menu leads to Hausa pages' );
	await d.goto( BASE + '/ha/hotels-ha/' );
	check( await d.locator( '.ek-needs-translation' ).isVisible() && await d.locator( 'meta[name="robots"][content*="noindex"]' ).count() === 1, 'Hausa page: "not translated yet" note, hidden from search engines' );
	check( await d.locator( '.ek-search, .ek-hotel-search, form' ).count() > 0, 'The hotel search still works on the Hausa page' );
	await d.screenshot( { path: path.join( SHOTS, 'p11-hausa-hotels-1280.png' ) } );
	await d.locator( '#masthead .ekt-lang a[hreflang="en"]' ).click();
	await d.waitForLoadState();
	check( d.url().replace( BASE, '' ).startsWith( '/hotels/' ), 'Switching back opens the English hotel page' );

	console.log( '6. Reduced motion' );
	const rc = await browser.newContext( { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' } );
	const r = await rc.newPage();
	await r.goto( BASE + '/' );
	const dur = await r.locator( '.ekt-card-link' ).first().evaluate( ( e ) => parseFloat( getComputedStyle( e ).transitionDuration ) );
	check( dur < 0.001, 'Animations switched off for people who ask for reduced motion' );

	console.log( '7. Login and wp-admin' );
	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const a = await ac.newPage();
	await a.goto( BASE + '/wp-login.php' );
	check( await a.evaluate( () => getComputedStyle( document.body ).backgroundColor ) === 'rgb(20, 27, 58)' && ( await a.locator( '.login h1 a' ).textContent() ).includes( 'Explore Katsina' ), 'Branded login page' );
	await a.screenshot( { path: path.join( SHOTS, 'p11-login.png' ) } );
	await a.fill( '#user_login', env.EK_ADMIN_USER );
	await a.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await a.click( '#wp-submit' );
	await a.waitForLoadState();
	await a.goto( BASE + '/wp-admin/admin.php?page=ek-approvals' );
	check( await a.locator( 'body.admin-color-ek-durbar' ).count() === 1, 'wp-admin in the Durbar Regalia colours' );
	await a.screenshot( { path: path.join( SHOTS, 'p11-admin.png' ) } );
	await a.goto( BASE + '/wp-admin/edit.php?post_type=page&lang=ha' );
	check( ( await a.locator( '.post-state' ).allTextContents() ).filter( ( t ) => t.includes( 'Needs Hausa translation' ) ).length >= 15, 'Pages list shows "Needs Hausa translation"' );

	console.log( '8. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 800 } } );
		const pg = await c.newPage();
		watch( pg );
		for ( const u of [ '/', '/ha/', '/explore/', '/hotels/', '/things-to-do/', '/attractions/gobarau-minaret/', '/plan-your-trip/', '/account/', '/list-your-business/', new URL( fx.url ).pathname ] ) {
			await pg.goto( BASE + u );
			await pg.waitForTimeout( 250 );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll brand & theme browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
