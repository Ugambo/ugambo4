/* Explore Katsina: search pages ("Near me", sort, dates, results map). */
( function () {
	'use strict';
	var cfg = window.ekMap || {};
	var t = ( window.ekSearch && window.ekSearch.i18n ) || {};

	function nextDay( iso ) {
		var d = new Date( iso + 'T12:00:00' );
		d.setDate( d.getDate() + 1 );
		return d.toISOString().slice( 0, 10 );
	}

	function initForm( form ) {
		var cin = form.querySelector( '[data-ek-checkin]' );
		var cout = form.querySelector( '[data-ek-checkout]' );
		if ( cin && cout ) {
			cin.addEventListener( 'change', function () {
				if ( ! cin.value ) { return; }
				cout.min = nextDay( cin.value );
				if ( ! cout.value || cout.value <= cin.value ) { cout.value = nextDay( cin.value ); }
			} );
		}
		var near = form.querySelector( '[data-ek-near-me]' );
		var status = form.querySelector( '[data-ek-near-status]' );
		if ( near ) {
			near.addEventListener( 'click', function () {
				if ( ! navigator.geolocation ) { status.textContent = t.noGeo; return; }
				near.disabled = true;
				status.textContent = t.locating;
				navigator.geolocation.getCurrentPosition( function ( pos ) {
					form.querySelector( '[data-ek-lat]' ).value = pos.coords.latitude.toFixed( 5 );
					form.querySelector( '[data-ek-lng]' ).value = pos.coords.longitude.toFixed( 5 );
					var sort = form.querySelector( '[data-ek-sort-field]' );
					if ( sort ) { sort.value = 'distance'; }
					form.submit();
				}, function () {
					near.disabled = false;
					status.textContent = t.denied;
				}, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 } );
			} );
		}
	}

	function initMap( el ) {
		if ( typeof L === 'undefined' ) { return; }
		var pins = JSON.parse( el.getAttribute( 'data-pins' ) || '[]' );
		var colour = el.getAttribute( 'data-colour' ) || '#8E1B2C';
		var me = el.getAttribute( 'data-me' ) ? JSON.parse( el.getAttribute( 'data-me' ) ) : null;
		var unit = el.hasAttribute( 'data-unit' ) ? el.getAttribute( 'data-unit' ) : ' / night';
		var isHotel = ! el.hasAttribute( 'data-unit' );
		var map = L.map( el, { scrollWheelZoom: false } );
		L.tileLayer( cfg.tiles, { maxZoom: 19, attribution: cfg.attribution } ).addTo( map );
		var kind = el.getAttribute( 'data-kind' ) || '';
		var glyph = 'event' === kind ? '<path d="M11 15l9-5 9 5M12 15v11M17 15v11M23 15v11M28 15v11M10 27h20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' : isHotel
			? '<path d="M11 24v-8M11 21h18v3M13 19a2 2 0 1 0 0-.1M17 19h10a2 2 0 0 1 2 2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>'
			: '<path d="M15 11v16M12.5 11v5a2.5 2.5 0 0 0 5 0v-5M25 27V11c-2.5 1.5-3 5-3 8h3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="30" height="39"><path d="M20 51C20 51 2 31 2 19a18 18 0 0 1 36 0c0 12-18 32-18 32Z" fill="' + colour + '" stroke="#fff" stroke-width="2"/>' + glyph + '</svg>';
		var icon = L.divIcon( { html: svg, className: 'ek-pin', iconSize: [ 30, 39 ], iconAnchor: [ 15, 38 ], popupAnchor: [ 0, -34 ] } );
		var bounds = [];
		pins.forEach( function ( p ) {
			var esc = function ( s ) { var d = document.createElement( 'div' ); d.textContent = s; return d.innerHTML; };
			var html = '<div class="ek-pop">' + ( p.img ? '<img src="' + esc( p.img ) + '" alt="" loading="lazy">' : '' ) +
				'<strong>' + esc( p.name ) + '</strong><span>' + esc( p.price ) + unit + ( p.dist ? ' · ' + esc( p.dist ) : '' ) + '</span>' +
				'<a href="' + esc( p.url ) + '">' + ( isHotel ? ( t.view || 'View' ) : ( t.viewPlace || 'View' ) ) + '</a></div>';
			L.marker( [ p.lat, p.lng ], { icon: icon, title: p.name, alt: p.name } ).addTo( map ).bindPopup( html );
			bounds.push( [ p.lat, p.lng ] );
		} );
		if ( me ) {
			L.circleMarker( me, { radius: 8, color: '#fff', weight: 3, fillColor: '#1F6B52', fillOpacity: 1 } ).addTo( map ).bindTooltip( t.you || 'You' );
			bounds.push( me );
		}
		if ( bounds.length > 1 ) { map.fitBounds( bounds, { padding: [ 30, 30 ], maxZoom: 15 } ); } else if ( bounds.length ) { map.setView( bounds[ 0 ], 14 ); } else { map.setView( cfg.centre, 8 ); }
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		document.querySelectorAll( '[data-ek-search-form], [data-ek-dates-form]' ).forEach( initForm );
		document.querySelectorAll( '[data-ek-sort]' ).forEach( function ( s ) {
			s.addEventListener( 'change', function () { window.location.href = s.value; } );
		} );
		document.querySelectorAll( '[data-ek-results-map]' ).forEach( initMap );
		document.querySelectorAll( '[data-ek-order-form]' ).forEach( function ( f ) {
			var out = f.querySelector( '[data-ek-order-total]' );
			var upd = function () {
				var total = 0, n = 0;
				f.querySelectorAll( 'input[data-price]' ).forEach( function ( i ) { var q = parseInt( i.value, 10 ) || 0; total += q * parseInt( i.getAttribute( 'data-price' ), 10 ); n += q; } );
				out.textContent = n ? n + ' · ₦' + ( total / 100 ).toLocaleString( 'en-NG' ) : out.getAttribute( 'data-empty' ) || out.textContent;
			};
			out.setAttribute( 'data-empty', out.textContent );
			f.addEventListener( 'input', upd );
		} );
	} );
}() );
