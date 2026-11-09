<?php
/**
 * Event centre part of the public business page: amenities, halls, capacity, prices, availability.
 *
 * @var array $b
 */
use EK\Availability;
use EK\Halls;
use EK\Hotel;
use EK\Install;
use EK\Money;
use EK\Venue;

defined( 'ABSPATH' ) || exit;

$s      = Venue::settings( $b['id'] );
$halls  = Halls::for_venue( $b['id'] );
$amen   = Venue::amenities();
$sets   = Halls::settings_labels();
$today  = Availability::today();
$date   = isset( $_GET['date'] ) && Availability::valid_date( sanitize_text_field( wp_unslash( $_GET['date'] ) ) ) && sanitize_text_field( wp_unslash( $_GET['date'] ) ) >= $today ? sanitize_text_field( wp_unslash( $_GET['date'] ) ) : ''; // phpcs:ignore
$guests = absint( $_GET['guests'] ?? 0 ); // phpcs:ignore
$layout = 'standing' === ( $_GET['layout'] ?? '' ) ? 'standing' : 'seated'; // phpcs:ignore
$policy = Hotel::policies()[ $s['policy'] ];
if ( $date ) {
	Availability::prefetch( wp_list_pluck( $halls, 'id' ), $date, ( new DateTimeImmutable( $date, Availability::tz() ) )->modify( '+1 day' )->format( 'Y-m-d' ) );
}
?>
<?php if ( $s['amenities'] ) : ?>
	<section aria-labelledby="vam-h"><h2 id="vam-h"><?php esc_html_e( 'Amenities', 'explore-katsina' ); ?></h2><ul class="ek-amenities"><?php foreach ( $s['amenities'] as $k ) : ?><li><?php echo esc_html( $amen[ $k ] ); ?></li><?php endforeach; ?></ul></section>
<?php endif; ?>

