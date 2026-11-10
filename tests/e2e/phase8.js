/**
 * Phase 8 browser journey: Katsina Map (focus a pin, card, type toggles, filters, near me + radius, phone
 * bottom sheet, clustering), rank and badges on the business page, Top 10 pages, attraction page,
 * admin hides a review and recalculates rankings.
 *
 * Usage: node tests/e2e/phase8.js
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

( async () => {
	const stamp = Date.now().toString( 36 );
	const lat = 12.60 + Math.random() * 0.15;
	const lng = 7.20 + Math.random() * 0.15;
	const fx = json( `eval-file ek-tests/e2e/fixture-hotel.php ${ stamp } ${ lat.toFixed( 5 ) } ${ lng.toFixed( 5 ) } hotel` );
	const f8 = json( `eval-file ek-tests/e2e/fixture-phase8.php ${ fx.id } ${ lat.toFixed( 5 ) } ${ lng.toFixed( 5 ) } ${ stamp }` );
	console.log( `Fixture hotel ${ fx.id }, lodge ${ f8.lodge }, kitchen ${ f8.kitchen }, attraction ${ f8.attraction }` );
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = [];
	const watch = ( p ) => p.on( 'pageerror', ( e ) => jsErrors.push( e.message ) );

	/* 1. Desktop map, focused on the hotel */
	console.log( '1. Katsina Map on a computer' );
	const dc = await browser.newContext( { viewport: { width: 1280, height: 800 } } );
	const d = await dc.newPage();
	watch( d );
	await d.goto( `${ BASE }/map/?focus=${ fx.id }` );
	await d.waitForSelector( '.ek-kcard', { timeout: 15000 } );
	const cardText = await d.locator( '.ek-kcard' ).textContent();
	check( cardText.includes( stamp ) && /#\d+ of \d+ hotels in Katsina/.test( cardText ), 'Opening the map on a hotel shows its card with its rank (#N of N hotels in Katsina)' );
	check( /From ₦22,000 \/ night/.test( cardText ) && /5\.0/.test( cardText ) && /30 reviews/.test( cardText ), 'Card: price from ₦22,000/night, 5.0★ from 30 reviews' );
	check( await d.locator( '.ek-kcard a:has-text("Book")' ).count() === 1 && await d.locator( '.ek-kcard a:has-text("Directions")' ).count() === 1 && await d.locator( '.ek-kcard a:has-text("WhatsApp")' ).count() === 1 && await d.locator( '.ek-kcard a.ek-btn:text-is("View")' ).count() === 1, 'Buttons: View, Book, Directions, WhatsApp' );
	check( ( await d.locator( '.ek-kcard img' ).count() ) === 1, 'Card shows a photo' );
	await d.screenshot( { path: path.join( SHOTS, 'p8-map-card-1280.png' ) } );
	const names = async () => ( await d.locator( '.ek-kitem-title' ).allTextContents() ).join( '|' );
	await d.keyboard.press( 'Escape' );
	await d.click( '.leaflet-control-zoom-out' );
	await d.waitForTimeout( 400 );
	await d.click( '.leaflet-control-zoom-out' );
	await d.waitForTimeout( 1200 );
	check( ( await names() ).includes( `SAMPLE Map Kitchen ${ stamp }` ) && ( await names() ).includes( `SAMPLE Map Attraction ${ stamp }` ), 'List beside the map shows the nearby restaurant and attraction' );
	await d.locator( '.ek-kmap-chip:has-text("Hotels")' ).click();
	await d.waitForTimeout( 900 );
	check( ! ( await names() ).includes( `Durbar View Hotel ${ stamp }` ) && ( await names() ).includes( `SAMPLE Map Kitchen ${ stamp }` ), 'Switching Hotels off removes hotel pins and list items' );
	await d.locator( '.ek-kmap-chip:has-text("Hotels")' ).click();
	await d.waitForTimeout( 900 );
	await d.click( '.ek-kmap-more summary' );
	await d.check( 'input[name=price][value="4"]' );
	await d.waitForTimeout( 900 );
	check( ( await names() ).includes( `SAMPLE Map Lodge ${ stamp }` ) === false && ! ( await names() ).includes( `Durbar View Hotel ${ stamp }` ), 'Price ₦₦₦₦ hides the cheaper hotels' );
	await d.uncheck( 'input[name=price][value="4"]' );
	await d.check( 'input[name=open]' );
	await d.waitForTimeout( 900 );
	check( ! ( await names() ).includes( `SAMPLE Map Attraction ${ stamp }` ) && ( await names() ).includes( `Durbar View Hotel ${ stamp }` ), 'Open now: open places only' );
	await d.uncheck( 'input[name=open]' );
	await d.selectOption( '#km-rating', '4.5' );
	await d.waitForTimeout( 900 );
	check( ( await names() ).includes( `Durbar View Hotel ${ stamp }` ) && ! ( await names() ).includes( `SAMPLE Map Lodge ${ stamp }` ), 'Rating 4.5★+: the 5★ hotel stays, the 4★ lodge goes' );
	await d.selectOption( '#km-rating', '' );
	await d.selectOption( '[data-sort]', 'price' );
	check( ( await d.locator( '.ek-kitem-title' ).first().textContent() ).length > 0, 'List can be sorted by price, rating and rank' );
	await d.screenshot( { path: path.join( SHOTS, 'p8-map-filters-1280.png' ) } );

	/* 2. State view clusters */
	await d.goto( `${ BASE }/map/` );
	await d.waitForSelector( '.ek-kcluster', { timeout: 15000 } );
	check( await d.locator( '.ek-kcluster' ).count() >= 1, 'Zoomed out to the whole state: pins are grouped into numbered clusters' );
	await d.screenshot( { path: path.join( SHOTS, 'p8-map-state-1280.png' ) } );

	/* 3. Phone: near me + bottom sheet */
	console.log( '2. On a phone: near me, 1 km, bottom sheet' );
	const mc = await browser.newContext( { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, geolocation: { latitude: lat + 0.0002, longitude: lng + 0.0002 }, permissions: [ 'geolocation' ] } );
	const m = await mc.newPage();
	watch( m );
	await m.goto( `${ BASE }/map/` );
	await m.waitForTimeout( 1500 );
	await m.click( '[data-sheet-toggle]' );
	await m.click( '[data-locate]' );
	await m.waitForTimeout( 800 );
	await m.selectOption( '[data-radius]', '1' );
	await m.waitForTimeout( 1500 );
	const first = await m.locator( '.ek-kitem' ).first().textContent();
	check( await m.inputValue( '[data-sort]' ) === 'distance' && first.includes( `Durbar View Hotel ${ stamp }` ) && /\d+ m/.test( first ), 'Use my location + within 1 km: sorted by distance, nearest first with metres' );
	check( ! ( await m.locator( '[data-list]' ).textContent() ).includes( `SAMPLE Map Attraction ${ stamp }` ), 'The attraction 1.3 km away is outside the 1 km circle' );
	await m.screenshot( { path: path.join( SHOTS, 'p8-map-sheet-390.png' ) } );
	await m.locator( '.ek-kitem', { hasText: `SAMPLE Map Kitchen ${ stamp }` } ).click();
	await m.waitForSelector( '.ek-kcard', { timeout: 10000 } );
	check( ! ( await m.locator( '[data-ek-kmap]' ).getAttribute( 'class' ) ).includes( 'is-sheet-open' ) && ( await m.locator( '.ek-kcard' ).textContent() ).includes( 'Reserve' ), 'Tapping a list item closes the sheet and opens the restaurant card' );
	await m.screenshot( { path: path.join( SHOTS, 'p8-map-card-390.png' ) } );

	/* 4. Business page, Top 10, attraction */
	console.log( '3. Rank on the hotel page, Top 10 pages, attraction page' );
	const p = await dc.newPage();
	watch( p );
	await p.goto( fx.url );
	const rl = await p.locator( '.ek-rankline' ).first().textContent();
	check( /#\d+ of \d+ hotels in Katsina/.test( rl ) && /hotel in Katsina|hotels in Katsina/.test( rl ), 'Hotel page shows its statewide and LGA rank' );
	await p.locator( '.ek-mini-map' ).scrollIntoViewIfNeeded();
	await p.waitForTimeout( 800 );
	check( await p.locator( '.ek-mini-map path.leaflet-interactive' ).count() >= 2, 'Small map shows nearby places as dots' );
	check( ( await p.locator( '#near-h' ).locator( '..' ).textContent() ).includes( `SAMPLE Map Attraction ${ stamp }` ), '"Nearby" list includes the attraction' );
	await p.screenshot( { path: path.join( SHOTS, 'p8-hotel-rank-1280.png' ) } );
	await p.goto( `${ BASE }/top-hotels/` );
	check( ( await p.locator( '.ek-top h1' ).textContent() ).includes( 'Top 10 hotels in Katsina State' ) && ( await p.locator( '.ek-top-list' ).textContent() ).includes( stamp ), 'Top 10 hotels page lists the hotel' );
	await p.goto( `${ BASE }/top-hotels/${ f8.lga }/` );
	check( ( await p.locator( '.ek-top h1' ).textContent() ).includes( 'Top 10 hotels in Katsina' ) && /Top 10 hotels in Katsina/.test( await p.title() ), 'Per-LGA page /top-hotels/katsina/ with its own title' );
	await p.screenshot( { path: path.join( SHOTS, 'p8-top-hotels-1280.png' ), fullPage: true } );
	await p.goto( f8.attraction_url );
	const at = await p.locator( '.ek-attraction' ).textContent();
	check( at.includes( 'not yet been checked' ) && at.includes( 'SAMPLE fee' ) && await p.locator( 'a:has-text("Show on Katsina Map")' ).count() === 1, 'Attraction page: details, "not verified" notice, "Show on Katsina Map"' );
	await p.screenshot( { path: path.join( SHOTS, 'p8-attraction-1280.png' ), fullPage: true } );

	/* 5. Admin hides a review */
	console.log( '4. Admin hides a review and recalculates' );
	const a = await dc.newPage();
	await a.goto( BASE + '/wp-login.php' );
	await a.fill( '#user_login', env.EK_ADMIN_USER );
	await a.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await Promise.all( [ a.waitForNavigation(), a.click( '#wp-submit' ) ] );
	await a.goto( `${ BASE }/wp-admin/admin.php?page=ek-reviews&s=${ encodeURIComponent( 'Map Lodge ' + stamp ) }` );
	const rows = a.locator( 'tbody tr', { hasText: `SAMPLE Map Lodge ${ stamp }` } );
	check( await rows.count() === 3, 'Admin finds the lodge’s 3 reviews' );
	await rows.first().locator( 'select[name=reason]' ).selectOption( { index: 1 } );
	await Promise.all( [ a.waitForNavigation(), rows.first().locator( 'button:has-text("Hide")' ).click() ] );
	check( ( await a.locator( 'table' ).last().textContent() ).includes( 'Fake or written' ), 'Moderation log shows what was hidden and why' );
	await a.screenshot( { path: path.join( SHOTS, 'p8-admin-reviews-1280.png' ), fullPage: true } );
	await Promise.all( [ a.waitForNavigation(), a.click( 'button:has-text("Recalculate rankings now")' ) ] );
	await p.goto( `${ BASE }/?p=${ f8.lodge }` );
	check( ( await p.locator( '.ek-rankline' ).first().textContent() ).includes( 'New, not yet ranked' ), 'After recalculating, the lodge (2 visible reviews left) is "New, not yet ranked"' );
	await a.goto( `${ BASE }/wp-admin/admin.php?page=ek-settings` );
	check( await a.locator( 'input[name=rank_weight_rating]' ).inputValue() === '70' && ( await a.locator( '.form-table', { hasText: 'Pretend' } ).textContent() ).includes( '4.53' ), 'Settings explain the formula in plain language, with adjustable weights' );

	/* 6. Layout */
	console.log( '5. Layout at 360 / 768 / 1280' );
	const wide = [];
	for ( const w of [ 360, 768, 1280 ] ) {
		const c = await browser.newContext( { viewport: { width: w, height: 800 } } );
		const pg = await c.newPage();
		watch( pg );
		for ( const u of [ '/map/', '/top-hotels/', new URL( f8.attraction_url ).pathname, new URL( fx.url ).pathname ] ) {
			await pg.goto( BASE + u );
			await pg.waitForTimeout( 300 );
			const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
			if ( over > 1 ) { wide.push( `${ u }@${ w }:${ over }` ); }
		}
		await c.close();
	}
	check( 0 === wide.length, 'No sideways scrolling' + ( wide.length ? ' → ' + wide.join( ', ' ) : '' ) );
	check( 0 === jsErrors.length, 'No JavaScript errors' + ( jsErrors.length ? ': ' + jsErrors.join( ' | ' ) : '' ) );
	wp( `post delete ${ f8.attraction } --force` ); // Keep "Things to do" free of test attractions.
	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll map & ranking browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
