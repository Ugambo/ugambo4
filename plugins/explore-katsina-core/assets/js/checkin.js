/* Explore Katsina: staff ticket check-in. Scans QR codes with the camera (jsQR, Apache-2.0) or takes a typed code. */
( function () {
	'use strict';
	var cfg = window.ekCheckin || {};
	document.addEventListener( 'DOMContentLoaded', function () {
		var root = document.querySelector( '[data-ek-checkin]' );
		if ( ! root ) { return; }
		var sel = root.querySelector( '[data-event]' );
		var out = root.querySelector( '[data-result]' );
		var video = root.querySelector( '[data-video]' );
		var canvas = root.querySelector( '[data-canvas]' );
		var busy = false, last = '', lastAt = 0;

		function counts( c ) {
			var o = sel.options[ sel.selectedIndex ];
			if ( c ) { o.setAttribute( 'data-issued', c.issued ); o.setAttribute( 'data-used', c.used ); }
			root.querySelector( '[data-counts]' ).textContent = o.getAttribute( 'data-used' ) + ' / ' + o.getAttribute( 'data-issued' ) + ' checked in';
		}
		function show( r ) {
			out.hidden = false;
			out.className = 'ek-ci-result is-' + r.result;
			out.innerHTML = '';
			var h = document.createElement( 'strong' );
			h.textContent = r.message;
			out.appendChild( h );
			if ( r.holder ) { var p = document.createElement( 'p' ); p.textContent = r.holder + ( r.type ? ' · ' + r.type : '' ); out.appendChild( p ); }
			if ( navigator.vibrate ) { navigator.vibrate( r.result === 'ok' ? 80 : [ 60, 60, 60 ] ); }
		}
		function check( code ) {
			code = String( code || '' ).replace( /[^A-Za-z0-9]/g, '' ).toUpperCase();
			if ( ! code || busy || ( code === last && Date.now() - lastAt < 4000 ) ) { return; }
			busy = true; last = code; lastAt = Date.now();
			fetch( cfg.url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-WP-Nonce': cfg.nonce }, body: JSON.stringify( { code: code, event: sel.value } ) } )
				.then( function ( r ) { return r.json(); } )
				.then( function ( r ) { show( r ); counts( r.counts ); } )
				.catch( function () { show( { result: 'invalid', message: 'Network error. Try again.' } ); } )
				.then( function () { busy = false; } );
		}
		function tick() {
			if ( video.readyState === video.HAVE_ENOUGH_DATA && typeof jsQR !== 'undefined' ) {
				canvas.width = video.videoWidth; canvas.height = video.videoHeight;
				var ctx = canvas.getContext( '2d', { willReadFrequently: true } );
				ctx.drawImage( video, 0, 0, canvas.width, canvas.height );
				var img = ctx.getImageData( 0, 0, canvas.width, canvas.height );
				var found = jsQR( img.data, img.width, img.height, { inversionAttempts: 'dontInvert' } );
				if ( found && found.data ) { check( found.data ); }
			}
			requestAnimationFrame( tick );
		}
		root.querySelector( '[data-start]' ).addEventListener( 'click', function () {
			if ( ! navigator.mediaDevices || ! navigator.mediaDevices.getUserMedia ) { show( { result: 'invalid', message: cfg.noCamera } ); return; }
			navigator.mediaDevices.getUserMedia( { video: { facingMode: 'environment' } } ).then( function ( stream ) {
				video.srcObject = stream; video.play(); requestAnimationFrame( tick );
				root.querySelector( '[data-start]' ).hidden = true;
			} ).catch( function () { show( { result: 'invalid', message: cfg.noCamera } ); } );
		} );
		root.querySelector( '[data-manual]' ).addEventListener( 'submit', function ( e ) {
			e.preventDefault();
			last = '';
			check( root.querySelector( '[data-code]' ).value );
			root.querySelector( '[data-code]' ).value = '';
		} );
		sel.addEventListener( 'change', function () { counts(); out.hidden = true; } );
		counts();
	} );
}() );