<section class="ek-card ek-stack" id="halls" aria-labelledby="halls-h">
	<h2 id="halls-h" style="margin:0"><?php esc_html_e( 'Halls, prices and availability', 'explore-katsina' ); ?></h2>
	<form class="ek-dates" method="get" action="<?php echo esc_url( get_permalink( $b['id'] ) . '#halls' ); ?>">
		<div class="ek-field"><label for="vh-date"><?php esc_html_e( 'Event date', 'explore-katsina' ); ?></label><input type="date" id="vh-date" name="date" min="<?php echo esc_attr( $today ); ?>" value="<?php echo esc_attr( $date ); ?>" required></div>
		<div class="ek-field"><label for="vh-g"><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></label><input type="number" id="vh-g" name="guests" min="1" value="<?php echo $guests ? (int) $guests : ''; ?>" placeholder="200"></div>
		<div class="ek-field"><label for="vh-l"><?php esc_html_e( 'Layout', 'explore-katsina' ); ?></label><select id="vh-l" name="layout"><option value="seated" <?php selected( $layout, 'seated' ); ?>><?php esc_html_e( 'Seated', 'explore-katsina' ); ?></option><option value="standing" <?php selected( $layout, 'standing' ); ?>><?php esc_html_e( 'Standing', 'explore-katsina' ); ?></option></select></div>
		<span></span>
		<button class="ek-btn" type="submit"><?php esc_html_e( 'Check availability', 'explore-katsina' ); ?></button>
	</form>
	<?php if ( ! $halls ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'Halls coming soon', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Contact the venue directly.', 'explore-katsina' ); ?></div><?php endif; ?>
	<?php
	foreach ( $halls as $h ) :
		$cap   = 'standing' === $layout ? $h['capacity_standing'] : $h['capacity_seated'];
		$q     = $date ? Venue::quote( $h, $date, $date ) : null;
		$fits  = ! $guests || $cap >= $guests;
		$book  = add_query_arg( array( 'hall' => $h['id'], 'date' => $date, 'guests' => $guests, 'layout' => $layout ), Install::page_url( 'book' ) );
		?>
		<article class="ek-room" aria-labelledby="hall-<?php echo (int) $h['id']; ?>">
			<div class="ek-room-img"><?php echo $h['photos'] ? wp_get_attachment_image( $h['photos'][0], 'medium', false, array( 'loading' => 'lazy', 'alt' => $h['name'] ) ) : ( $b['photos'] ? wp_get_attachment_image( $b['photos'][0], 'medium', false, array( 'loading' => 'lazy', 'alt' => '' ) ) : '' ); // phpcs:ignore ?></div>
			<div class="ek-room-body">
				<h3 id="hall-<?php echo (int) $h['id']; ?>" style="margin:0"><?php echo esc_html( $h['name'] ); ?></h3>
				<p class="ek-small" style="margin:0"><strong><?php /* translators: %s: number */ printf( esc_html__( '%s seated', 'explore-katsina' ), esc_html( number_format_i18n( $h['capacity_seated'] ) ) ); ?></strong> · <strong><?php /* translators: %s: number */ printf( esc_html__( '%s standing', 'explore-katsina' ), esc_html( number_format_i18n( $h['capacity_standing'] ) ) ); ?></strong> · <?php echo esc_html( $sets[ $h['setting'] ] ?? '' ); ?></p>
				<?php if ( $h['description'] ) : ?><p class="ek-small" style="margin:0"><?php echo esc_html( $h['description'] ); ?></p><?php endif; ?>
			</div>
			<div class="ek-room-price">
				<?php if ( $q ) : ?>
					<?php if ( ! $fits ) : ?>
						<span class="ek-small ek-muted"><?php /* translators: %d: capacity */ printf( esc_html__( 'Too small: holds %d', 'explore-katsina' ), (int) $cap ); ?></span>
					<?php elseif ( $q['ok'] ) : ?>
						<strong class="ek-price-big"><?php echo esc_html( Money::format( $q['total'] ) ); ?></strong>
						<span class="ek-small"><?php echo esc_html( wp_date( 'D j M Y', strtotime( $date ) ) ); ?></span>
						<span class="ek-small ek-muted"><?php /* translators: %s: deposit */ printf( esc_html__( 'Deposit %s online', 'explore-katsina' ), esc_html( Money::format( (int) round( $q['total'] * $s['deposit_pct'] / 100 ) ) ) ); ?></span>
						<a class="ek-btn" href="<?php echo esc_url( $book ); ?>"><?php echo 'instant' === $s['booking_mode'] ? esc_html__( 'Book now', 'explore-katsina' ) : esc_html__( 'Request to book', 'explore-katsina' ); ?></a>
					<?php else : ?>
						<span class="ek-pill ek-pill--bad"><?php esc_html_e( 'Booked on this date', 'explore-katsina' ); ?></span>
					<?php endif; ?>
				<?php else : ?>
					<strong class="ek-price-big"><?php echo esc_html( Money::format( $h['price'] ) ); ?></strong>
					<span class="ek-small"><?php echo 'event' === $h['pricing'] ? esc_html__( 'per event', 'explore-katsina' ) : esc_html__( 'per day', 'explore-katsina' ); ?><?php echo $h['weekend_price'] ? ' · ' . esc_html__( 'Fri/Sat', 'explore-katsina' ) . ' ' . esc_html( Money::format( $h['weekend_price'] ) ) : ''; ?></span>
					<a class="ek-btn ek-btn--ghost" href="#halls"><?php esc_html_e( 'Choose a date', 'explore-katsina' ); ?></a>
				<?php endif; ?>
			</div>
		</article>
	<?php endforeach; ?>
	<p class="ek-small ek-muted" style="margin:0"><?php echo 'instant' === $s['booking_mode'] ? esc_html__( 'Instant booking: pay the deposit online to secure the date.', 'explore-katsina' ) : esc_html__( 'Request to book: the venue replies within 48 hours; then you pay the deposit online to secure the date.', 'explore-katsina' ); ?> <?php /* translators: %d: percent */ printf( esc_html__( 'Deposit: %d%% of the hall price.', 'explore-katsina' ), (int) $s['deposit_pct'] ); ?></p>
</section>

<section aria-labelledby="vpol-h">
	<h2 id="vpol-h"><?php esc_html_e( 'Good to know', 'explore-katsina' ); ?></h2>
	<dl class="ek-dl">
		<dt><?php esc_html_e( 'Cancellation', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( $policy['label'] ); ?>:</strong> <?php echo esc_html( str_replace( __( 'check-in', 'explore-katsina' ), __( 'the event', 'explore-katsina' ), $policy['text'] ) ); ?><?php echo $s['policy_note'] ? ' ' . esc_html( $s['policy_note'] ) : ''; ?></dd>
		<?php if ( $s['rules'] ) : ?><dt><?php esc_html_e( 'Venue rules', 'explore-katsina' ); ?></dt><dd><?php echo nl2br( esc_html( $s['rules'] ) ); ?></dd><?php endif; ?>
	</dl>
</section>
