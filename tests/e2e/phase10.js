/**
 * Phase 10 browser journey: "Things to do" with category filter, an attraction page (photos and
 * credits, history, "not yet confirmed" hours/fee, small map, nearest hotels/restaurants/event
 * centres, sources), a Daura attraction on a phone, the Sallah Durbar festival (date TBC), the
 * "Plan your trip" pages and the safety page, Stories, the attraction on the Katsina Map, and the
 * attraction editor in wp-admin.
 *
 * Usage: node tests/e2e/phase10.js   (after `wp ek import-guide`)
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
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };

( async () => {
	wp( 'ek import-guide' );
	const gobarau = wp( 'post list --post_type=ek_attraction --name=gobarau-minaret --field=ID' ).split( '\n' ).pop();
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );

	console.log( '1. Things to do' );
	const dc = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const d = await dc.newPage();
	watch( d );
	await d.goto( `${ BASE }/things-to-do/` );
	const cards = await d.locator( '.ek-attr-card h3' ).allTextContents();
	check( cards.length >= 10 && ! cards.some( ( c ) => c.startsWith( 'SAMPLE' ) ) && cards.includes( 'Gobarau Minaret' ) && cards.includes( 'Kusugu Well (Daura)' ), `Lists the attractions (${ cards.length })` );
	await d.screenshot( { path: path.join( SHOTS, 'p10-things-to-do-1280.png' ), fullPage: true } );
	await d.locator( '.ek-chip:has-text("Nature & dams")' ).click();
	await d.waitForLoadState();
	const nature = await d.locator( '.ek-attr-card h3' ).allTextContents();
	check( nature.includes( 'Zobe Dam' ) && nature.includes( 'Ajiwa Dam' ) && ! nature.includes( 'Gobarau Minaret' ), 'Filter "Nature & dams": the two dams only' );

	console.log( '2. Attraction page (computer)' );
	await d.goto( `${ BASE }/attractions/gobarau-minaret/` );
	await d.locator( '.ek-mini-map' ).scrollIntoViewIfNeeded();
	await d.waitForSelector( '.ek-mini-map.leaflet-container', { timeout: 15000 } );
	const body = await d.locator( 'main' ).textContent();
	check( await d.locator( 'h2:text-is("History")' ).count() === 1 && body.includes( 'Muhammadu Korau' ), 'History section' );
	check( ( body.match( /Not yet confirmed\. Please check locally/g ) || [] ).length === 2, 'Opening hours and entry fee: "Not yet confirmed"' );
	check( body.includes( 'not yet been checked on the ground' ), '"Not verified on the ground" notice' );
	check( await d.locator( '[data-ek-nearest-type]' ).count() === 3 && body.includes( 'Where to stay' ) && body.includes( 'Where to eat' ), 'Nearest hotels, restaurants and event centres' );
	const dist = await d.locator( '[data-ek-nearest-type="hotel"] li' ).first().textContent().catch( () => '' );
	check( '' === dist || /(m|km) away/.test( dist ), 'Distances shown' + ( dist ? '' : ' (no hotels listed yet)' ) );
	check( await d.locator( '#ek-sources-h + ul a[href*="wikipedia.org/wiki/Gobarau_Minaret"]' ).count() === 1, 'Sources with links' );
	const photos = await d.locator( '.ek-gallery img' ).count();
	if ( photos ) {
		await d.locator( '.ek-credits summary' ).first().click();
		check( /CC BY|Public domain|CC0/.test( await d.locator( '.ek-credits' ).first().textContent() ), `Photos (${ photos }) with credits` );
	} else {
		console.log( '  · Commons photos not downloaded yet: photo checks skipped' );
	}
	await d.screenshot( { path: path.join( SHOTS, 'p10-attraction-1280.png' ), fullPage: true } );

	console.log( '3. Daura attraction on a phone' );
	const pc = await browser.newContext( { ...devices[ 'Pixel 5' ] } );
	const p = await pc.newPage();
	watch( p );
	await p.goto( `${ BASE }/attractions/kusugu-well-daura/` );
	const kt = await p.locator( 'main' ).textContent();
	check( kt.includes( 'According to the legend' ) && kt.includes( 'Approximate location' ), 'Legend presented as legend; approximate pin flagged' );
	check( kt.includes( 'Emir of Daura' ), 'The Emir of Daura\'s Palace appears as a nearby attraction' );
	await p.screenshot( { path: path.join( SHOTS, 'p10-kusugu-phone.png' ), fullPage: true } );

	console.log( '4. Sallah Durbar festival' );
	await d.goto( `${ BASE }/events/` );
	const ev = await d.locator( '.ek-event-card:has-text("Sallah Durbar, Katsina")' ).textContent().catch( () => '' );
	check( ev.includes( 'Date to be confirmed' ) && /Festival/i.test( ev ), 'Events page: Sallah Durbar, Festival, date to be confirmed' );
	await d.goto( `${ BASE }/events/sallah-durbar-katsina/` );
	const et = await d.locator( 'main' ).textContent();
	check( et.includes( 'Hawan Sallah' ) && et.includes( 'officially announced' ) && et.includes( '2021' ), 'Festival page: what happens, dates follow the moon, past suspensions mentioned' );
	check( await d.locator( 'main a[href*="/attractions/emir-of-katsina-palace/"]' ).count() >= 1, 'Links to the Emir\'s palace' );
	await d.screenshot( { path: path.join( SHOTS, 'p10-durbar-1280.png' ), fullPage: true } );

	console.log( '5. Plan your trip' );
	await d.goto( `${ BASE }/plan-your-trip/` );
	for ( const t of [ 'Getting there', 'Getting around', 'Etiquette and dress', 'Best time to visit', 'Itineraries', 'Safety and travel tips' ] ) {
		check( await d.locator( `main a:has-text("${ t }")` ).count() >= 1, `Link: ${ t }` );
	}
	await d.screenshot( { path: path.join( SHOTS, 'p10-plan-your-trip-1280.png' ), fullPage: true } );
	await d.locator( 'main a:has-text("Itineraries")' ).first().click();
	await d.waitForLoadState();
	check( /One day/.test( await d.locator( 'main' ).textContent() ) && /Three days/.test( await d.locator( 'main' ).textContent() ), 'Itineraries: one day and three days' );
	await p.goto( `${ BASE }/plan-your-trip/safety-and-travel-tips/` );
	const official = await p.locator( 'main a[href*="gov.uk"], main a[href*="travel.state.gov"], main a[href*="travel.gc.ca"], main a[href*="smartraveller"]' ).count();
	check( 4 === official, 'Safety page: four official travel advisories' );
	await p.screenshot( { path: path.join( SHOTS, 'p10-safety-phone.png' ), fullPage: true } );
	await p.goto( `${ BASE }/plan-your-trip/getting-around/` );
	await p.screenshot( { path: path.join( SHOTS, 'p10-getting-around-phone.png' ), fullPage: true } );

	console.log( '6. Stories and the map' );
	await d.goto( `${ BASE }/stories/` );
	check( await d.locator( '.ek-chip' ).count() === 6, 'Stories page with topics: History, Culture, Food, Crafts, Travel guides' );
	await d.goto( `${ BASE }/map/?focus=${ gobarau }` );
	await d.waitForSelector( '.ek-kcard', { timeout: 15000 } );
	check( ( await d.locator( '.ek-kcard' ).textContent() ).includes( 'Gobarau Minaret' ), 'Katsina Map: Gobarau Minaret pin and card' );

	console.log( '7. wp-admin attraction editor' );
	const ac = await browser.newContext( { viewport: { width: 1280, height: 900 } } );
	const a = await ac.newPage();
	await a.goto( BASE + '/wp-login.php' );
	await a.fill( '#user_login', env.EK_ADMIN_USER );
	await a.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await a.click( '#wp-submit' );
	await a.waitForLoadState();
	await a.goto( `${ BASE }/wp-admin/post.php?post=${ gobarau }&action=edit` );
	await a.waitForSelector( '#ek-attraction', { timeout: 20000 } );
	const box = a.locator( '#ek-attraction' );
	check( await box.locator( 'textarea[name="ek_history"]' ).count() === 1 && await box.locator( 'textarea[name="ek_sources"]' ).count() === 1 && await box.locator( 'textarea[name="ek_best_time"]' ).count() === 1, 'Editor: history, best time and sources fields' );
	check( await box.locator( '[data-ek-gallery-pick]' ).count() === 1, 'Editor: "Choose photos" gallery button' );
	await box.screenshot( { path: path.join( SHOTS, 'p10-admin-attraction.png' ) } );

	console.log( '8. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 800 } } );
		const pg = await c.newPage();
		watch( pg );
		for ( const u of [ '/things-to-do/', '/attractions/gobarau-minaret/', '/events/sallah-durbar-katsina/', '/plan-your-trip/getting-around/', '/stories/' ] ) {
			await pg.goto( BASE + u );
			await pg.waitForTimeout( 300 );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll guide browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
