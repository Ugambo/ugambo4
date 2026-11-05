/* Explore Katsina: draggable map pin for business locations (Leaflet + OpenStreetMap). */
( function () {
	'use strict';
	var cfg = window.ekMap || {};
	var t = cfg.i18n || {};

	function pinIcon( colour ) {
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="34" height="44"><path d="M20 51C20 51 2 31 2 19a18 18 0 0 1 36 0c0 12-18 32-18 32Z" fill="' + colour + '" stroke="#fff" stroke-width="2"/><circle cx="20" cy="19" r="6.5" fill="#D2A03A" stroke="#fff" stroke-width="2"/></svg>';
		return L.divIcon( { html: svg, className: 'ek-pin', iconSize: [ 34, 44 ], iconAnchor: [ 17, 43 ] } );
	}

	function inBounds( ll ) {
		var b = cfg.bounds;
		return ll.lat >= b[ 0 ][ 0 ] && ll.lat <= b[ 1 ][ 0 ] && ll.lng >= b[ 0 ][ 1 ] && ll.lng <= b[ 1 ][ 1 ];
	}

	function init( el ) {
		if ( el._ekMap || typeof L === 'undefined' ) { return; }
		var latIn = document.getElementById( el.getAttribute( 'data-lat-input' ) );
		var lngIn = document.getElementById( el.getAttribute( 'data-lng-input' ) );
		var wrap = el.closest( '.ek-field' ) || el.parentNode;
		var coords = wrap.querySelector( '[data-ek-coords]' );
		var locate = wrap.querySelector( '[data-ek-locate]' );
		var has = latIn.value && lngIn.value;
		var start = has ? [ parseFloat( latIn.value ), parseFloat( lngIn.value ) ] : cfg.centre;

		var map = L.map( el, {
			center: start,
			zoom: has ? 17 : 12,
			maxBounds: L.latLngBounds( cfg.bounds ).pad( 0.3 ),
			scrollWheelZoom: false,
			tap: true
		} );
		el._ekMap = map;
		L.tileLayer( cfg.tiles, { maxZoom: 19, attribution: cfg.attribution } ).addTo( map );
		var marker = L.marker( start, { draggable: true, icon: pinIcon( '#8E1B2C' ), keyboard: true, title: t.dragHint, alt: t.dragHint } ).addTo( map );

		function set( ll, announce ) {
			if ( ! inBounds( ll ) ) {
				coords.textContent = t.outside;
				coords.style.color = '#B3261E';
				return false;
			}
			marker.setLatLng( ll );
			latIn.value = ll.lat.toFixed( 6 );
			lngIn.value = ll.lng.toFixed( 6 );
			coords.style.color = '';
			coords.textContent = ( announce ? t.pinPlaced + ': ' : '' ) + latIn.value + ', ' + lngIn.value;
			var err = wrap.querySelector( '.ek-error' );
			if ( err ) { err.remove(); wrap.classList.remove( 'has-error' ); }
			return true;
		}

		marker.on( 'dragend', function () { set( marker.getLatLng(), true ); } );
		map.on( 'click', function ( e ) { set( e.latlng, true ); } );

		// Keyboard: arrow keys nudge the pin when the marker has focus.
		marker.on( 'add', function () {} );
		var mEl = marker.getElement();
		if ( mEl ) {
			mEl.setAttribute( 'role', 'button' );
			mEl.addEventListener( 'keydown', function ( e ) {
				var step = 0.0002 * Math.pow( 2, 17 - map.getZoom() );
				var ll = marker.getLatLng();
				var moves = { ArrowUp: [ step, 0 ], ArrowDown: [ -step, 0 ], ArrowLeft: [ 0, -step ], ArrowRight: [ 0, step ] };
				if ( moves[ e.key ] ) {
					e.preventDefault();
					var n = L.latLng( ll.lat + moves[ e.key ][ 0 ], ll.lng + moves[ e.key ][ 1 ] );
					if ( set( n, true ) ) { map.panTo( n ); }
				}
			} );
		}

		if ( locate ) {
			locate.addEventListener( 'click', function () {
				if ( ! navigator.geolocation ) { coords.textContent = t.denied; return; }
				locate.disabled = true;
				coords.textContent = t.locating;
				navigator.geolocation.getCurrentPosition( function ( pos ) {
					locate.disabled = false;
					var ll = L.latLng( pos.coords.latitude, pos.coords.longitude );
					if ( set( ll, true ) ) { map.setView( ll, 18 ); }
				}, function () {
					locate.disabled = false;
					coords.textContent = t.denied;
				}, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 } );
			} );
		}

		// Maps inside hidden steps need a size refresh when shown.
		document.addEventListener( 'ek:step', function () { setTimeout( function () { map.invalidateSize(); }, 50 ); } );
	}

	function boot() { document.querySelectorAll( '[data-ek-map-picker]' ).forEach( init ); }
	if ( document.readyState === 'loading' ) { document.addEventListener( 'DOMContentLoaded', boot ); } else { boot(); }
	document.addEventListener( 'ek:step', boot );
}() );
