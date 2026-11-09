/* Explore Katsina: small map preview on business and attraction pages, with nearby places as small dots.
   Loads tiles only when scrolled into view. */
( function () {
	'use strict';
	var cfg = window.ekMap || {};

	function draw( el ) {
		if ( el._ekMap || typeof L === 'undefined' ) { return; }
		var lat = parseFloat( el.getAttribute( 'data-lat' ) );
		var lng = parseFloat( el.getAttribute( 'data-lng' ) );
		var colour = el.getAttribute( 'data-colour' ) || '#8E1B2C';
		var map = L.map( el, { center: [ lat, lng ], zoom: 15, scrollWheelZoom: false, dragging: ! L.Browser.mobile, tap: false } );
		el._ekMap = map;
		L.tileLayer( cfg.tiles, { maxZoom: 19, attribution: cfg.attribution } ).addTo( map );
		var near = [];
		try { near = JSON.parse( el.getAttribute( 'data-near' ) || '[]' ); } catch ( e ) {}
		var pts = [ [ lat, lng ] ];
		near.forEach( function ( p ) {
			var m = L.circleMarker( [ p.lat, p.lng ], { radius: 7, color: '#fff', weight: 2, fillColor: p.c, fillOpacity: 0.95 } ).addTo( map );
			var a = document.createElement( 'a' );
			a.href = p.u;
			a.textContent = p.t;
			m.bindTooltip( p.t );
			m.bindPopup( a );
			pts.push( [ p.lat, p.lng ] );
		} );
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="34" height="44"><path d="M20 51C20 51 2 31 2 19a18 18 0 0 1 36 0c0 12-18 32-18 32Z" fill="' + colour + '" stroke="#fff" stroke-width="2"/><circle cx="20" cy="19" r="6.5" fill="#D2A03A" stroke="#fff" stroke-width="2"/></svg>';
		L.marker( [ lat, lng ], { icon: L.divIcon( { html: svg, className: 'ek-pin', iconSize: [ 34, 44 ], iconAnchor: [ 17, 43 ] } ), keyboard: false, zIndexOffset: 1000 } ).addTo( map );
		if ( pts.length > 1 ) { map.fitBounds( L.latLngBounds( pts ).pad( 0.15 ), { maxZoom: 16 } ); }
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		var els = document.querySelectorAll( '[data-ek-mini-map]' );
		if ( ! ( 'IntersectionObserver' in window ) ) { els.forEach( draw ); return; }
		var io = new IntersectionObserver( function ( entries ) {
			entries.forEach( function ( en ) { if ( en.isIntersecting ) { draw( en.target ); io.unobserve( en.target ); } } );
		}, { rootMargin: '200px' } );
		els.forEach( function ( el ) { io.observe( el ); } );
	} );
}() );
