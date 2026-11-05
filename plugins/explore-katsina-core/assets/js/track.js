/* Explore Katsina: counts page views and WhatsApp / call / website / directions taps for business analytics. */
( function () {
	'use strict';
	var cfg = window.ekTrack || {};
	if ( ! cfg.url ) { return; }

	function send( business, metric ) {
		var key = 'ek_' + business + '_' + metric;
		try { if ( sessionStorage.getItem( key ) ) { return; } sessionStorage.setItem( key, '1' ); } catch ( e ) {}
		var body = JSON.stringify( { business: business, metric: metric } );
		if ( navigator.sendBeacon ) {
			navigator.sendBeacon( cfg.url, new Blob( [ body ], { type: 'application/json' } ) );
		} else {
			fetch( cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: true, credentials: 'same-origin' } );
		}
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		document.querySelectorAll( '[data-ek-view]' ).forEach( function ( el ) {
			send( parseInt( el.getAttribute( 'data-ek-view' ), 10 ), 'view' );
		} );
	} );
	document.addEventListener( 'click', function ( e ) {
		var a = e.target.closest( '[data-ek-track]' );
		if ( ! a ) { return; }
		var parts = a.getAttribute( 'data-ek-track' ).split( ':' );
		send( parseInt( parts[ 0 ], 10 ), parts[ 1 ] );
	} );
	window.ekTrackSend = send; // Used by the Katsina Map for pin taps (Phase 8).
}() );
