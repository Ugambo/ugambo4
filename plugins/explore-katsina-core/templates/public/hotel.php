<?php
/**
 * Hotel-specific part of the public business page: dates, rooms, totals, amenities, policies.
 *
 * @var array $b Business profile.
 */
use EK\Availability;
use EK\Hotel;
use EK\Hotel_Search;
use EK\Install;
use EK\Money;
use EK\Payments;
use EK\Rooms;

defined( 'ABSPATH' ) || exit;

$s         = Hotel::settings( $b['id'] );
$p         = Hotel_Search::params();
$rooms     = Rooms::for_hotel( $b['id'] );
$today     = Availability::today();
$has_dates = $p['checkin'] && $p['checkout'];
$amen      = Hotel::amenities();
$ramen     = Hotel::room_amenities();
$beds      = Hotel::bed_types();
$policy    = Hotel::policies()[ $s['policy'] ];
$nights    = $has_dates ? count( Availability::nights( $p['checkin'], $p['checkout'] ) ) : 0;
if ( $has_dates ) {
	Availability::prefetch( wp_list_pluck( $rooms, 'id' ), $p['checkin'], $p['checkout'] );
}
$online = Payments::online_available();
?>
<?php if ( $s['stars'] ) : ?>
	<p class="ek-hotel-stars-line"><span class="ek-hotel-stars"><?php echo esc_html( str_repeat( '★', $s['stars'] ) ); ?></span> <span class="ek-small ek-muted"><?php echo $s['stars_verified'] ? esc_html__( 'Verified star rating', 'explore-katsina' ) : esc_html__( 'Self-declared star rating', 'explore-katsina' ); ?></span></p>
<?php endif; ?>

<section class="ek-card ek-stack" id="rooms" aria-labelledby="rooms-h">
	<h2 id="rooms-h" style="margin:0"><?php esc_html_e( 'Rooms and prices', 'explore-katsina' ); ?></h2>
	<form class="ek-dates" method="get" action="<?php echo esc_url( get_permalink( $b['id'] ) . '#rooms' ); ?>" data-ek-dates-form>
		<div class="ek-field"><label for="h-in"><?php esc_html_e( 'Check-in', 'explore-katsina' ); ?></label><input type="date" id="h-in" name="checkin" min="<?php echo esc_attr( $today ); ?>" value="<?php echo esc_attr( $p['checkin'] ); ?>" required data-ek-checkin></div>
		<div class="ek-field"><label for="h-out"><?php esc_html_e( 'Check-out', 'explore-katsina' ); ?></label><input type="date" id="h-out" name="checkout" min="<?php echo esc_attr( $today ); ?>" value="<?php echo esc_attr( $p['checkout'] ); ?>" required data-ek-checkout></div>
		<div class="ek-field"><label for="h-g"><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></label><input type="number" id="h-g" name="guests" min="1" max="40" value="<?php echo (int) $p['guests']; ?>"></div>
		<div class="ek-field"><label for="h-r"><?php esc_html_e( 'Rooms', 'explore-katsina' ); ?></label><input type="number" id="h-r" name="rooms" min="1" max="20" value="<?php echo (int) $p['rooms']; ?>"></div>
		<button class="ek-btn" type="submit"><?php esc_html_e( 'Check availability', 'explore-katsina' ); ?></button>
	</form>
	<?php if ( ! empty( $p['date_error'] ) ) : ?><p class="ek-notice ek-notice--error" style="margin:0"><?php echo esc_html( $p['date_error'] ); ?></p><?php endif; ?>

	<?php if ( ! $rooms ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'Rooms coming soon', 'explore-katsina' ); ?></strong><?php esc_html_e( 'This hotel has not added its rooms yet. Contact them directly.', 'explore-katsina' ); ?></div>
	<?php endif; ?>

	<?php
	foreach ( $rooms as $room ) :
		$quote = $has_dates ? Availability::quote( $room, $p['checkin'], $p['checkout'], $p['rooms'] ) : null;
		$fits  = $room['max_guests'] * $p['rooms'] >= $p['guests'];
		$book  = add_query_arg(
			array(
				'room'     => $room['id'],
				'checkin'  => $p['checkin'],
				'checkout' => $p['checkout'],
				'guests'   => $p['guests'],
				'rooms'    => $p['rooms'],
			),
			Install::page_url( 'book' )
		);
		?>
		<article class="ek-room" aria-labelledby="room-<?php echo (int) $room['id']; ?>">
			<div class="ek-room-img">
				<?php echo $room['photos'] ? wp_get_attachment_image( $room['photos'][0], 'medium', false, array( 'loading' => 'lazy', 'alt' => $room['name'] ) ) : ( $b['photos'] ? wp_get_attachment_image( $b['photos'][0], 'medium', false, array( 'loading' => 'lazy', 'alt' => '' ) ) : '' ); // phpcs:ignore ?>
			</div>
			<div class="ek-room-body">
				<h3 id="room-<?php echo (int) $room['id']; ?>" style="margin:0"><?php echo esc_html( $room['name'] ); ?></h3>
				<p class="ek-small ek-muted" style="margin:0">
					<?php echo esc_html( $beds[ $room['bed'] ] ?? '' ); ?> · <?php /* translators: %d: guests */ printf( esc_html( _n( 'Up to %d guest', 'Up to %d guests', $room['max_guests'], 'explore-katsina' ) ), (int) $room['max_guests'] ); ?><?php echo $room['size'] ? ' · ' . (int) $room['size'] . ' m²' : ''; ?>
				</p>
				<?php if ( $room['amenities'] ) : ?><p class="ek-small" style="margin:0"><?php echo esc_html( implode( ' · ', array_map( static fn( $k ) => $ramen[ $k ] ?? $k, $room['amenities'] ) ) ); ?></p><?php endif; ?>
				<?php if ( $room['description'] ) : ?><p class="ek-small" style="margin:0"><?php echo esc_html( $room['description'] ); ?></p><?php endif; ?>
			</div>
			<div class="ek-room-price">
				<?php if ( $quote ) : ?>
					<?php if ( ! $fits ) : ?>
						<span class="ek-small ek-muted"><?php /* translators: %d: rooms */ printf( esc_html__( 'Choose %d or more rooms for your group', 'explore-katsina' ), (int) ceil( $p['guests'] / $room['max_guests'] ) ); ?></span>
					<?php elseif ( $quote['ok'] ) : ?>
						<strong class="ek-price-big"><?php echo esc_html( Money::format( $quote['total'] ) ); ?></strong>
						<span class="ek-small"><?php /* translators: 1: nights, 2: rooms */ printf( esc_html__( 'total for %1$d night(s), %2$d room(s)', 'explore-katsina' ), (int) $nights, (int) $p['rooms'] ); ?></span>
						<span class="ek-small ek-muted"><?php echo esc_html( Money::format( $quote['avg'] ) ); ?> <?php esc_html_e( 'avg / night', 'explore-katsina' ); ?></span>
						<?php if ( $quote['available'] <= 3 ) : ?><span class="ek-small" style="color:var(--ek-crimson);font-weight:700"><?php /* translators: %d: rooms */ printf( esc_html( _n( 'Only %d left', 'Only %d left', $quote['available'], 'explore-katsina' ) ), (int) $quote['available'] ); ?></span><?php endif; ?>
						<a class="ek-btn" href="<?php echo esc_url( $book ); ?>"><?php esc_html_e( 'Book now', 'explore-katsina' ); ?></a>
					<?php else : ?>
						<span class="ek-pill ek-pill--bad"><?php echo esc_html( $quote['reason'] ); ?></span>
					<?php endif; ?>
				<?php else : ?>
					<span class="ek-small ek-muted"><?php esc_html_e( 'from', 'explore-katsina' ); ?></span>
					<strong class="ek-price-big"><?php echo esc_html( Money::format( min( array_filter( array( $room['price'], $room['weekend_price'] ) ) ) ) ); ?></strong>
					<span class="ek-small"><?php esc_html_e( 'per night', 'explore-katsina' ); ?></span>
					<a class="ek-btn ek-btn--ghost" href="#rooms" data-ek-focus="h-in"><?php esc_html_e( 'Choose dates', 'explore-katsina' ); ?></a>
				<?php endif; ?>
			</div>
		</article>
	<?php endforeach; ?>
	<p class="ek-small ek-muted" style="margin:0">
		<?php
		$ways = array();
		if ( $s['pay_full'] && $online ) {
			$ways[] = __( 'pay online in full', 'explore-katsina' );
		}
		if ( $s['pay_deposit'] && $online ) {
			/* translators: %d: percent */
			$ways[] = sprintf( __( 'pay a %d%% deposit online', 'explore-katsina' ), $s['deposit_pct'] );
		}
		if ( $s['pay_at_venue'] ) {
			$ways[] = __( 'pay at the hotel', 'explore-katsina' );
		}
		/* translators: %s: payment options */
		echo esc_html( sprintf( __( 'Payment: %s.', 'explore-katsina' ), implode( ', ', $ways ) ) );
		?>
	</p>
