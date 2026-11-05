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
		var map = L.map( el, { scrollWheelZoom: false } );
		L.tileLayer( cfg.tiles, { maxZoom: 19, attribution: cfg.attribution } ).addTo( map );
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="30" height="39"><path d="M20 51C20 51 2 31 2 19a18 18 0 0 1 36 0c0 12-18 32-18 32Z" fill="' + colour + '" stroke="#fff" stroke-width="2"/><path d="M11 24v-8M11 21h18v3M13 19a2 2 0 1 0 0-.1M17 19h10a2 2 0 0 1 2 2" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>';
		var icon = L.divIcon( { html: svg, className: 'ek-pin', iconSize: [ 30, 39 ], iconAnchor: [ 15, 38 ], popupAnchor: [ 0, -34 ] } );
		var bounds = [];
		pins.forEach( function ( p ) {
			var esc = function ( s ) { var d = document.createElement( 'div' ); d.textContent = s; return d.innerHTML; };
			var html = '<div class="ek-pop">' + ( p.img ? '<img src="' + esc( p.img ) + '" alt="" loading="lazy">' : '' ) +
				'<strong>' + esc( p.name ) + '</strong><span>' + esc( p.price ) + ' / night' + ( p.dist ? ' · ' + esc( p.dist ) : '' ) + '</span>' +
				'<a href="' + esc( p.url ) + '">' + ( t.view || 'View' ) + '</a></div>';
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
	} );
}() );
