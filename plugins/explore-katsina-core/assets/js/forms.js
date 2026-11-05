/* Explore Katsina: form helpers (steps, previews, hours, counters). No dependencies. */
( function () {
	'use strict';
	var cfg = window.ekForms || { maxMb: 5, i18n: {} };
	var t = cfg.i18n || {};

	/* ---------- Multi-step form ---------- */
	function initSteps( form ) {
		var steps = Array.prototype.slice.call( form.querySelectorAll( '.ek-step' ) );
		if ( steps.length < 2 ) { return; }
		var list = form.querySelectorAll( '[data-ek-step-list] li' );
		var prev = form.querySelector( '[data-ek-prev]' );
		var next = form.querySelector( '[data-ek-next]' );
		var submit = form.querySelector( '[data-ek-submit]' );
		var current = Math.max( 1, Math.min( steps.length, parseInt( form.getAttribute( 'data-start' ), 10 ) || 1 ) );

		function show( n, focus ) {
			current = n;
			steps.forEach( function ( s, i ) { s.hidden = ( i + 1 ) !== n; } );
			Array.prototype.forEach.call( list, function ( li, i ) {
				li.classList.toggle( 'is-current', i + 1 === n );
				li.classList.toggle( 'is-done', i + 1 < n );
				if ( i + 1 === n ) { li.setAttribute( 'aria-current', 'step' ); } else { li.removeAttribute( 'aria-current' ); }
			} );
			prev.hidden = n === 1;
			next.hidden = n === steps.length;
			submit.hidden = n !== steps.length;
			if ( focus ) {
				var h = steps[ n - 1 ].querySelector( 'h2' );
				if ( h ) { h.setAttribute( 'tabindex', '-1' ); h.focus( { preventScroll: true } ); }
				form.scrollIntoView( { behavior: matchMedia( '(prefers-reduced-motion: reduce)' ).matches ? 'auto' : 'smooth', block: 'start' } );
			}
			document.dispatchEvent( new CustomEvent( 'ek:step', { detail: { step: n } } ) );
		}

		function clearError( field ) {
			var wrap = field.closest( '.ek-field' );
			if ( ! wrap ) { return; }
			wrap.classList.remove( 'has-error' );
			var e = wrap.querySelector( '.ek-error[data-client]' );
			if ( e ) { e.remove(); }
		}
		function addError( wrap, msg ) {
			wrap.classList.add( 'has-error' );
			if ( ! wrap.querySelector( '.ek-error' ) ) {
				var s = document.createElement( 'span' );
				s.className = 'ek-error';
				s.setAttribute( 'data-client', '1' );
				s.setAttribute( 'role', 'alert' );
				s.textContent = msg;
				wrap.appendChild( s );
			}
		}

		function validStep( n ) {
			var step = steps[ n - 1 ];
			var firstBad = null;
			step.querySelectorAll( 'input[required], select[required], textarea[required]' ).forEach( function ( f ) {
				clearError( f );
				var ok = f.type === 'checkbox' ? f.checked : ( f.type === 'file' ? f.files && f.files.length > 0 : f.checkValidity() && f.value.trim() !== '' );
				if ( ! ok ) {
					var msg = f.type === 'checkbox' ? ( t.agreement || t.required ) : ( f.validationMessage || t.required );
					addError( f.closest( '.ek-field' ) || f.parentNode, msg );
					firstBad = firstBad || f;
				}
			} );
			var pin = step.querySelector( '[data-ek-required-pin]' );
			if ( pin ) {
				var lat = pin.querySelector( 'input[name=lat]' );
				pin.classList.remove( 'has-error' );
				var pe = pin.querySelector( '.ek-error[data-client]' );
				if ( pe ) { pe.remove(); }
				if ( ! lat.value ) {
					addError( pin, t.pin );
					firstBad = firstBad || pin.querySelector( '[data-ek-map-picker]' );
				}
			}
			if ( firstBad ) { firstBad.focus(); }
			return ! firstBad;
		}

		next.addEventListener( 'click', function () { if ( validStep( current ) ) { show( current + 1, true ); } } );
		prev.addEventListener( 'click', function () { show( current - 1, true ); } );
		form.addEventListener( 'submit', function ( e ) {
			for ( var i = 1; i <= steps.length; i++ ) {
				if ( ! validStep( i ) ) {
					e.preventDefault();
					show( i, false );
					validStep( i );
					return;
				}
			}
			submit.disabled = true;
		} );
		form.addEventListener( 'input', function ( e ) { clearError( e.target ); } );
		form.addEventListener( 'change', function ( e ) { clearError( e.target ); } );
		Array.prototype.forEach.call( list, function ( li, i ) {
			li.addEventListener( 'click', function () { if ( i + 1 < current ) { show( i + 1, true ); } } );
		} );
		show( current, false );
		var summary = document.querySelector( '[data-ek-error-summary]' );
		if ( summary ) { summary.focus(); }
	}

	/* ---------- Photo previews ---------- */
	function initPreviews( input ) {
		var box = document.getElementById( input.getAttribute( 'data-ek-preview' ) );
		var maxFiles = parseInt( input.getAttribute( 'data-ek-max-files' ), 10 ) || 99;
		input.addEventListener( 'change', function () {
			if ( ! box ) { return; }
			box.innerHTML = '';
			Array.prototype.slice.call( input.files, 0, maxFiles ).forEach( function ( file ) {
				if ( file.size > cfg.maxMb * 1048576 ) {
					var p = document.createElement( 'p' );
					p.className = 'ek-error';
					p.textContent = file.name + ' ' + t.tooBig;
					box.appendChild( p );
					return;
				}
				var img = document.createElement( 'img' );
				img.alt = file.name;
				img.src = URL.createObjectURL( file );
				img.onload = function () { URL.revokeObjectURL( img.src ); };
				box.appendChild( img );
			} );
		} );
	}

	/* ---------- Opening hours ---------- */
	function initHours( fs ) {
		var always = fs.querySelector( '[data-ek-always]' );
		var days = fs.querySelector( '[data-ek-hours-days]' );
		if ( always && days ) {
			always.addEventListener( 'change', function () { days.hidden = always.checked; } );
		}
		fs.querySelectorAll( '[data-ek-closed]' ).forEach( function ( cb ) {
			cb.addEventListener( 'change', function () { cb.closest( '.ek-hours-row' ).classList.toggle( 'is-closed', cb.checked ); } );
		} );
	}

	/* ---------- Character counter ---------- */
	function initCounter( ta ) {
		var out = ta.parentNode.querySelector( '[data-ek-counter]' );
		if ( ! out ) { return; }
		function upd() { out.textContent = '(' + ta.value.trim().length + ')'; }
		ta.addEventListener( 'input', upd );
		upd();
	}

	/* ---------- Confirm buttons (e.g. delete photo) ---------- */
	function initConfirm( btn ) {
		btn.addEventListener( 'click', function ( e ) {
			if ( btn.getAttribute( 'data-armed' ) === '1' ) { return; }
			e.preventDefault();
			btn.setAttribute( 'data-armed', '1' );
			btn.setAttribute( 'data-label', btn.textContent );
			btn.textContent = btn.getAttribute( 'data-ek-confirm' );
			setTimeout( function () { btn.removeAttribute( 'data-armed' ); btn.textContent = btn.getAttribute( 'data-label' ); }, 4000 );
		} );
	}

	document.addEventListener( 'DOMContentLoaded', function () {
		document.querySelectorAll( '[data-ek-steps-form]' ).forEach( initSteps );
		document.querySelectorAll( 'input[type=file][data-ek-preview]' ).forEach( initPreviews );
		document.querySelectorAll( '[data-ek-hours]' ).forEach( initHours );
		document.querySelectorAll( 'textarea[data-ek-count]' ).forEach( initCounter );
		document.querySelectorAll( '[data-ek-confirm]' ).forEach( initConfirm );
	} );
}() );
