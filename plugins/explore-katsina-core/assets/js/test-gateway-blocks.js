/* Explore Katsina: the local-only test payment in WooCommerce's block checkout (never on a live site). */
( function () {
	'use strict';
	if ( ! window.wc || ! window.wc.wcBlocksRegistry || ! window.wp || ! window.wp.element ) { return; }
	var s = ( window.wc.wcSettings && window.wc.wcSettings.getSetting( 'ek_test_data', {} ) ) || {};
	var el = window.wp.element.createElement;
	var content = function () { return el( 'p', null, s.description || '' ); };
	window.wc.wcBlocksRegistry.registerPaymentMethod( {
		name: 'ek_test',
		label: el( 'span', null, s.title || 'Test payment' ),
		content: el( content ),
		edit: el( content ),
		canMakePayment: function () { return true; },
		ariaLabel: s.title || 'Test payment',
		supports: { features: s.supports || [ 'products' ] }
	} );
}() );
