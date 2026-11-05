<?php
/**
 * Availability calendar & prices per room category.
 *
 * @var array $b
 */
use EK\Availability;
use EK\Dashboard;
use EK\Money;
use EK\Rooms;

defined( 'ABSPATH' ) || exit;

$rooms = Rooms::for_hotel( $b['id'], true );
if ( ! $rooms ) :
	?>
	<div class="ek-empty"><strong><?php esc_html_e( 'Add a room category first', 'explore-katsina' ); ?></strong><a href="<?php echo esc_url( Dashboard::url( 'rooms', $b['id'], array( 'room' => 'new' ) ) ); ?>"><?php esc_html_e( 'Add room category', 'explore-katsina' ); ?></a></div>
	<?php
	return;
endif;

$room_id = absint( $_GET['room'] ?? 0 ); // phpcs:ignore
$room    = null;
foreach ( $rooms as $r ) {
	if ( $r['id'] === $room_id ) {
		$room = $r;
	}
}
$room  = $room ? $room : $rooms[0];
$tz    = Availability::tz();
$month = sanitize_text_field( $_GET['month'] ?? '' ); // phpcs:ignore
$first = preg_match( '/^\d{4}-\d{2}$/', $month ) ? new DateTimeImmutable( $month . '-01', $tz ) : new DateTimeImmutable( 'first day of this month', $tz );
$min   = new DateTimeImmutable( 'first day of this month', $tz );
$first = $first < $min ? $min : $first;
$days  = Availability::month( $room, (int) $first->format( 'Y' ), (int) $first->format( 'n' ) );
$today = Availability::today();
$prev  = $first->modify( '-1 month' );
$next  = $first->modify( '+1 month' );
$lead  = (int) $first->format( 'N' ) - 1;
$rules = Availability::rules( $room['id'] );
$mkey  = $first->format( 'Y-m' );
?>
<nav class="ek-row" aria-label="<?php esc_attr_e( 'Room category', 'explore-katsina' ); ?>">
	<?php foreach ( $rooms as $r ) : ?>
		<a class="ek-pill" href="<?php echo esc_url( Dashboard::url( 'calendar', $b['id'], array( 'room' => $r['id'], 'month' => $mkey ) ) ); ?>"<?php echo $r['id'] === $room['id'] ? ' aria-current="true" style="background:var(--ek-night);color:#fff"' : ''; ?>><?php echo esc_html( $r['name'] ); ?></a>
	<?php endforeach; ?>
</nav>

