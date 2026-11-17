/**
 * Phase 15: the "Delete all SAMPLE data" button in Explore Katsina → Settings removes every SAMPLE item and
 * keeps everything else (real guide content, pages, settings). Afterwards the SAMPLE data is created again
 * (`wp ek sample-data`) so the other tests keep working. Run it last.
 *
 * Usage: node tests/e2e/phase15-delete-sample.js
 */
const { chromium } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const ROOT = path.join( __dirname, '..', '..' );
const SHOTS = path.join( __dirname, 'screenshots' );
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );
const wp = ( cmd ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp ${ cmd }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim().split( '\n' ).pop();

let failures = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };
const counts = () => JSON.parse( wp( `eval 'global $wpdb; echo wp_json_encode( array( "sample" => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_title LIKE \\"SAMPLE%\\" AND post_type IN (\\"ek_business\\",\\"ek_tour\\",\\"ek_event\\",\\"product\\")" ), "attractions" => (int) wp_count_posts( "ek_attraction" )->publish, "durbar" => (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type=\\"ek_event\\" AND post_status=\\"publish\\" AND post_title LIKE \\"%Durbar%\\"" ), "pages" => (int) wp_count_posts( "page" )->publish ) );'` ) );

( async () => {
	const before = counts();
	check( before.sample > 0, `Before: ${ before.sample } SAMPLE businesses, tours, events and products` );
	const browser = await chromium.launch();
	const p = await ( await browser.newContext( { viewport: { width: 1280, height: 900 } } ) ).newPage();
	await p.goto( BASE + '/wp-login.php' );
	await p.fill( '#user_login', env.EK_ADMIN_USER );
	await p.fill( '#user_pass', env.EK_ADMIN_PASSWORD );
	await Promise.all( [ p.waitForNavigation(), p.click( '#wp-submit' ) ] );
	await p.goto( BASE + '/wp-admin/admin.php?page=ek-settings' );
	p.on( 'dialog', ( d ) => d.accept() );
	await Promise.all( [ p.waitForNavigation(), p.click( 'button:has-text("Delete all SAMPLE data")' ) ] );
	check( await p.locator( '.notice', { hasText: 'type DELETE' } ).count() === 1 && counts().sample === before.sample, 'Without typing DELETE nothing is deleted' );
	await p.locator( '#ek-del-confirm' ).scrollIntoViewIfNeeded();
	await p.screenshot( { path: path.join( SHOTS, 'p15-delete-sample-1280.png' ) } );
	await p.fill( '#ek-del-confirm', 'DELETE' );
	await Promise.all( [ p.waitForNavigation(), p.click( 'button:has-text("Delete all SAMPLE data")' ) ] );
	const after = counts();
	check( await p.locator( '.notice', { hasText: 'SAMPLE data deleted' } ).count() === 1 && 0 === after.sample, 'Typed DELETE: every SAMPLE item is gone' );
	check( after.attractions === before.attractions && after.durbar === before.durbar && after.pages === before.pages, `Guide content and pages kept (${ after.attractions } attractions, the Sallah Durbar, ${ after.pages } pages)` );
	check( await p.locator( 'button:has-text("Delete all SAMPLE data")' ).count() === 0, 'The button disappears once there is nothing left to delete' );
	const home = await ( await fetch( BASE + '/' ) ).text();
	check( ! /SAMPLE (Crimson Gate|Mama Tuwo|Grand Durbar|Brass Lantern)/.test( home ), 'Homepage no longer shows SAMPLE businesses' );
	await browser.close();
	wp( 'ek sample-data' );
	check( counts().sample > 0, 'SAMPLE data created again for the other tests' );
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nDelete SAMPLE data checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); try { wp( 'ek sample-data' ); } catch ( x ) {} process.exit( 1 ); } );
