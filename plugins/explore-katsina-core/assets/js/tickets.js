/* Explore Katsina: draw a QR code for each ticket (qrcode-generator, MIT). */
( function () {
	'use strict';
	document.addEventListener( 'DOMContentLoaded', function () {
		if ( typeof qrcode === 'undefined' ) { return; }
		document.querySelectorAll( '[data-ek-qr]' ).forEach( function ( el ) {
			var qr = qrcode( 0, 'M' );
			qr.addData( el.getAttribute( 'data-ek-qr' ) );
			qr.make();
			el.innerHTML = qr.createSvgTag( { cellSize: 5, margin: 2, scalable: true } );
		} );
	} );
}() );
