/**
 * Phase 15 sweep: "test all pages, the map and every dashboard at 360px, 768px and 1280px; check all
 * emails, links, and the language switcher".
 *
 *  A. Every page in the brief (English and Hausa), one of each kind of listing, the map and the shop at
 *     360 / 768 / 1280: opens, no PHP errors, no sideways scrolling, no JavaScript errors.
 *  B. Every dashboard at 360 / 768 / 1280: all sections of a hotel, restaurant, event centre and directory
 *     business; every My Account tab; the ticket check-in page; every Explore Katsina page in wp-admin.
 *  C. Every email the site can send (one of each, from the SAMPLE data): branded, no "%s" or PHP
 *     leftovers, tagged with its type, and every link in it works.
 *  D. Every link on the site (crawled from the homepage and the sitemap) opens (no 404 / 500).
 *  E. The English ⇄ Hausa switcher on every page.
 *
 * Writes docs/phase15-checks.md. Usage: node tests/e2e/phase15-sweep.js
 */
const { chromium } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );
const fs = require( 'fs' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const MAIL = process.env.EK_MAIL || 'http://localhost:8025';
const SHOTS = path.join( __dirname, 'screenshots' );
const ROOT = path.join( __dirname, '..', '..' );
fs.mkdirSync( SHOTS, { recursive: true } );
const env = Object.fromEntries( fs.readFileSync( path.join( ROOT, '.env' ), 'utf8' ).split( '\n' ).filter( ( l ) => l.includes( '=' ) ).map( ( l ) => [ l.slice( 0, l.indexOf( '=' ) ), l.slice( l.indexOf( '=' ) + 1 ).replace( /^"|"$/g, '' ) ] ) );
const wp = ( cmd ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp ${ cmd }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim();
const fx = ( ...a ) => JSON.parse( wp( `eval-file ek-tests/e2e/fixture-phase15.php ${ a.map( ( x ) => `'${ x }'` ).join( ' ' ) }` ).split( '\n' ).pop() );

let failures = 0;
const report = [];
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); report.push( ( c ? '- ✔ ' : '- ✘ ' ) + m ); if ( ! c ) { failures++; } };
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
const BAD = /wpdberror|Fatal error|critical error|Warning: |Notice: |Deprecated: |Parse error/;
const WIDTHS = [ 360, 768, 1280 ];