<section class="ek-card" aria-labelledby="cal-h">
	<div class="ek-row ek-row--between" style="margin-bottom:10px">
		<h2 id="cal-h" style="margin:0"><?php echo esc_html( $room['name'] ); ?> · <?php echo esc_html( wp_date( 'F Y', $first->getTimestamp(), $tz ) ); ?></h2>
		<div class="ek-row">
			<?php if ( $first > $min ) : ?><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'calendar', $b['id'], array( 'room' => $room['id'], 'month' => $prev->format( 'Y-m' ) ) ) ); ?>" aria-label="<?php esc_attr_e( 'Previous month', 'explore-katsina' ); ?>">←</a><?php endif; ?>
			<a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'calendar', $b['id'], array( 'room' => $room['id'], 'month' => $next->format( 'Y-m' ) ) ) ); ?>" aria-label="<?php esc_attr_e( 'Next month', 'explore-katsina' ); ?>">→</a>
		</div>
	</div>
	<p class="ek-small ek-muted" style="margin:0 0 10px"><?php /* translators: 1: rooms, 2: price */ printf( esc_html__( '%1$d rooms · normal price %2$s per night', 'explore-katsina' ), (int) $room['units'], esc_html( Money::format( $room['price'] ) ) ); ?><?php echo $room['weekend_price'] ? ' · ' . esc_html__( 'Fri & Sat nights', 'explore-katsina' ) . ' ' . esc_html( Money::format( $room['weekend_price'] ) ) : ''; ?></p>
	<div class="ek-cal" role="grid" aria-labelledby="cal-h">
		<?php foreach ( array( __( 'Mon', 'explore-katsina' ), __( 'Tue', 'explore-katsina' ), __( 'Wed', 'explore-katsina' ), __( 'Thu', 'explore-katsina' ), __( 'Fri', 'explore-katsina' ), __( 'Sat', 'explore-katsina' ), __( 'Sun', 'explore-katsina' ) ) as $wd ) : ?>
			<div class="ek-cal-head" role="columnheader"><?php echo esc_html( $wd ); ?></div>
		<?php endforeach; ?>
		<?php for ( $i = 0; $i < $lead; $i++ ) : ?><div class="ek-cal-day is-blank" aria-hidden="true"></div><?php endfor; ?>
		<?php
		foreach ( $days as $date => $n ) :
			$past  = $date < $today;
			$class = 'ek-cal-day';
			if ( $past ) {
				$class .= ' is-past';
			} elseif ( $n['closed'] ) {
				$class .= ' is-closed';
			} elseif ( 0 === $n['available'] ) {
				$class .= ' is-full';
			} elseif ( $n['available'] < $room['units'] ) {
				$class .= ' is-some';
			}
			if ( 'base' !== $n['why'] ) {
				$class .= ' is-priced';
			}
			$label = $n['closed'] ? __( 'Closed', 'explore-katsina' ) : sprintf( /* translators: 1: free, 2: total */ __( '%1$d/%2$d free', 'explore-katsina' ), $n['available'], $room['units'] );
			?>
			<div class="<?php echo esc_attr( $class ); ?>" role="gridcell" aria-label="<?php echo esc_attr( wp_date( 'j F', strtotime( $date ) ) . ': ' . $label . ', ' . Money::format( $n['price'] ) ); ?>">
				<span class="ek-cal-n"><?php echo (int) substr( $date, 8 ); ?></span>
				<?php if ( ! $past ) : ?>
					<span class="ek-cal-a"><?php echo esc_html( $n['closed'] ? __( 'Closed', 'explore-katsina' ) : $n['available'] . '/' . $room['units'] ); ?></span>
					<span class="ek-cal-p"><?php echo esc_html( '₦' . ( $n['price'] >= 10000000 ? round( $n['price'] / 10000000, 1 ) . 'm' : round( $n['price'] / 100000, 1 ) . 'k' ) ); ?></span>
				<?php endif; ?>
			</div>
		<?php endforeach; ?>
	</div>
	<ul class="ek-cal-legend">
		<li><i class="is-some"></i><?php esc_html_e( 'Some rooms booked', 'explore-katsina' ); ?></li>
		<li><i class="is-full"></i><?php esc_html_e( 'Sold out', 'explore-katsina' ); ?></li>
		<li><i class="is-closed"></i><?php esc_html_e( 'Closed', 'explore-katsina' ); ?></li>
		<li><i class="is-priced"></i><?php esc_html_e( 'Special / seasonal / weekend price', 'explore-katsina' ); ?></li>
	</ul>
</section>

