/* Explore Katsina: the Katsina Map.
 * Loads only the pins inside the visible area from /wp-json/ek/v1/map, clusters them when zoomed out,
 * and keeps a sortable list in sync (side panel on desktop, bottom sheet on phones).
 * The visitor's location is sent only with map requests (for distances) and never stored. */
( function () {
	'use strict';
	var cfg = window.ekKmap || {};
	var t = cfg.i18n || {};
	var root, map, cluster, userMarker, userCircle, pins = [], markers = {}, user = null, ctrl = null, timer = null, firstLoad = true;

	function esc( s ) {
		return String( s == null ? '' : s ).replace( /[&<>"']/g, function ( c ) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ c ]; } );
	}
	function fmt( str, v ) { return String( str ).replace( '%d', v ).replace( '%s', v ); }
	function dist( m ) { return m < 1000 ? Math.round( m / 10 ) * 10 + ' m' : ( m / 1000 ).toFixed( m < 10000 ? 1 : 0 ) + ' km'; }
	var iOS = /iPad|iPhone|iPod/.test( navigator.userAgent );

	/* ---------- Pins ---------- */
	var glyphs = {
		hotel: '<path d="M12 25v-9M12 21h16v4M16 18.5a1.8 1.8 0 1 0 0-.1M19 18h9v3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
		restaurant: '<path d="M15 12v14M12.5 12v4.5a2.5 2.5 0 0 0 5 0V12M25 26V12c-2.5 1-3.5 4-3.5 7h3.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
		'event-centre': '<path d="M20 11.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.6 5.2-.7z" fill="#fff"/>',
		attraction: '<path d="M12 26h16M14 26v-6M26 26v-6M13 20h14M15 20a5 5 0 0 1 10 0M20 15v-3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'
	};
	function icon( p, active ) {
		var c = ( cfg.colours || {} )[ p.type ] || '#5B5965';
		var big = p.featured || active;
		var w = big ? 44 : 36, h = big ? 57 : 47;
		var ring = p.featured ? '<path d="M20 51C20 51 2 31 2 19a18 18 0 0 1 36 0c0 12-18 32-18 32Z" fill="none" stroke="#D2A03A" stroke-width="5"/>' : '';
		var svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 52" width="' + w + '" height="' + h + '">' + ring +
			'<path d="M20 51C20 51 2 31 2 19a18 18 0 0 1 36 0c0 12-18 32-18 32Z" fill="' + c + '" stroke="#fff" stroke-width="2"/>' + ( glyphs[ p.type ] || '<circle cx="20" cy="19" r="6" fill="#fff"/>' ) + '</svg>';
		return L.divIcon( { html: svg, className: 'ek-kpin' + ( p.featured ? ' is-featured' : '' ) + ( active ? ' is-active' : '' ), iconSize: [ w, h ], iconAnchor: [ w / 2, h - 1 ], popupAnchor: [ 0, -h + 6 ] } );
	}

	function stars( r ) {
		var full = Math.round( r * 2 ) / 2, out = '';
		for ( var i = 1; i <= 5; i++ ) { out += i <= full ? '★' : ( i - 0.5 === full ? '⯪' : '☆' ); }
		return '<span class="ek-kstars" aria-hidden="true">' + out + '</span>';
	}

	function ratingLine( p ) {
		if ( p.kind !== 'business' ) { return ''; }
		if ( ! p.reviews ) { return '<span class="ek-muted">' + esc( t.noReviews ) + '</span>'; }
		return stars( p.rating ) + ' <strong>' + p.rating.toFixed( 1 ) + '</strong> <span class="ek-muted">(' + esc( p.reviews === 1 ? t.review : fmt( t.reviews, p.reviews ) ) + ')</span>';
	}

	function card( p ) {
		var dirs = iOS ? p.appleMaps : p.directions;
		var badges = ( p.featured ? '<span class="ek-kbadge ek-kbadge--featured">' + esc( t.featured ) + '</span>' : '' ) +
			p.badges.map( function ( b ) { return '<span class="ek-kbadge">' + esc( b ) + '</span>'; } ).join( '' );
		var meta = [ esc( p.typeLabel ), esc( p.lga ) ].filter( Boolean ).join( ' · ' );
		var status = p.open === true ? '<span class="ek-kopen">' + esc( t.openNow ) + '</span>' : ( p.open === false ? '<span class="ek-kclosed">' + esc( t.closed ) + '</span>' : '' );
		return '<article class="ek-kcard">' +
			( p.photo ? '<img src="' + esc( p.photo ) + '" alt="" loading="lazy" width="300" height="160">' : '' ) +
			'<div class="ek-kcard-body">' +
			'<p class="ek-kcard-meta">' + meta + '</p>' +
			'<h3><a href="' + esc( p.url ) + '">' + esc( p.title ) + '</a></h3>' +
			( badges ? '<p class="ek-kcard-badges">' + badges + '</p>' : '' ) +
			'<p class="ek-kcard-line">' + ratingLine( p ) + '</p>' +
			( p.kind === 'business' ? '<p class="ek-kcard-line ek-kcard-rank">' + esc( p.rankLabel || t.newPlace ) + '</p>' : '' ) +
			( p.price ? '<p class="ek-kcard-line">' + esc( p.price ) + '</p>' : '' ) +
			( p.distance != null || status ? '<p class="ek-kcard-line">' + ( p.distance != null ? esc( fmt( t.away, dist( p.distance ) ) ) + ' ' : '' ) + status + '</p>' : '' ) +
			'<div class="ek-kcard-actions">' +
			'<a class="ek-btn ek-btn--sm ek-btn--night" href="' + esc( p.url ) + '">' + esc( t.view ) + '</a>' +
			( p.book ? '<a class="ek-btn ek-btn--sm" href="' + esc( p.book.url ) + '">' + esc( p.book.label ) + '</a>' : '' ) +
			'<a class="ek-btn ek-btn--sm ek-btn--ghost" href="' + esc( dirs ) + '" target="_blank" rel="noopener"' + ( p.kind === 'business' ? ' data-ek-track="' + p.id + ':directions"' : '' ) + '>' + esc( t.directions ) + '</a>' +
			( p.whatsapp ? '<a class="ek-btn ek-btn--sm ek-btn--wa" href="' + esc( p.whatsapp ) + '" target="_blank" rel="noopener" data-ek-track="' + p.id + ':whatsapp">' + esc( t.whatsapp ) + '</a>' : '' ) +
			'</div></div></article>';
	}

	/* ---------- Data ---------- */
	function filters() {
		var f = root.querySelector( '[data-filters]' );
		var types = [].slice.call( f.querySelectorAll( 'input[name=types]:checked' ) ).map( function ( i ) { return i.value; } );
		var price = [].slice.call( f.querySelectorAll( 'input[name=price]:checked' ) ).map( function ( i ) { return i.value; } );
		return {
			types: types.join( ',' ) || 'none',
			lga: f.lga.value,
			min_rating: f.min_rating.value,
			amenity: f.amenity.value,
			price: price.join( ',' ),
			open: f.open.checked ? 1 : '',
			radius: user ? f.radius.value : 0
		};
	}

	function load() {
		var b = map.getBounds();
		var q = filters();
		var more = [ q.lga, q.min_rating, q.amenity, q.price, q.open ].filter( Boolean ).length;
		root.querySelector( '[data-filter-count]' ).textContent = more ? '(' + more + ')' : '';
		var params = new URLSearchParams( { bbox: [ b.getSouth(), b.getWest(), b.getNorth(), b.getEast() ].map( function ( n ) { return n.toFixed( 5 ); } ).join( ',' ) } );
		Object.keys( q ).forEach( function ( k ) { if ( q[ k ] !== '' && q[ k ] !== 0 && q[ k ] !== '0' ) { params.set( k, q[ k ] ); } } );
		if ( user ) { params.set( 'lat', user.lat.toFixed( 5 ) ); params.set( 'lng', user.lng.toFixed( 5 ) ); }
		if ( ctrl ) { ctrl.abort(); }
		ctrl = 'AbortController' in window ? new AbortController() : null;
		root.classList.add( 'is-loading' );
		fetch( cfg.rest + ( cfg.rest.indexOf( '?' ) > -1 ? '&' : '?' ) + params.toString(), { credentials: 'same-origin', signal: ctrl ? ctrl.signal : undefined } )
			.then( function ( r ) { if ( ! r.ok ) { throw new Error( r.status ); } return r.json(); } )
			.then( function ( d ) { root.classList.remove( 'is-loading' ); show( d ); } )
			.catch( function ( e ) { if ( e.name === 'AbortError' ) { return; } root.classList.remove( 'is-loading' ); msg( t.error ); } );
	}
	function later() { clearTimeout( timer ); timer = setTimeout( load, 250 ); }

	function msg( text ) {
		var m = root.querySelector( '[data-msg]' );
		m.textContent = text || '';
		m.hidden = ! text;
	}

	/* Update pins in place (keep, add, remove) so an open card stays open when the map moves. */
	function show( d ) {
		pins = d.pins || [];
		var seen = {}, add = [], remove = [];
		pins.forEach( function ( p ) { seen[ p.id ] = p; } );
		Object.keys( markers ).forEach( function ( id ) {
			if ( ! seen[ id ] ) { remove.push( markers[ id ] ); delete markers[ id ]; }
		} );
		pins.forEach( function ( p ) {
			var m = markers[ p.id ];
			if ( m ) {
				if ( m._ekPin.featured !== p.featured ) { m.setIcon( icon( p ) ); }
				m._ekPin = p; // Fresh data (e.g. distance) for the card.
				return;
			}
			m = L.marker( [ p.lat, p.lng ], { icon: icon( p ), title: p.title, riseOnHover: true, zIndexOffset: p.featured ? 500 : 0 } );
			m._ekPin = p;
			m.bindPopup( function ( layer ) { return card( layer._ekPin ); }, { maxWidth: 300, minWidth: 240, className: 'ek-kpopup', autoPanPaddingTopLeft: [ 20, 70 ] } );
			m.on( 'popupopen', function () {
				highlight( m._ekPin.id );
				if ( m._ekPin.kind === 'business' && window.ekTrackSend ) { window.ekTrackSend( m._ekPin.id, 'pin_tap' ); }
			} );
			markers[ p.id ] = m;
			add.push( m );
		} );
		if ( remove.length ) { cluster.removeLayers( remove ); }
		if ( add.length ) { cluster.addLayers( add ); }
		var n = pins.length;
		root.querySelectorAll( '[data-count]' ).forEach( function ( el ) { el.textContent = n === 1 ? t.place : fmt( t.places, n ); } );
		msg( n ? ( d.truncated ? t.zoomIn : '' ) : t.none );
		list();
		if ( firstLoad && cfg.focus && markers[ cfg.focus.id ] ) {
			firstLoad = false;
			cluster.zoomToShowLayer( markers[ cfg.focus.id ], function () { markers[ cfg.focus.id ].openPopup(); } );
		}
		firstLoad = false;
	}

	function sorted() {
		var by = root.querySelector( '[data-sort]' ).value;
		var arr = pins.slice();
		var big = 1e15;
		var fns = {
			distance: function ( a, b ) { return ( a.distance == null ? big : a.distance ) - ( b.distance == null ? big : b.distance ); },
			rank: function ( a, b ) { return ( ( a.rank || big ) - ( b.rank || big ) ) || ( b.rating - a.rating ) || ( b.reviews - a.reviews ); },
			rating: function ( a, b ) { return ( b.rating - a.rating ) || ( b.reviews - a.reviews ); },
			price: function ( a, b ) { return ( a.priceSort || big ) - ( b.priceSort || big ); }
		};
		return arr.sort( fns[ by ] || fns.rank );
	}

	function list() {
		var ol = root.querySelector( '[data-list]' );
		ol.innerHTML = sorted().map( function ( p ) {
			return '<li><button type="button" class="ek-kitem" data-id="' + p.id + '" style="--pin:' + esc( ( cfg.colours || {} )[ p.type ] || '#5B5965' ) + '">' +
				( p.photo ? '<img src="' + esc( p.photo ) + '" alt="" loading="lazy" width="64" height="64">' : '<span class="ek-kitem-ph" aria-hidden="true"></span>' ) +
				'<span class="ek-kitem-body"><span class="ek-kitem-title">' + esc( p.title ) + ( p.featured ? ' <span class="ek-kbadge ek-kbadge--featured">' + esc( t.featured ) + '</span>' : '' ) + '</span>' +
				'<span class="ek-kitem-meta">' + esc( p.typeLabel ) + ( p.lga ? ' · ' + esc( p.lga ) : '' ) + ( p.distance != null ? ' · ' + esc( dist( p.distance ) ) : '' ) + '</span>' +
				'<span class="ek-kitem-meta">' + [ p.rankLabel ? '<strong>' + esc( p.rankLabel ) + '</strong>' : '', p.reviews ? '★ ' + p.rating.toFixed( 1 ) : '', esc( p.price ) ].filter( Boolean ).join( ' · ' ) + '</span>' +
				'</span></button></li>';
		} ).join( '' );
	}

	function highlight( id ) {
		root.querySelectorAll( '.ek-kitem.is-active' ).forEach( function ( b ) { b.classList.remove( 'is-active' ); } );
		var b = root.querySelector( '.ek-kitem[data-id="' + id + '"]' );
		if ( b ) { b.classList.add( 'is-active' ); if ( ! isSheet() ) { b.scrollIntoView( { block: 'nearest' } ); } }
	}

	function isSheet() { return window.matchMedia( '(max-width: 899px)' ).matches; }
	function sheet( open ) {
		root.classList.toggle( 'is-sheet-open', open );
		var btn = root.querySelector( '[data-sheet-toggle]' );
		btn.setAttribute( 'aria-expanded', open ? 'true' : 'false' );
		root.querySelector( '[data-sheet-cta]' ).textContent = open ? t.showMap : t.showList;
		setTimeout( function () { map.invalidateSize(); }, 260 );
	}

	/* ---------- Location ---------- */
	function locate() {
		var out = root.querySelector( '[data-locate-msg]' );
		if ( ! navigator.geolocation ) { out.textContent = t.denied; return; }
		out.textContent = t.locating;
		navigator.geolocation.getCurrentPosition( function ( pos ) {
			user = { lat: pos.coords.latitude, lng: pos.coords.longitude };
			var b = L.latLngBounds( cfg.bounds );
			out.textContent = b.contains( [ user.lat, user.lng ] ) ? '' : t.outside;
			if ( userMarker ) { map.removeLayer( userMarker ); }
			userMarker = L.circleMarker( [ user.lat, user.lng ], { radius: 9, color: '#fff', weight: 3, fillColor: '#2D6CDF', fillOpacity: 1 } ).addTo( map ).bindTooltip( t.you );
			var sel = root.querySelector( '[data-radius]' );
			sel.disabled = false;
			if ( sel.value === '0' ) { sel.value = '5'; }
			root.querySelector( '[data-sort] option[value=distance]' ).disabled = false;
			root.querySelector( '[data-sort]' ).value = 'distance';
			radius();
		}, function () { out.textContent = t.denied; }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 } );
	}

	function radius() {
		var km = parseInt( root.querySelector( '[data-radius]' ).value, 10 );
		if ( userCircle ) { map.removeLayer( userCircle ); userCircle = null; }
		if ( user && km ) {
			userCircle = L.circle( [ user.lat, user.lng ], { radius: km * 1000, color: '#2D6CDF', weight: 1.5, fillOpacity: 0.06, interactive: false } ).addTo( map );
			map.fitBounds( userCircle.getBounds(), { padding: [ 20, 20 ] } );
		} else if ( user ) {
			map.setView( [ user.lat, user.lng ], 13 );
		}
		later();
	}

	/* ---------- Start ---------- */
	function legend() {
		var c = L.control( { position: 'bottomleft' } );
		c.onAdd = function () {
			var d = L.DomUtil.create( 'div', 'ek-klegend' );
			d.innerHTML = Object.keys( cfg.labels || {} ).map( function ( k ) {
				return '<span><i style="background:' + esc( cfg.colours[ k ] ) + '"></i>' + esc( cfg.labels[ k ] ) + '</span>';
			} ).join( '' ) + '<span><i class="is-featured"></i>' + esc( t.featured ) + '</span>';
			L.DomEvent.disableClickPropagation( d );
			return d;
		};
		c.addTo( map );
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		root = document.querySelector( '[data-ek-kmap]' );
		if ( ! root || typeof L === 'undefined' ) { return; }
		var bounds = L.latLngBounds( cfg.bounds );
		map = L.map( root.querySelector( '[data-map]' ), { maxBounds: bounds.pad( 0.6 ), minZoom: 7, zoomControl: true, tap: false } );
		map.fitBounds( bounds );
		if ( cfg.focus ) { map.setView( [ cfg.focus.lat, cfg.focus.lng ], 16 ); }
		L.tileLayer( cfg.tiles, { maxZoom: 19, attribution: cfg.attribution } ).addTo( map );
		cluster = L.markerClusterGroup( {
			chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
			iconCreateFunction: function ( cl ) {
				var n = cl.getChildCount();
				return L.divIcon( { html: '<span>' + n + '</span>', className: 'ek-kcluster' + ( n > 25 ? ' is-big' : '' ), iconSize: [ 42, 42 ] } );
			}
		} );
		map.addLayer( cluster );
		legend();
		map.on( 'moveend', later );
		root.querySelector( '[data-filters]' ).addEventListener( 'change', function ( e ) {
			if ( e.target.matches( '[data-radius]' ) ) { radius(); } else { later(); }
		} );
		root.querySelector( '[data-locate]' ).addEventListener( 'click', locate );
		root.querySelector( '[data-sort]' ).addEventListener( 'change', list );
		root.querySelector( '[data-list]' ).addEventListener( 'click', function ( e ) {
			var b = e.target.closest( '.ek-kitem' );
			if ( ! b ) { return; }
			var m = markers[ b.getAttribute( 'data-id' ) ];
			if ( ! m ) { return; }
			if ( isSheet() ) { sheet( false ); }
			cluster.zoomToShowLayer( m, function () { m.openPopup(); } );
		} );
		root.querySelector( '[data-sheet-toggle]' ).addEventListener( 'click', function () { sheet( ! root.classList.contains( 'is-sheet-open' ) ); } );
		map.on( 'popupopen', function () { if ( isSheet() && root.classList.contains( 'is-sheet-open' ) ) { sheet( false ); } } );
		load();
	} );
}() );
