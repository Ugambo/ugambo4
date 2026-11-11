/* Explore Katsina homepage: search tabs (keyboard accessible), "Near you", and the map preview
   (Leaflet is only downloaded when the map scrolls into view, to save mobile data). */
( function () {
	'use strict';
	var cfg = window.ektHome || {};
	var t = cfg.i18n || {};

	/* ---------- Tabs (WAI-ARIA tabs pattern, automatic activation) ---------- */
	function tabs( root ) {
		var list = root.querySelectorAll( '[role="tab"]' );
		function select( tab, focus ) {
			list.forEach( function ( b ) {
				var on = b === tab;
				b.setAttribute( 'aria-selected', on ? 'true' : 'false' );
				b.tabIndex = on ? 0 : -1;
				var p = document.getElementById( b.getAttribute( 'aria-controls' ) );
				if ( p ) { p.hidden = ! on; }
			} );
			if ( focus ) { tab.focus(); }
		}
		list.forEach( function ( b, i ) {
			b.addEventListener( 'click', function () { select( b, false ); } );
			b.addEventListener( 'keydown', function ( e ) {
				var n = null;
				if ( 'ArrowRight' === e.key ) { n = list[ ( i + 1 ) % list.length ]; }
				if ( 'ArrowLeft' === e.key ) { n = list[ ( i - 1 + list.length ) % list.length ]; }
				if ( 'Home' === e.key ) { n = list[ 0 ]; }
				if ( 'End' === e.key ) { n = list[ list.length - 1 ]; }
				if ( n ) { e.preventDefault(); select( n, true ); }
			} );
		} );
	}

	/* Check-out must be after check-in. */
	function dates() {
		var a = document.getElementById( 'ekt-h-in' ), b = document.getElementById( 'ekt-h-out' );
		if ( ! a || ! b ) { return; }
		a.addEventListener( 'change', function () {
			if ( ! a.value ) { return; }
			var d = new Date( a.value + 'T12:00:00' );
			d.setDate( d.getDate() + 1 );
			var next = d.toISOString().slice( 0, 10 );
			b.min = next;
			if ( ! b.value || b.value < next ) { b.value = next; }
		} );
	}

	/* ---------- Near you ---------- */
	function esc( s ) {
		var d = document.createElement( 'div' );
		d.textContent = s == null ? '' : String( s );
		return d.innerHTML;
	}
	function distance( m ) {
		if ( m == null ) { return ''; }
		var s = m < 1000 ? Math.round( m / 10 ) * 10 + ' m' : ( m / 1000 ).toFixed( m < 10000 ? 1 : 0 ) + ' km';
		return ( t.away || '%s away' ).replace( '%s', s );
	}
	function near( root ) {
		var btn = root.querySelector( '[data-ekt-near-go]' );
		var status = root.querySelector( '[data-ekt-near-status]' );
		var list = root.querySelector( '[data-ekt-near-list]' );
		if ( ! btn ) { return; }
		if ( ! ( 'geolocation' in navigator ) ) { btn.hidden = true; status.textContent = t.denied || ''; return; }
		btn.addEventListener( 'click', function () {
			btn.disabled = true;
			status.textContent = t.locating || '';
			navigator.geolocation.getCurrentPosition( function ( pos ) {
				var lat = pos.coords.latitude.toFixed( 5 ), lng = pos.coords.longitude.toFixed( 5 );
				var url = cfg.api + ( cfg.api.indexOf( '?' ) > -1 ? '&' : '?' ) + 'lat=' + lat + '&lng=' + lng + '&radius=15&types=hotel,restaurant,event-centre,attraction';
				fetch( url, { credentials: 'same-origin' } ).then( function ( r ) { return r.json(); } ).then( function ( d ) {
					var pins = ( d && d.pins ) || [];
					pins.sort( function ( a, b ) { return a.distance - b.distance; } );
					pins = pins.slice( 0, 6 );
					btn.disabled = false;
					if ( ! pins.length ) { status.textContent = t.none || ''; list.innerHTML = ''; return; }
					status.textContent = '';
					list.innerHTML = pins.map( function ( p ) {
						var img = p.photo ? '<img src="' + esc( p.photo ) + '" alt="" loading="lazy">' : '<span class="ekt-noimg" aria-hidden="true"></span>';
						var rate = p.reviews ? ' · ★ ' + Number( p.rating ).toFixed( 1 ) : '';
						return '<li class="ekt-card"><a class="ekt-card-link" href="' + esc( p.url ) + '"><span class="ekt-card-img">' + img + '</span><span class="ekt-card-body"><span class="ekt-card-kicker">' + esc( p.typeLabel ) + '</span><span class="ekt-card-title">' + esc( p.title ) + '</span><span class="ekt-card-meta">' + esc( distance( p.distance ) ) + esc( rate ) + '</span></span></a></li>';
					} ).join( '' );
				} ).catch( function () { btn.disabled = false; status.textContent = t.error || ''; } );
			}, function () {
				btn.disabled = false;
				status.textContent = t.denied || '';
			}, { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 } );
		} );
	}

	/* ---------- Map preview (lazy) ---------- */
	function loadLeaflet( done ) {
		if ( window.L ) { done(); return; }
		var l = cfg.leaflet || {};
		if ( ! l.js ) { return; }
		var css = document.createElement( 'link' );
		css.rel = 'stylesheet';
		css.href = l.css;
		document.head.appendChild( css );
		var s = document.createElement( 'script' );
		s.src = l.js;
		s.onload = done;
		document.head.appendChild( s );
	}
	function drawMap( el ) {
		var pins = [];
		try { pins = JSON.parse( el.getAttribute( 'data-pins' ) || '[]' ); } catch ( e ) {}
		var mc = cfg.mapCfg || {};
		var map = L.map( el, { center: [ 12.99, 7.6 ], zoom: 9, scrollWheelZoom: false, dragging: ! L.Browser.mobile, tap: false, attributionControl: true } );
		L.tileLayer( mc.tiles, { maxZoom: 18, attribution: mc.attribution } ).addTo( map );
		var pts = [];
		pins.forEach( function ( p ) {
			var m = L.circleMarker( [ p.lat, p.lng ], { radius: 6, color: '#fff', weight: 2, fillColor: p.c, fillOpacity: 0.95 } ).addTo( map );
			m.bindTooltip( p.t );
			pts.push( [ p.lat, p.lng ] );
		} );
		if ( pts.length > 1 ) { map.fitBounds( L.latLngBounds( pts ).pad( 0.1 ), { maxZoom: 12 } ); }
	}
	function mapPreview( el ) {
		var go = function () { loadLeaflet( function () { drawMap( el ); } ); };
		if ( ! ( 'IntersectionObserver' in window ) ) { go(); return; }
		var io = new IntersectionObserver( function ( en ) {
			if ( en[ 0 ].isIntersecting ) { io.disconnect(); go(); }
		}, { rootMargin: '300px' } );
		io.observe( el );
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		document.querySelectorAll( '[data-ekt-tabs]' ).forEach( tabs );
		dates();
		document.querySelectorAll( '[data-ekt-near]' ).forEach( near );
		document.querySelectorAll( '[data-ekt-map]' ).forEach( mapPreview );
	} );
}() );