</section>

<?php if ( $s['amenities'] ) : ?>
	<section aria-labelledby="amen-h">
		<h2 id="amen-h"><?php esc_html_e( 'Amenities', 'explore-katsina' ); ?></h2>
		<ul class="ek-amenities"><?php foreach ( $s['amenities'] as $k ) : ?><li><?php echo esc_html( $amen[ $k ] ); ?></li><?php endforeach; ?></ul>
	</section>
<?php endif; ?>

<section aria-labelledby="pol-h">
	<h2 id="pol-h"><?php esc_html_e( 'Good to know', 'explore-katsina' ); ?></h2>
	<dl class="ek-dl">
		<dt><?php esc_html_e( 'Check-in', 'explore-katsina' ); ?></dt><dd><?php /* translators: %s: time */ printf( esc_html__( 'From %s', 'explore-katsina' ), esc_html( $s['checkin'] ) ); ?></dd>
		<dt><?php esc_html_e( 'Check-out', 'explore-katsina' ); ?></dt><dd><?php /* translators: %s: time */ printf( esc_html__( 'By %s', 'explore-katsina' ), esc_html( $s['checkout'] ) ); ?></dd>
		<dt><?php esc_html_e( 'Cancellation', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( $policy['label'] ); ?>:</strong> <?php echo esc_html( $policy['text'] ); ?><?php echo $s['policy_note'] ? ' ' . esc_html( $s['policy_note'] ) : ''; ?></dd>
		<?php if ( $s['house_rules'] ) : ?><dt><?php esc_html_e( 'House rules', 'explore-katsina' ); ?></dt><dd><?php echo nl2br( esc_html( $s['house_rules'] ) ); ?></dd><?php endif; ?>
	</dl>
</section>