( async () => {
	const proxy = process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } } : {};
	const browser = await chromium.launch( proxy );
	const jsErrors = new Set();
	const s = fx( 'sweep-urls' );
	const guest = fx( 'guest' );
	const ev = fx( 'event', 'sweep' + Date.now().toString( 36 ) );
	wp( `eval 'EK\\Integrations::clear_page_cache();'` );

	/** Open each URL at each width in a context; return problems. */
	const sweep = async ( urls, state = null, opts = {} ) => {
		const bad = [];
		const wide = [];
		let n = 0;
		for ( const w of WIDTHS ) {
			const ctx = await browser.newContext( { viewport: { width: w, height: 900 }, ...( state ? { storageState: state } : {} ) } );
			const pg = await ctx.newPage();
			pg.on( 'pageerror', ( e ) => jsErrors.add( `${ pg.url() }: ${ e.message }` ) );
			for ( const u of urls ) {
				const r = await pg.goto( BASE + u, { waitUntil: 'load' } ).catch( () => null );
				n++;
				const html = r ? await pg.content() : '';
				if ( ! r || r.status() >= 400 || BAD.test( html ) ) {
					bad.push( `${ u }@${ w }(${ r ? r.status() : 'no response' })` );
				}
				if ( ! opts.noOverflow ) {
					const over = await pg.evaluate( () => document.documentElement.scrollWidth - window.innerWidth );
					if ( over > 1 ) {
						wide.push( `${ u }@${ w }:${ over }px` );
					}
				}
			}
			await ctx.close();
		}
		return { bad, wide, n };
	};
	const loginState = async ( user, pass, where = '/wp-login.php' ) => {
		const ctx = await browser.newContext();
		const pg = await ctx.newPage();
		await pg.goto( BASE + where );
		await pg.fill( '#user_login', user );
		await pg.fill( '#user_pass', pass );
		await Promise.all( [ pg.waitForNavigation(), pg.click( '#wp-submit' ) ] );
		const st = await ctx.storageState();
		await ctx.close();
		return st;
	};

	/* ---------------- A. Pages ---------------- */
	console.log( 'A. Every page at 360 / 768 / 1280' );
	report.push( '## A. Pages at 360 / 768 / 1280' );
	const publicPages = [ ...Object.entries( s.en ).filter( ( [ k ] ) => ! [ 'account', 'dashboard', 'checkin', 'book' ].includes( k ) ).map( ( [ , u ] ) => u ), ...Object.values( s.items ), '/map/?focus=' + s.biz.hotel.id ];
	const pa = await sweep( publicPages );
	check( 0 === pa.bad.length, `${ publicPages.length } English pages and listings open without errors (${ pa.n } page views)` + ( pa.bad.length ? ' → ' + pa.bad.join( ', ' ) : '' ) );
	check( 0 === pa.wide.length, 'No sideways scrolling' + ( pa.wide.length ? ' → ' + pa.wide.join( ', ' ) : '' ) );
	const hausa = Object.values( s.ha );
	const ph = await sweep( hausa );
	check( 0 === ph.bad.length && 0 === ph.wide.length, `${ hausa.length } Hausa pages open without errors or sideways scrolling` + ( ph.bad.length + ph.wide.length ? ' → ' + [ ...ph.bad, ...ph.wide ].join( ', ' ) : '' ) );

	/* ---------------- B. Dashboards ---------------- */
	console.log( 'B. Every dashboard at 360 / 768 / 1280' );
	report.push( '', '## B. Dashboards at 360 / 768 / 1280' );
	for ( const [ kind, b ] of Object.entries( s.biz ) ) {
		const st = await loginState( b.user, b.pass, '/business-dashboard/' );
		const urls = b.sections.map( ( sec ) => `/business-dashboard/?section=${ sec }&business=${ b.id }` );
		const r = await sweep( urls, st );
		check( 0 === r.bad.length && 0 === r.wide.length, `Business dashboard (${ kind }): all ${ b.sections.length } sections` + ( r.bad.length + r.wide.length ? ' → ' + [ ...r.bad, ...r.wide ].join( ', ' ) : '' ) );
	}
	const gst = await loginState( guest.user, guest.pass );
	const acc = await sweep( [ 'bookings', 'reservations', 'favourites', 'profile' ].map( ( t ) => `/account/?tab=${ t }` ), gst );
	check( 0 === acc.bad.length && 0 === acc.wide.length, 'My Account: bookings, reservations, favourites, profile' + ( acc.bad.length + acc.wide.length ? ' → ' + [ ...acc.bad, ...acc.wide ].join( ', ' ) : '' ) );
	const sst = await loginState( ev.staff, ev.staff_pass );
	const ci = await sweep( [ '/check-in/' ], sst );
	check( 0 === ci.bad.length && 0 === ci.wide.length, 'Ticket check-in page (staff)' + ( ci.bad.length + ci.wide.length ? ' → ' + [ ...ci.bad, ...ci.wide ].join( ', ' ) : '' ) );
	const ast = await loginState( env.EK_ADMIN_USER, env.EK_ADMIN_PASSWORD );
	const adminPages = [ 'ek-approvals', 'ek-settings', 'ek-sales', 'ek-revenue', 'ek-payouts', 'ek-invoices', 'ek-refunds', 'ek-complaints', 'ek-reviews', 'ek-reports', 'ek-ads', 'ek-partners', 'ek-enquiries', 'ek-log' ].map( ( p ) => `/wp-admin/admin.php?page=${ p }` );
	const ad = await sweep( [ ...adminPages, `/wp-admin/admin.php?page=ek-approvals&business=${ s.biz.hotel.id }`, '/wp-admin/edit.php?post_type=ek_attraction', '/wp-admin/edit.php?post_type=ek_event', '/wp-admin/edit.php?post_type=ek_tour' ], ast );
	check( 0 === ad.bad.length, `wp-admin: all ${ adminPages.length } Explore Katsina pages + editors open without errors` + ( ad.bad.length ? ' → ' + ad.bad.join( ', ' ) : '' ) );
	check( 0 === ad.wide.length, 'wp-admin: no sideways scrolling (wide tables scroll inside their own box)' + ( ad.wide.length ? ' → ' + ad.wide.join( ', ' ) : '' ) );

	/* ---------------- C. Emails ---------------- */
	console.log( 'C. Every email' );
	report.push( '', '## C. Emails (one of each, from the SAMPLE data)' );
	await rfetch( `${ MAIL }/api/v1/messages`, { method: 'DELETE' } );
	const cat = JSON.parse( wp( 'eval-file ek-tests/e2e/fixture-phase15-emails.php' ).split( '\n' ).pop() );
	check( 0 === cat.errors.length && cat.sent.length >= 60, `${ cat.sent.length } email types generated` + ( cat.errors.length ? ' → ' + cat.errors.join( ', ' ) : '' ) );
	await new Promise( ( r ) => setTimeout( r, 2000 ) );
	const list = ( await ( await rfetch( `${ MAIL }/api/v1/messages?limit=500` ) ).json() ).messages || [];
	const problems = [];
	const links = new Map();
	const rows = [];
	for ( const m of list ) {
		const msg = await ( await rfetch( `${ MAIL }/api/v1/message/${ m.ID }` ) ).json();
		const hdr = await ( await rfetch( `${ MAIL }/api/v1/message/${ m.ID }/headers` ) ).json();
		const html = msg.HTML || '';
		const text = html.replace( /<[^>]+>/g, ' ' );
		const type = ( hdr[ 'X-Ek-Email' ] || hdr[ 'X-EK-Email' ] || [ '?' ] )[ 0 ];
		const issues = [];
		if ( ! /EXPLORE KATSINA/.test( html ) ) { issues.push( 'not branded' ); }
		if ( /%[sd]\b|%\d\$[sd]|\{\{|\}\}/.test( text + m.Subject ) ) { issues.push( 'unfilled placeholder' ); }
		if ( BAD.test( html ) || /\bArray\b/.test( text ) ) { issues.push( 'PHP leftover' ); }
		if ( '?' === type ) { issues.push( 'no type tag' ); }
		for ( const [ , href ] of html.matchAll( /href="([^"]+)"/g ) ) {
			const h = href.replace( /&amp;/g, '&' );
			if ( h.startsWith( BASE ) ) {
				if ( ! links.has( h ) ) { links.set( h, [] ); }
				links.get( h ).push( m.Subject );
			} else if ( ! /^(https:\/\/(wa\.me|www\.google\.com|calendar\.google\.com)|mailto:|tel:)/.test( h ) ) {
				issues.push( 'unexpected link ' + h );
			}
		}
		if ( issues.length ) { problems.push( `${ m.Subject }: ${ issues.join( ', ' ) }` ); }
		rows.push( `| ${ type } | ${ m.Subject.replace( /\|/g, '/' ) } | ${ issues.length ? issues.join( ', ' ) : 'ok' } |` );
	}
	check( 0 === problems.length, `${ list.length } emails: branded, tagged, no placeholders or PHP leftovers` + ( problems.length ? ' → ' + problems.join( ' ; ' ) : '' ) );
	const deadMail = [];
	for ( const [ h, subj ] of links ) {
		const r = await rfetch( h, { redirect: 'manual' } );
		if ( r.status >= 400 ) { deadMail.push( `${ h } (${ r.status }) in "${ subj[ 0 ] }"` ); }
	}
	check( 0 === deadMail.length, `All ${ links.size } different links in the emails open` + ( deadMail.length ? ' → ' + deadMail.join( ' ; ' ) : '' ) );
	const sample = list.find( ( m ) => /Booking received/i.test( m.Subject ) ) || list[ 0 ];
	const sp = await ( await browser.newContext( { viewport: { width: 600, height: 900 } } ) ).newPage();
	await sp.setContent( ( await ( await rfetch( `${ MAIL }/api/v1/message/${ sample.ID }` ) ).json() ).HTML );
	await sp.screenshot( { path: path.join( SHOTS, 'p15-email-booking-600.png' ), fullPage: true } );

	/* ---------------- D. Links ---------------- */
	console.log( 'D. Every link on the site' );
	report.push( '', '## D. Links' );
	const skip = /\/wp-admin|wp-login|logout|add-to-cart|ek_ad=|\/feed\/|\/wp-json|replytocom|\/wp-content\/uploads\/|ek_ics=|\.(jpg|jpeg|png|webp|pdf|svg|css|js|woff2?)(\?|$)/;
	const seen = new Map();
	const queue = [ '/' ];
	const sm = await ( await rfetch( `${ BASE }/sitemap_index.xml` ) ).text();
	for ( const [ , loc ] of sm.matchAll( /<loc>([^<]+)<\/loc>/g ) ) {
		const sub = await ( await rfetch( loc ) ).text();
		for ( const [ , u ] of sub.matchAll( /<loc>([^<]+)<\/loc>/g ) ) { queue.push( u.replace( BASE, '' ) ); }
	}
	queue.push( ...publicPages, ...hausa );
	const broken = [];
	while ( queue.length && seen.size < 1500 ) {
		const u = queue.shift().split( '#' )[ 0 ];
		if ( ! u || seen.has( u ) || skip.test( u ) ) { continue; }
		seen.set( u, true );
		const r = await rfetch( BASE + u, { redirect: 'manual' } );
		if ( r.status >= 400 ) { broken.push( `${ u } (${ r.status })` ); continue; }
		if ( ! /text\/html/.test( r.headers.get( 'content-type' ) || '' ) || r.status >= 300 ) { continue; }
		const html = await r.text();
		for ( const [ , h ] of html.matchAll( /href="(http:\/\/localhost:8888[^"]*|\/[^"/][^"]*)"/g ) ) {
			const rel = h.replace( /&amp;/g, '&' ).replace( /&#038;/g, '&' ).replace( BASE, '' );
			if ( ! seen.has( rel.split( '#' )[ 0 ] ) && ! skip.test( rel ) && ! /[?&](checkin|checkout|date|guests|party|sort|view|pg|lat|lng|near|price_min|price_max|stars|amenities|room_type|pay_venue|cuisine|layout|tab|topic|type|lga)=/.test( rel ) ) {
				queue.push( rel );
			}
		}
	}
	check( 0 === broken.length, `${ seen.size } different addresses crawled from the homepage and the sitemap: none broken` + ( broken.length ? ' → ' + broken.join( ', ' ) : '' ) );

	/* ---------------- E. Language switcher ---------------- */
	console.log( 'E. English ⇄ Hausa switcher' );
	report.push( '', '## E. Language switcher' );
	const sw = await ( await browser.newContext( { viewport: { width: 1280, height: 900 } } ) ).newPage();
	const swBad = [];
	for ( const [ k, u ] of Object.entries( s.en ) ) {
		if ( [ 'dashboard', 'checkin', 'book', 'account' ].includes( k ) && ! s.ha[ k ] ) { continue; }
		await sw.goto( BASE + u );
		const toHa = await sw.locator( '.ek-lang-switch a[lang="ha"], .ek-lang-switch a[hreflang="ha"], a[hreflang="ha"]' ).first().getAttribute( 'href' ).catch( () => null );
		if ( ! toHa ) { swBad.push( `${ u }: no Hausa link` ); continue; }
		await sw.goto( toHa );
		const haLang = await sw.locator( 'html' ).getAttribute( 'lang' );
		const expected = s.ha[ k ] ? BASE + s.ha[ k ] : null;
		if ( ! /^ha/.test( haLang || '' ) || ( expected && sw.url() !== expected ) ) { swBad.push( `${ u } → ${ sw.url() } (lang ${ haLang })` ); continue; }
		const toEn = await sw.locator( 'a[hreflang="en"], .ek-lang-switch a[lang="en"]' ).first().getAttribute( 'href' ).catch( () => null );
		if ( ! toEn || ( s.ha[ k ] && toEn.replace( BASE, '' ) !== u ) ) { swBad.push( `${ toHa }: back to English goes to ${ toEn }` ); }
	}
	for ( const u of Object.values( s.items ).slice( 0, 6 ) ) {
		await sw.goto( BASE + u );
		const toHa = await sw.locator( 'a[hreflang="ha"]' ).first().getAttribute( 'href' ).catch( () => null );
		if ( toHa ) {
			const r = await rfetch( toHa, { redirect: 'manual' } );
			if ( r.status >= 400 ) { swBad.push( `${ u } → ${ toHa } (${ r.status })` ); }
		}
	}
	check( 0 === swBad.length, `Language switcher: every page goes to its Hausa version and back` + ( swBad.length ? ' → ' + swBad.join( ' ; ' ) : '' ) );
	await sw.goto( BASE + s.ha.home );
	await sw.screenshot( { path: path.join( SHOTS, 'p15-hausa-home-1280.png' ) } );

	check( 0 === jsErrors.size, 'No JavaScript errors anywhere' + ( jsErrors.size ? ': ' + [ ...jsErrors ].slice( 0, 8 ).join( ' | ' ) : '' ) );
	await browser.close();

	const md = [ '# Phase 15 – page, dashboard, email, link and language checks', '', `Run on ${ new Date().toISOString().slice( 0, 10 ) } with \`node tests/e2e/phase15-sweep.js\` against the local site with the SAMPLE data.`, '', ...report, '', '### Every email checked', '', '| Type | Subject | Result |', '|---|---|---|', ...rows.sort(), '' ].join( '\n' );
	fs.writeFileSync( path.join( ROOT, 'docs', 'phase15-checks.md' ), md );
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll page, dashboard, email, link and language checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
