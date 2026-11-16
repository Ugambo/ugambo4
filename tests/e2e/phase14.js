/**
 * Phase 14 browser/HTTP checks: structured data and share tags on real pages, sitemap and robots.txt,
 * speed settings (minified files, compression, browser caching, lazy images, map library loaded
 * on demand, no shop scripts outside the shop), and the lock-down as an outsider sees it
 * (headers, XML-RPC, hidden version and usernames, login messages, weak passwords refused).
 *
 * Usage: node tests/e2e/phase14.js   (after `wp ek sample-data`)
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
const get = async ( u, opt = {}, tries = 3 ) => {
	try {
		return await fetch( BASE + u, { redirect: 'manual', ...opt } );
	} catch ( e ) { // A dropped connection on the local server: try again.
		if ( tries <= 1 ) {
			throw e;
		}
		await new Promise( ( r ) => setTimeout( r, 500 ) );
		return get( u, opt, tries - 1 );
	}
};
const schemaOf = ( html ) => [ ...html.matchAll( /<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g ) ].map( ( m ) => { try { return JSON.parse( m[ 1 ] ); } catch ( e ) { return { bad: true }; } } );
const types = ( list ) => list.flatMap( ( d ) => [ d[ '@type' ], ...( d[ '@graph' ] || [] ).map( ( g ) => g[ '@type' ] ) ] ).flat();

( async () => {
	wp( `eval 'EK\\Integrations::clear_page_cache();'` );
	const u = JSON.parse( wp( `eval '$f=function($t,$pt="ek_business"){$p=get_posts(["post_type"=>$pt,"title"=>$t,"posts_per_page"=>1,"fields"=>"ids","lang"=>""]);return $p?wp_make_link_relative(get_permalink($p[0])):"";};
		$ev=""; foreach(get_posts(["post_type"=>"ek_event","posts_per_page"=>-1,"lang"=>""]) as $e){ $d=EK\\Events::data($e->ID); if(!$d["tbc"]&&$d["start"]&&EK\\Tickets::types($e->ID)){ $ev=wp_make_link_relative(get_permalink($e)); break; } }
		$a=get_posts(["post_type"=>"ek_attraction","posts_per_page"=>1,"lang"=>""]); $t=get_posts(["post_type"=>"ek_tour","posts_per_page"=>1,"meta_key"=>"_ek_sample_set","lang"=>""]); $p=wc_get_products(["limit"=>1]);
		echo wp_json_encode(["hotel"=>$f("SAMPLE Crimson Gate Hotel"),"restaurant"=>$f("SAMPLE Mama Tuwo Kitchen"),"venue"=>$f("SAMPLE Grand Durbar Hall"),"attraction"=>wp_make_link_relative(get_permalink($a[0])),"event"=>$ev,"tour"=>$t?wp_make_link_relative(get_permalink($t[0])):"","product"=>wp_make_link_relative(get_permalink($p[0]->get_id())),"wpver"=>get_bloginfo("version")]);'` ).split( '\n' ).pop() );

	console.log( '1. Structured data, descriptions and share tags on real pages' );
	const expect = { hotel: 'Hotel', restaurant: 'Restaurant', venue: 'EventVenue', attraction: 'TouristAttraction', event: 'Event', tour: 'TouristTrip', product: 'Product' };
	for ( const [ k, type ] of Object.entries( expect ) ) {
		const html = await ( await get( u[ k ] ) ).text();
		const sc = schemaOf( html );
		check( types( sc ).includes( type ) && ! sc.some( ( d ) => d.bad ), `${ k }: ${ type } markup (valid JSON)` );
		check( /<meta name="description" content="[^"]{40,}/.test( html ) && /<meta property="og:image" content="http/.test( html ) && /<link rel="canonical"/.test( html ), `${ k }: description, share picture, canonical address` );
	}
	const rest = schemaOf( await ( await get( u.restaurant ) ).text() ).find( ( d ) => 'Restaurant' === d[ '@type' ] );
	check( rest && rest.hasMenu && rest.hasMenu.hasMenuSection.length >= 2, 'Restaurant markup carries its menu' );
	for ( const p of [ '/', '/hotels/', '/explore/', '/things-to-do/', '/top-hotels/', '/map/', '/events/', '/directory/' ] ) {
		const html = await ( await get( p ) ).text();
		check( /<meta name="description" content="[^"]{60,}/.test( html ) && /og:image" content="http/.test( html ), `${ p }: search description and share picture` );
	}
	const home = await ( await get( '/' ) ).text();
	check( /<title>Explore Katsina – Hotels, restaurants/.test( home ), 'Homepage title for search results' );

	console.log( '2. Sitemap and robots.txt' );
	const idx = await ( await get( '/sitemap_index.xml' ) ).text();
	check( [ 'ek_business', 'ek_attraction', 'ek_event', 'ek_tour', 'page-sitemap' ].every( ( s ) => idx.includes( s ) ), 'Sitemap lists businesses, attractions, events, tours and pages' );
	const biz = await ( await get( '/ek_business-sitemap.xml' ) ).text();
	check( biz.includes( BASE + u.hotel ), 'A live hotel is in the sitemap' );
	const pages = await ( await get( '/page-sitemap.xml' ) ).text();
	check( ! /\/(book|account|business-dashboard|check-in)\//.test( pages ), 'Private pages (booking, account, dashboard, check-in) are not in the sitemap' );
	check( /Sitemap: http.*sitemap_index\.xml/.test( await ( await get( '/robots.txt' ) ).text() ), 'robots.txt points search engines to the sitemap' );
	const clean = [ ...home.matchAll( /href="(http:\/\/localhost:8888[^"]*)"/g ) ].map( ( m ) => m[ 1 ] ).filter( ( h ) => /[?&](p|page_id|post_type)=/.test( h ) );
	check( 0 === clean.length, 'Clean addresses (no ?p= or ?page_id= links)' + ( clean.length ? ': ' + clean.slice( 0, 3 ).join( ' ' ) : '' ) );

	console.log( '3. Speed settings' );
	check( ! /jquery(\.min)?\.js/.test( home ) && ! /woocommerce\/assets\/js/.test( home ), 'Homepage: no jQuery or shop scripts' );
	check( /ek\.min\.css/.test( home ) && /theme\.min\.css/.test( home ) && /home\.min\.js/.test( home ), 'Homepage: minified CSS and JavaScript' );
	check( ! /wp-emoji-release|wp-embed(\.min)?\.js|oembed\/1\.0\/embed/.test( home ), 'No emoji script or embed links' );
	const imgs = [ ...home.matchAll( /<img [^>]*>/g ) ].map( ( m ) => m[ 0 ] );
	check( imgs.filter( ( i ) => /loading="lazy"/.test( i ) ).length >= imgs.length - 2 && imgs.some( ( i ) => /fetchpriority="high"/.test( i ) ), `Homepage: ${ imgs.filter( ( i ) => /loading="lazy"/.test( i ) ).length } of ${ imgs.length } pictures load lazily; the main picture first` );
	check( /sizes="(auto, )?\(min-width: 640px\) 300px, 50vw"/.test( home ), 'Card pictures: phones download the small copy' );
	const hotelHtml = await ( await get( u.hotel ) ).text();
	check( ! /<script[^>]+src="[^"]*leaflet/.test( hotelHtml ) && /fetchpriority="high"/.test( hotelHtml ), 'Hotel page: map library not loaded up front; first photo prioritised' );
	const js = await get( '/wp-content/plugins/explore-katsina-core/assets/js/search.min.js', { headers: { 'Accept-Encoding': 'gzip' } } );
	check( 'gzip' === js.headers.get( 'content-encoding' ), 'JavaScript sent compressed' );
	const css = await get( '/wp-content/plugins/explore-katsina-core/assets/css/ek.min.css', { headers: { 'Accept-Encoding': 'gzip' } } );
	check( /max-age=31536000/.test( css.headers.get( 'cache-control' ) || '' ) && 'gzip' === css.headers.get( 'content-encoding' ), 'CSS compressed and cached by browsers for a year' );
	check( /max-age=31536000/.test( ( await get( '/wp-content/plugins/explore-katsina-core/assets/fonts/overpass-latin.woff2' ) ).headers.get( 'cache-control' ) || '' ), 'Fonts cached by browsers' );
	await get( '/top-hotels/' );
	check( /super cache/.test( await ( await get( '/top-hotels/' ) ).text() ), 'Pages served from the page cache' );

	console.log( '4. Lock-down, as an outsider sees it' );
	const head = await get( '/' );
	check( 'nosniff' === head.headers.get( 'x-content-type-options' ) && 'SAMEORIGIN' === head.headers.get( 'x-frame-options' ) && head.headers.get( 'referrer-policy' ) && /geolocation=\(self\)/.test( head.headers.get( 'permissions-policy' ) || '' ), 'Security headers (also on cached pages)' );
	check( ! head.headers.get( 'x-powered-by' ) && ! head.headers.get( 'x-pingback' ), 'No server/PHP version or pingback headers' );
	check( ! /name="generator"/.test( home ) && ! home.includes( 'ver=' + u.wpver ) && ! /xmlrpc\.php\?rsd/.test( home ), `WordPress version (${ u.wpver }) not visible in pages` );
	check( 403 === ( await get( '/xmlrpc.php', { method: 'POST', body: '<?xml version="1.0"?><methodCall><methodName>system.listMethods</methodName></methodCall>' } ) ).status, 'XML-RPC refused' );
	check( 403 === ( await get( '/readme.html' ) ).status && 403 === ( await get( '/license.txt' ) ).status, 'readme.html / license.txt (show the version) blocked' );
	check( 404 === ( await get( '/?author=1' ) ).status && 404 === ( await get( '/wp-json/wp/v2/users' ) ).status, 'Usernames not discoverable (author pages, user list)' );
	check( 403 === ( await get( '/wp-content/uploads/' ) ).status, 'No folder listings' );
	wp( `eval 'file_put_contents(wp_upload_dir()["basedir"]."/ek-php-test.php","<?php echo \\"RAN\\";");'` );
	const php = await get( '/wp-content/uploads/ek-php-test.php' );
	check( 403 === php.status && ! ( await php.text() ).includes( 'RAN' ), 'A PHP file in uploads cannot run' );
	wp( `eval 'unlink(wp_upload_dir()["basedir"]."/ek-php-test.php");'` );

	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const c = await browser.newContext( { viewport: { width: 360, height: 780 }, deviceScaleFactor: 2 } );
	const p = await c.newPage();
	const loginMsg = async ( user ) => {
		await p.goto( BASE + '/wp-login.php' );
		await p.fill( '#user_login', user );
		await p.fill( '#user_pass', 'Wrong-password-123' );
		await Promise.all( [ p.waitForNavigation(), p.click( '#wp-submit' ) ] );
		return ( await p.locator( '#login_error' ).textContent() ).replace( /\d+ (attempts?|tries?)[^.]*\.?/gi, '' ).trim();
	};
	const known = await loginMsg( 'sample_crimson-gate-hotel' );
	const unknown = await loginMsg( 'nobody-' + Date.now() );
	check( known === unknown && /not correct/.test( known ), 'Login: same message for a wrong password and an unknown account' );
	await p.screenshot( { path: path.join( SHOTS, 'p14-login-error-360.png' ) } );
	await p.goto( BASE + '/wp-login.php?action=lostpassword' );
	await p.fill( '#user_login', 'nobody-' + Date.now() + '@example.test' );
	await Promise.all( [ p.waitForNavigation(), p.click( '#wp-submit' ) ] );
	check( /checkemail=confirm/.test( p.url() ), 'Lost password: unknown email gets the normal "check your email" page' );
	await p.goto( BASE + '/account/' );
	await p.fill( '#reg-name', 'SAMPLE Weak Password' );
	await p.fill( '#reg-email', `weak-${ Date.now() }@example.test` );
	await p.fill( '#reg-pass', 'password123' );
	await Promise.all( [ p.waitForNavigation(), p.click( 'button:has-text("Create account")' ) ] );
	check( /too easy to guess/.test( await p.locator( '.has-error .ek-error' ).first().textContent() ), 'Sign-up: a common password is refused with a clear message' );
	await p.locator( '#reg-pass' ).scrollIntoViewIfNeeded();
	await p.screenshot( { path: path.join( SHOTS, 'p14-weak-password-360.png' ) } );

	console.log( '5. Map library loads when the map is reached' );
	const scripts = [];
	p.on( 'request', ( r ) => scripts.push( r.url() ) );
	await p.goto( BASE + u.hotel );
	const early = scripts.some( ( s ) => /leaflet/.test( s ) );
	await p.locator( '[data-ek-mini-map]' ).scrollIntoViewIfNeeded();
	await p.waitForSelector( '[data-ek-mini-map].leaflet-container', { timeout: 10000 } ).catch( () => {} );
	check( ! early && scripts.some( ( s ) => /leaflet\.js/.test( s ) ) && await p.locator( '[data-ek-mini-map].leaflet-container' ).count() === 1, 'Hotel map draws when scrolled to, not before' );
	await p.goto( BASE + '/hotels/?view=map' );
	await p.locator( '[data-ek-results-map]' ).scrollIntoViewIfNeeded();
	await p.waitForSelector( '[data-ek-results-map].leaflet-container', { timeout: 10000 } ).catch( () => {} );
	check( await p.locator( '[data-ek-results-map] .ek-pin' ).count() >= 1, 'Hotel search map still shows its pins' );

	await browser.close();
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll SEO, speed & lock-down browser checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
