#!/usr/bin/env node
/**
 * Phase 14: Google Lighthouse on a phone (Moto G-class device, slow 4G simulation, the standard
 * "mobile" test) for the main visitor pages. Target: Performance 90+; Accessibility, Best Practices
 * and SEO are reported too. Writes docs/lighthouse/summary.md.
 *
 *   node tests/lighthouse.js            all pages
 *   node tests/lighthouse.js / /hotels/ just these
 *
 * Notes: the local site has no internet, so map tiles (OpenStreetMap) fail to load and the Map page's
 * "Best Practices" shows console errors that do not happen on the live site. The Hausa homepage is
 * marked "noindex" on purpose until it is translated, so its SEO score is lower by design.
 */
const lighthouse = require( 'lighthouse' ).default || require( 'lighthouse' );
const chromeLauncher = require( 'chrome-launcher' );
const { chromium } = require( 'playwright' );
const fs = require( 'fs' );
const path = require( 'path' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const TARGET = 90;
const DEFAULT = [ '/', '/explore/', '/hotels/', '/restaurants/', '/event-centres/', '/things-to-do/', '/map/', '/top-hotels/', '/events/', '/tours/', '/directory/', '/stories/', '/contact/', '/shop/', '/guides/', '/hotels/sample-crimson-gate-hotel/', '/restaurants/sample-mama-tuwo-kitchen/', '/event-centres/sample-grand-durbar-hall/', '/attractions/national-museum-katsina/', '/ha/' ];

( async () => {
	const pages = process.argv.slice( 2 ).length ? process.argv.slice( 2 ) : DEFAULT;
	const chrome = await chromeLauncher.launch( { chromePath: process.env.CHROME_PATH || chromium.executablePath(), chromeFlags: [ '--headless=new', '--no-sandbox' ] } );
	const rows = [];
	let below = 0;
	for ( const p of pages ) {
		await fetch( BASE + p ); // Warm the page cache, as for a real visitor.
		await fetch( BASE + p );
		const r = await lighthouse( BASE + p, { port: chrome.port, output: 'json', logLevel: 'error', onlyCategories: [ 'performance', 'accessibility', 'best-practices', 'seo' ] } );
		const c = r.lhr.categories;
		const a = r.lhr.audits;
		const s = ( k ) => Math.round( c[ k ].score * 100 );
		const row = { page: p, perf: s( 'performance' ), a11y: s( 'accessibility' ), bp: s( 'best-practices' ), seo: s( 'seo' ), fcp: a[ 'first-contentful-paint' ].displayValue, lcp: a[ 'largest-contentful-paint' ].displayValue, tbt: a[ 'total-blocking-time' ].displayValue, cls: a[ 'cumulative-layout-shift' ].displayValue };
		rows.push( row );
		if ( row.perf < TARGET ) {
			below++;
		}
		console.log( `${ row.perf >= TARGET ? '  ✔' : '  ✘' } ${ p.padEnd( 44 ) } Performance ${ row.perf }  Accessibility ${ row.a11y }  Best practices ${ row.bp }  SEO ${ row.seo }   (LCP ${ row.lcp })` );
	}
	await chrome.kill();
	if ( ! process.argv.slice( 2 ).length ) {
		const dir = path.join( __dirname, '..', 'docs', 'lighthouse' );
		fs.mkdirSync( dir, { recursive: true } );
		const md = [ '# Lighthouse (mobile) – local site', '', `Run on ${ new Date().toISOString().slice( 0, 10 ) } with \`node tests/lighthouse.js\` (Lighthouse 12, mobile, simulated slow 4G). Target: Performance ${ TARGET }+.`, '', '| Page | Performance | Accessibility | Best practices | SEO | First paint | Largest paint | Blocking | Layout shift |', '|---|---|---|---|---|---|---|---|---|', ...rows.map( ( r ) => `| ${ r.page } | ${ r.perf } | ${ r.a11y } | ${ r.bp } | ${ r.seo } | ${ r.fcp } | ${ r.lcp } | ${ r.tbt } | ${ r.cls } |` ), '', 'Known local-only effects: map tiles cannot load without internet (Map page "Best practices"); the Hausa homepage is "noindex" until translated (its SEO score). Real hosting adds network time; a host with LiteSpeed or a CDN usually scores higher.', '' ].join( '\n' );
		fs.writeFileSync( path.join( dir, 'summary.md' ), md.replace( / /g, ' ' ) );
	}
	console.log( below ? `\n${ below } page(s) below ${ TARGET }` : `\nAll ${ rows.length } pages score ${ TARGET }+ for mobile performance` );
	process.exit( below ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); process.exit( 1 ); } );