<div class="ek-grid ek-grid--2">
	<form class="ek-card ek-stack" method="post" aria-labelledby="cal-change">
		<?php echo Dashboard::nonce_fields( 'dash_calendar', $b['id'] ); // phpcs:ignore ?>
		<input type="hidden" name="room_id" value="<?php echo (int) $room['id']; ?>">
		<input type="hidden" name="month" value="<?php echo esc_attr( $mkey ); ?>">
		<h2 id="cal-change" style="margin:0"><?php esc_html_e( 'Change dates', 'explore-katsina' ); ?></h2>
		<div class="ek-grid ek-grid--2">
			<div class="ek-field"><label for="c-from"><?php esc_html_e( 'From', 'explore-katsina' ); ?></label><input type="date" id="c-from" name="from" min="<?php echo esc_attr( $today ); ?>" required></div>
			<div class="ek-field"><label for="c-to"><?php esc_html_e( 'To (including)', 'explore-katsina' ); ?></label><input type="date" id="c-to" name="to" min="<?php echo esc_attr( $today ); ?>" required></div>
		</div>
		<div class="ek-field">
			<label for="c-op"><?php esc_html_e( 'What to do', 'explore-katsina' ); ?></label>
			<select id="c-op" name="op">
				<option value="close"><?php esc_html_e( 'Close these dates (no bookings)', 'explore-katsina' ); ?></option>
				<option value="open"><?php esc_html_e( 'Re-open these dates', 'explore-katsina' ); ?></option>
				<option value="block"><?php esc_html_e( 'Mark some rooms unavailable (e.g. repairs)', 'explore-katsina' ); ?></option>
				<option value="price"><?php esc_html_e( 'Set a special price per night', 'explore-katsina' ); ?></option>
				<option value="clear_price"><?php esc_html_e( 'Remove special price', 'explore-katsina' ); ?></option>
			</select>
		</div>
		<div class="ek-field"><label for="c-val"><?php esc_html_e( 'Number of unavailable rooms, or price (₦)', 'explore-katsina' ); ?></label><input type="text" id="c-val" name="value" inputmode="numeric"><span class="ek-hint"><?php esc_html_e( 'Only needed for "Mark some rooms unavailable" and "Set a special price".', 'explore-katsina' ); ?></span></div>
		<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Apply', 'explore-katsina' ); ?></button></div>
	</form>

	<section class="ek-card ek-stack" aria-labelledby="season-h">
		<h2 id="season-h" style="margin:0"><?php esc_html_e( 'Seasonal & peak prices', 'explore-katsina' ); ?></h2>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'For busy periods such as Sallah and Durbar. A seasonal price replaces the normal and weekend price on those nights.', 'explore-katsina' ); ?></p>
		<?php if ( $rules ) : ?>
			<ul class="ek-rules">
				<?php foreach ( $rules as $rule ) : ?>
					<li>
						<span><strong><?php echo esc_html( $rule->label ? $rule->label : __( 'Seasonal price', 'explore-katsina' ) ); ?></strong><br><span class="ek-small ek-muted"><?php echo esc_html( wp_date( 'j M Y', strtotime( $rule->start_date ) ) . ' – ' . wp_date( 'j M Y', strtotime( $rule->end_date ) ) ); ?> · <?php echo esc_html( Money::format( $rule->price_kobo ) ); ?></span></span>
						<form method="post"><?php echo Dashboard::nonce_fields( 'dash_calendar', $b['id'] ); // phpcs:ignore ?><input type="hidden" name="room_id" value="<?php echo (int) $room['id']; ?>"><input type="hidden" name="op" value="rule_delete"><input type="hidden" name="rule_id" value="<?php echo (int) $rule->id; ?>"><input type="hidden" name="month" value="<?php echo esc_attr( $mkey ); ?>"><button class="ek-link-btn" type="submit" data-ek-confirm="<?php esc_attr_e( 'Sure?', 'explore-katsina' ); ?>"><?php esc_html_e( 'Remove', 'explore-katsina' ); ?></button></form>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>
		<form method="post" class="ek-stack">
			<?php echo Dashboard::nonce_fields( 'dash_calendar', $b['id'] ); // phpcs:ignore ?>
			<input type="hidden" name="room_id" value="<?php echo (int) $room['id']; ?>">
			<input type="hidden" name="op" value="rule_add">
			<input type="hidden" name="month" value="<?php echo esc_attr( $mkey ); ?>">
			<div class="ek-field"><label for="s-label"><?php esc_html_e( 'Name', 'explore-katsina' ); ?></label><input type="text" id="s-label" name="label" placeholder="<?php esc_attr_e( 'e.g. Sallah / Durbar peak', 'explore-katsina' ); ?>" maxlength="100"></div>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field"><label for="s-from"><?php esc_html_e( 'From', 'explore-katsina' ); ?></label><input type="date" id="s-from" name="from" min="<?php echo esc_attr( $today ); ?>" required></div>
				<div class="ek-field"><label for="s-to"><?php esc_html_e( 'To (including)', 'explore-katsina' ); ?></label><input type="date" id="s-to" name="to" min="<?php echo esc_attr( $today ); ?>" required></div>
			</div>
			<div class="ek-field"><label for="s-price"><?php esc_html_e( 'Price per night (₦)', 'explore-katsina' ); ?></label><input type="text" id="s-price" name="price" inputmode="numeric" required></div>
			<div><button class="ek-btn ek-btn--night" type="submit"><?php esc_html_e( 'Add seasonal price', 'explore-katsina' ); ?></button></div>
		</form>
	</section>
</div>
