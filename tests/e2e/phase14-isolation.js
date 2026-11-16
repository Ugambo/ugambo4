/**
 * Phase 14: "businesses can only access their own data". A break-in test through the real website.
 *
 * Logged in as one SAMPLE business owner (the "attacker"), it tries to read and change another SAMPLE
 * business's data (the "victim") in every way the dashboard allows: opening its dashboard pages,
 * sending its forms with valid security codes, and slipping the victim's room, hall, dish, booking,
 * review, invoice, photo and price-rule numbers into the attacker's own forms. For hotels, restaurants
 * and event centres. Also: guests cannot see other guests' bookings, booking pages need their secret
 * link, ID documents and private files are closed, owners cannot reach wp-admin or the user list.
 *
 * Pass = every attempt is refused AND a fingerprint of everything the victims own is unchanged.
 *
 * Usage: node tests/e2e/phase14-isolation.js   (after `wp ek sample-data`)
 */
const { request } = require( 'playwright' );
const { execSync } = require( 'child_process' );
const path = require( 'path' );

const BASE = process.env.EK_BASE || 'http://localhost:8888';
const ROOT = path.join( __dirname, '..', '..' );
const fx = ( ...a ) => execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp eval-file ek-tests/e2e/fixture-phase14.php ${ a.map( ( x ) => `'${ x }'` ).join( ' ' ) }`, { cwd: ROOT, stdio: [ 'ignore', 'pipe', 'ignore' ] } ).toString().trim().split( '\n' ).pop();

let failures = 0;
let attempts = 0;
const check = ( c, m ) => { console.log( ( c ? '  ✔ ' : '  ✘ ' ) + m ); if ( ! c ) { failures++; } };

async function login( user, pass ) {
	const ctx = await request.newContext( { baseURL: BASE, maxRedirects: 0 } );
	await ctx.get( '/wp-login.php' );
	const r = await ctx.post( '/wp-login.php', { form: { log: user, pwd: pass, 'wp-submit': 'Log In', testcookie: '1', redirect_to: BASE + '/' } } );
	const state = await ctx.storageState();
	const cookie = state.cookies.find( ( c ) => c.name.startsWith( 'wordpress_logged_in_' ) );
	if ( 302 !== r.status() || ! cookie ) {
		throw new Error( `Login failed for ${ user }` );
	}
	return { ctx, cookie: cookie.value };
}

/** POST a dashboard form. Returns { status, location, body }. */
async function post( ctx, form ) {
	attempts++;
	const r = await ctx.post( '/business-dashboard/', { form } );
	return { status: r.status(), location: r.headers().location || '', body: r.status() === 200 || r.status() === 403 ? await r.text() : '' };
}
const refused = ( r ) => 403 === r.status || ( 302 === r.status && /business-dashboard/.test( r.location ) );

( async () => {
	const s = JSON.parse( fx( 'setup' ) );
	const ids = s.ids;
	const [ ha, hb ] = s.pairs.hotel;
	const [ ra, rb ] = s.pairs.restaurant;
	const [ va, vb ] = s.pairs.venue;
	const before = fx( 'snapshot' );

	const H = await login( s.logins.hotel.user, s.logins.hotel.pass );
	const R = await login( s.logins.restaurant.user, s.logins.restaurant.pass );
	const V = await login( s.logins.venue.user, s.logins.venue.pass );
	const nonce = ( who, uid, pairs ) => JSON.parse( fx( 'nonces', who.cookie, uid, ...pairs ) );
	const hn = nonce( H, s.logins.hotel.uid, [ 'dash_room:' + ha, 'dash_room_delete:' + ha, 'dash_calendar:' + ha, 'dash_booking:' + ha, 'dash_reply:' + ha, 'dash_invoice_balance:' + ha, 'dash_invoice_pay:' + ha, 'dash_photos:' + ha, 'dash_profile:' + ha, 'dash_bank:' + ha, 'dash_payout:' + ha ] );
	const rn = nonce( R, s.logins.restaurant.uid, [ 'dash_menu:' + ra ] );
	const vn = nonce( V, s.logins.venue.uid, [ 'dash_hall:' + va, 'dash_hall_delete:' + va, 'dash_calendar:' + va ] );
	const f = ( action, biz, n, extra ) => ( { ek_action: action, business_id: String( biz ), _ek_nonce: n[ action + ':' + ( n === hn ? ha : n === rn ? ra : va ) ] || 'x', ...extra } );

	console.log( '1. Control: the attacker\'s own forms work (so refusals below are real, not expired codes)' );
	const ctl = await post( H.ctx, f( 'dash_calendar', ha, hn, { room_id: String( ids.room_a ), op: 'rule_add', label: 'SAMPLE control', from: '2031-01-05', to: '2031-01-06', price: '25000' } ) );
	check( 302 === ctl.status && /section=calendar/.test( ctl.location ), 'Own calendar change accepted' );

	console.log( '2. Opening another business\'s dashboard' );
	const sections = [ 'overview', 'profile', 'photos', 'bookings', 'earnings', 'payouts', 'invoices', 'plan', 'reviews', 'ranking', 'analytics', 'rooms', 'calendar', 'hotel', 'menu', 'restaurant', 'tables', 'orders', 'halls', 'venue' ];
	let leaks = [];
	for ( const [ who, victim, name ] of [ [ H, hb, s.names.hotel[ 1 ] ], [ R, rb, s.names.restaurant[ 1 ] ], [ V, vb, s.names.venue[ 1 ] ] ] ) {
		for ( const sec of sections ) {
			attempts++;
			const html = await ( await who.ctx.get( `/business-dashboard/?business=${ victim }&section=${ sec }` ) ).text();
			if ( html.includes( name ) || html.includes( ids.code_b ) || ! /only open the dashboard of a business you own/.test( html ) ) {
				leaks.push( `${ victim }/${ sec }` );
			}
		}
	}
	check( 0 === leaks.length, `All ${ sections.length * 3 } dashboard pages of other businesses refused` + ( leaks.length ? ' → ' + leaks.join( ', ' ) : '' ) );
	const ownRooms = await ( await H.ctx.get( `/business-dashboard/?section=rooms&room=${ ids.room_b }` ) ).text();
	const ownCal = await ( await H.ctx.get( `/business-dashboard/?section=calendar&room=${ ids.room_b }` ) ).text();
	check( ! ownRooms.includes( `name="room_id" value="${ ids.room_b }"` ) && ! ownCal.includes( `value="${ ids.room_b }"` ), 'Another hotel\'s room cannot be opened inside your own dashboard' );
	const ownHalls = await ( await V.ctx.get( `/business-dashboard/?section=halls&hall=${ ids.hall_b }` ) ).text();
	check( ! ownHalls.includes( `name="hall_id" value="${ ids.hall_b }"` ), 'Another venue\'s hall cannot be opened inside your own dashboard' );
	const ownBookings = await ( await H.ctx.get( '/business-dashboard/?section=bookings' ) ).text();
	check( ! ownBookings.includes( ids.code_b ), 'Your bookings list never shows another hotel\'s bookings' );
	if ( ids.bank_b_last4 && ids.bank_b_last4 !== ids.bank_a_last4 ) { // (SAMPLE businesses may share the same made-up number)
		let seen = false;
		for ( const sec of [ 'payouts', 'profile', 'earnings' ] ) {
			seen = seen || ( await ( await H.ctx.get( `/business-dashboard/?section=${ sec }` ) ).text() ).includes( '••' + ids.bank_b_last4 );
		}
		check( ! seen, 'Another business\'s bank details never appear' );
	}

	console.log( '3. Sending forms for another business (its own number in business_id)' );
	const direct = [];
	for ( const [ who, victim, actions ] of [
		[ H, hb, [ 'dash_profile', 'dash_photos', 'dash_bank', 'dash_payout', 'dash_room', 'dash_room_delete', 'dash_calendar', 'dash_booking', 'dash_reply', 'dash_invoice_balance', 'dash_resubmit', 'dash_hotel', 'dash_plan_buy', 'dash_verify_apply' ] ],
		[ R, rb, [ 'dash_menu', 'dash_restaurant', 'dash_profile' ] ],
		[ V, vb, [ 'dash_hall', 'dash_hall_delete', 'dash_venue', 'dash_calendar' ] ],
	] ) {
		for ( const a of actions ) {
			const r = await post( who.ctx, { ek_action: a, business_id: String( victim ), _ek_nonce: 'x', name: 'HACKED', amount: '1000', op: 'delete_item', id: String( ids.item_b ), room_id: String( ids.room_b ), hall_id: String( ids.hall_b ), booking_id: String( ids.booking_b ), to: 'cancelled', reply: 'HACKED', plan: 'featured', period: 'month' } );
			if ( 403 !== r.status ) {
				direct.push( `${ a }→${ r.status }` );
			}
		}
	}
	check( 0 === direct.length, 'Every form aimed at another business is refused (403)' + ( direct.length ? ' → ' + direct.join( ', ' ) : '' ) );

	console.log( '4. Slipping another business\'s numbers into your own forms (valid security codes)' );
	const sub = async ( label, who, form, expect403 ) => {
		const r = await post( who.ctx, form );
		check( expect403 ? 403 === r.status : refused( r ), `${ label } (${ r.status })` );
	};
	await sub( 'Edit another hotel\'s room', H, f( 'dash_room', ha, hn, { room_id: String( ids.room_b ), room_name: 'HACKED', price: '1000', units: '1', max_guests: '1' } ), true );
	await sub( 'Delete another hotel\'s room', H, f( 'dash_room_delete', ha, hn, { room_id: String( ids.room_b ) } ), true );
	await sub( 'Close dates on another hotel\'s calendar', H, f( 'dash_calendar', ha, hn, { room_id: String( ids.room_b ), op: 'close', from: '2031-02-01', to: '2031-02-03' } ), true );
	await sub( 'Change prices on another hotel\'s calendar', H, f( 'dash_calendar', ha, hn, { room_id: String( ids.room_b ), op: 'price', value: '1000', from: '2031-02-01', to: '2031-02-03' } ), true );
	await sub( 'Delete another hotel\'s price rule', H, f( 'dash_calendar', ha, hn, { room_id: String( ids.room_a ), op: 'rule_delete', rule_id: String( ids.rule_b ) } ), false );
	await sub( 'Cancel another hotel\'s booking', H, f( 'dash_booking', ha, hn, { booking_id: String( ids.booking_b ), to: 'cancelled' } ), true );
	await sub( 'Check in another hotel\'s guest', H, f( 'dash_booking', ha, hn, { booking_id: String( ids.booking_b ), to: 'confirmed' } ), true );
	await sub( 'Reply to another hotel\'s review', H, f( 'dash_reply', ha, hn, { review_id: String( ids.review_b ), reply: 'HACKED reply' } ), false );
	await sub( 'Pay another business\'s invoice from your balance', H, f( 'dash_invoice_balance', ha, hn, { invoice_id: String( ids.invoice_b ) } ), false );
	await sub( 'Open payment for another business\'s invoice', H, f( 'dash_invoice_pay', ha, hn, { invoice_id: String( ids.invoice_b ) } ), false );
	for ( const op of [ 'delete', 'cover', 'left' ] ) {
		await sub( `Photo "${ op }" on another hotel's photo`, H, f( 'dash_photos', ha, hn, { op, photo: String( ids.photo_b ) } ), false );
	}
	for ( const op of [ 'toggle', 'delete_item', 'item_up' ] ) {
		await sub( `Menu "${ op }" on another restaurant's dish`, R, f( 'dash_menu', ra, rn, { op, id: String( ids.item_b ) } ), false );
	}
	for ( const op of [ 'rename_cat', 'delete_cat', 'cat_down' ] ) {
		await sub( `Menu "${ op }" on another restaurant's category`, R, f( 'dash_menu', ra, rn, { op, id: String( ids.cat_b ), cat_name: 'HACKED' } ), false );
	}
	await sub( 'Edit another restaurant\'s dish', R, f( 'dash_menu', ra, rn, { op: 'save_item', id: String( ids.item_b ), item_name: 'HACKED', item_price: '100', category_id: String( ids.cat_a ) } ), true );
	await sub( 'Add a dish into another restaurant\'s category', R, f( 'dash_menu', ra, rn, { op: 'save_item', id: '0', item_name: 'HACKED dish', item_price: '100', category_id: String( ids.cat_b ) } ), false );
	await sub( 'Edit another venue\'s hall', V, f( 'dash_hall', va, vn, { hall_id: String( ids.hall_b ), hall_name: 'HACKED' } ), true );
	await sub( 'Delete another venue\'s hall', V, f( 'dash_hall_delete', va, vn, { hall_id: String( ids.hall_b ) } ), true );
	await sub( 'Close dates on another venue\'s hall', V, f( 'dash_calendar', va, vn, { room_id: String( ids.hall_b ), op: 'close', from: '2031-03-01', to: '2031-03-02' } ), true );
	await sub( 'A venue owner editing a hotel\'s room', V, f( 'dash_calendar', va, vn, { room_id: String( ids.room_b ), op: 'close', from: '2031-03-01', to: '2031-03-02' } ), true );

	console.log( '5. Other doors' );
	attempts += 6;
	const adm = await H.ctx.get( '/wp-admin/' );
	check( 302 === adm.status() && ! /wp-login/.test( adm.headers().location || '' ), 'Business owner sent away from wp-admin' );
	check( 404 === ( await H.ctx.get( '/wp-json/wp/v2/users' ) ).status(), 'User list (usernames) not available' );
	check( ( await H.ctx.get( `/wp-json/wp/v2/ek_business/${ hb }` ) ).status() >= 400, 'No back door to business records through the REST API' );
	const idDoc = await H.ctx.get( `/?ek_private_id=${ hb }` );
	check( 403 === idDoc.status() || ! /application\/pdf|image\//.test( idDoc.headers()[ 'content-type' ] || '' ), 'ID documents only for site staff' );
	check( 403 === ( await H.ctx.get( '/wp-content/uploads/ek-private/' ) ).status(), 'Private files folder closed' );
	const guestPage = await ( await H.ctx.get( `/book/?booking=${ ids.code_b }&key=0000` ) ).text();
	const guestOk = await ( await H.ctx.get( `/book/?booking=${ ids.code_b }&key=${ ids.key_b }` ) ).text();
	const shown = ( html ) => new RegExp( '>[^<]*' + ids.code_b ).test( html ); // The code as visible text (not just echoed in a link).
	check( ! shown( guestPage ) && shown( guestOk ), 'A booking page opens only with its secret link' );
	const ics = await H.ctx.get( `/?ek_ics=${ ids.code_b }&key=0000` );
	check( ! /text\/calendar/.test( ics.headers()[ 'content-type' ] || '' ), 'Calendar file only with the secret link' );

	if ( s.guest ) {
		console.log( '6. Guests only see their own bookings' );
		const G = await login( s.guest.user, s.guest.pass );
		const acc = await ( await G.ctx.get( '/account/?tab=bookings' ) ).text();
		check( acc.includes( s.guest.own_code ) && ! acc.includes( s.guest.other_code ), 'My Account lists my bookings and nobody else\'s' );
		const dash = await G.ctx.get( '/business-dashboard/' );
		check( ! ( await dash.text() ).includes( s.names.hotel[ 1 ] ), 'A guest cannot open any business dashboard' );
		await G.ctx.dispose();
	}

	console.log( '7. Nothing belonging to the victims changed' );
	await post( H.ctx, f( 'dash_calendar', ha, hn, { room_id: String( ids.room_a ), op: 'rule_delete', rule_id: '0' } ) ); // (tidy the control rule below)
	const after = fx( 'snapshot' );
	check( before === after, `Victims' data fingerprint unchanged (${ attempts } attempts)` );
	execSync( `docker compose -f docker-compose.offline.yml run --rm -T cli wp db query "DELETE FROM wp_ek_rate_rules WHERE label='SAMPLE control'"`, { cwd: ROOT, stdio: 'ignore' } );
	fx( 'cleanup' );
	for ( const c of [ H, R, V ] ) {
		await c.ctx.dispose();
	}
	console.log( failures ? `\n${ failures } check(s) FAILED` : '\nAll business-isolation checks passed' );
	process.exit( failures ? 1 : 0 );
} )().catch( ( e ) => { console.error( e ); try { fx( 'cleanup' ); } catch ( x ) {} process.exit( 1 ); } );
