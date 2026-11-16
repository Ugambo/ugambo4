#!/usr/bin/env node
/**
 * Phase 14: makes the small ".min" copies of our own CSS and JavaScript that visitors download.
 *
 *   npm run build          (re-run after editing any .css / .js file in the plugin or theme)
 *
 * Each .min file starts with a fingerprint of its source. The site only serves the .min copy while
 * the fingerprint matches, so a forgotten build never shows visitors an out-of-date file: they get
 * the normal (larger) file instead, and the Phase 14 test reports it.
 */
const esbuild = require( 'esbuild' );
const crypto = require( 'crypto' );
const fs = require( 'fs' );
const path = require( 'path' );

const ROOT = path.join( __dirname, '..' );
const DIRS = [
	'plugins/explore-katsina-core/assets/css',
	'plugins/explore-katsina-core/assets/js',
	'plugins/explore-katsina-core/assets/fonts',
	'plugins/explore-katsina-core/assets/vendor/leaflet',
	'themes/explore-katsina/assets/css',
	'themes/explore-katsina/assets/js',
];

let n = 0;
for ( const dir of DIRS ) {
	const abs = path.join( ROOT, dir );
	if ( ! fs.existsSync( abs ) ) {
		continue;
	}
	for ( const f of fs.readdirSync( abs ) ) {
		if ( ! /\.(css|js)$/.test( f ) || /\.min\.(css|js)$/.test( f ) ) {
			continue;
		}
		if ( 'leaflet.js' === f ) {
			continue; // Already minified by its makers.
		}
		const src = path.join( abs, f );
		const code = fs.readFileSync( src, 'utf8' );
		const hash = crypto.createHash( 'md5' ).update( fs.readFileSync( src ) ).digest( 'hex' );
		const loader = f.endsWith( '.css' ) ? 'css' : 'js';
		const out = esbuild.transformSync( code, {
			loader,
			minify: true,
			legalComments: 'none',
			target: loader === 'js' ? 'es2017' : [ 'chrome80', 'safari13', 'firefox78' ],
			charset: 'utf8',
		} ).code;
		const dest = src.replace( /\.(css|js)$/, '.min.$1' );
		fs.writeFileSync( dest, `/*! src:${ hash } */\n` + out );
		n++;
		console.log( `${ path.relative( ROOT, dest ) }  ${ code.length } → ${ out.length } bytes` );
	}
}
console.log( `${ n } files minified.` );
