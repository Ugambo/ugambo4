<?php
/**
 * Booking confirmation / status page (reached from the email link).
 *
 * @var object $b
 */
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Money;
use EK\Payments;

defined( 'ABSPATH' ) || exit;

$d      = $b->details;
$hotel  = Business::profile( $b->business_id );
$due    = (int) $b->total_kobo - (int) $b->paid_kobo;
$dir    = 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $hotel['lat'] . ',' . $hotel['lng'] );
$heads  = array(
	'pending_payment'  => __( 'Almost done: complete your payment', 'explore-katsina' ),
	'new'              => __( 'Booking received: waiting for the hotel to confirm', 'explore-katsina' ),
	'confirmed'        => __( 'Your booking is confirmed', 'explore-katsina' ),
	'checked_in'       => __( 'Enjoy your stay', 'explore-katsina' ),
	'checked_out'      => __( 'Thank you for staying', 'explore-katsina' ),
	'declined'         => __( 'The hotel could not accept this booking', 'explore-katsina' ),
	'cancelled'        => __( 'This booking was cancelled', 'explore-katsina' ),
	'expired'          => __( 'This booking expired because payment was not completed', 'explore-katsina' ),
	'no_show'          => __( 'Marked as no-show', 'explore-katsina' ),
	'payment_conflict' => __( 'We received your payment but need to contact you', 'explore-katsina' ),
);
$good = in_array( $b->status, array( 'new', 'confirmed', 'checked_in', 'checked_out' ), true );
?>
<div class="ek ek-book" style="max-width:760px;margin:0 auto">
	<div class="ek-confirm-head <?php echo $good ? 'is-good' : 'is-other'; ?>">
		<p class="ek-eyebrow" style="margin:0"><?php esc_html_e( 'Booking code', 'explore-katsina' ); ?></p>
		<p class="ek-code"><?php echo esc_html( $b->code ); ?></p>
		<h1 style="margin:0"><?php echo esc_html( $heads[ $b->status ] ?? $b->status ); ?></h1>
	</div>

	<?php if ( 'pending_payment' === $b->status ) : ?>
		<?php $pay = Payments::start( $b ); ?>
		<?php if ( ! is_wp_error( $pay ) ) : ?><p><a class="ek-btn" href="<?php echo esc_url( $pay ); ?>"><?php /* translators: %s: amount */ printf( esc_html__( 'Pay %s now', 'explore-katsina' ), esc_html( Money::format( $d['pay_now'] ?? 0 ) ) ); ?></a> <span class="ek-small ek-muted"><?php esc_html_e( 'Your room is held for 15 minutes.', 'explore-katsina' ); ?></span></p><?php endif; ?>
	<?php elseif ( 'expired' === $b->status || ( 'cancelled' === $b->status && ! (int) $b->paid_kobo ) ) : ?>
		<p><a class="ek-btn" href="<?php echo esc_url( $hotel['url'] . '#rooms' ); ?>"><?php esc_html_e( 'Try again', 'explore-katsina' ); ?></a></p>
	<?php endif; ?>

	<section class="ek-card ek-stack">
		<div class="ek-row ek-row--between"><h2 style="margin:0"><?php echo esc_html( $d['hotel'] ?? '' ); ?></h2><span class="ek-pill"><?php echo esc_html( Dashboard::booking_status_label( $b->status ) ); ?></span></div>
		<dl class="ek-dl">
			<dt><?php esc_html_e( 'Room', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ( $d['room'] ?? '' ) . ' × ' . (int) $b->quantity ); ?></dd>
			<dt><?php esc_html_e( 'Check-in', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'l j F Y', strtotime( $b->start_date ) ) ); ?> · <?php /* translators: %s: time */ printf( esc_html__( 'from %s', 'explore-katsina' ), esc_html( $d['checkin_at'] ?? '' ) ); ?></dd>
			<dt><?php esc_html_e( 'Check-out', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'l j F Y', strtotime( $b->end_date ) ) ); ?> · <?php /* translators: %s: time */ printf( esc_html__( 'by %s', 'explore-katsina' ), esc_html( $d['checkout_at'] ?? '' ) ); ?></dd>
			<dt><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></dt><dd><?php echo (int) $b->guests; ?> · <?php echo esc_html( $b->customer_name ); ?></dd>
			<dt><?php esc_html_e( 'Total', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( Money::format( $b->total_kobo ) ); ?></strong></dd>
			<?php if ( (int) $b->paid_kobo ) : ?><dt><?php esc_html_e( 'Paid online', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $b->paid_kobo ) ); ?></dd><?php endif; ?>
			<?php if ( $due > 0 && ! in_array( $b->status, array( 'cancelled', 'declined', 'expired' ), true ) ) : ?><dt><?php esc_html_e( 'Pay at the hotel', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $due ) ); ?></dd><?php endif; ?>
			<dt><?php esc_html_e( 'Cancellation', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ( $b->policy['label'] ?? '' ) . ': ' . ( $b->policy['text'] ?? '' ) ); ?></dd>
		</dl>
		<div class="ek-row">
			<a class="ek-btn ek-btn--night" href="<?php echo esc_url( $dir ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a>
			<?php if ( $hotel['whatsapp'] ) : ?><a class="ek-btn ek-btn--wa" href="<?php echo esc_url( 'https://wa.me/' . ltrim( $hotel['whatsapp'], '+' ) . '?text=' . rawurlencode( sprintf( /* translators: %s: code */ __( 'Hello, about my booking %s', 'explore-katsina' ), $b->code ) ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'WhatsApp the hotel', 'explore-katsina' ); ?></a><?php endif; ?>
			<a class="ek-btn ek-btn--ghost" href="<?php echo esc_url( 'tel:' . $hotel['phone'] ); ?>"><?php esc_html_e( 'Call the hotel', 'explore-katsina' ); ?></a>
		</div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Keep this link: it shows the latest status of your booking. Cancelling online and adding to your calendar are coming soon.', 'explore-katsina' ); ?></p>
	</section>
</div>
