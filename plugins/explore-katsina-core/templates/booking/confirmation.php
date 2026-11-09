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
$kind   = $b->kind;
$due    = (int) $b->total_kobo - (int) $b->paid_kobo;
$dir    = 'https://www.google.com/maps/dir/?api=1&destination=' . rawurlencode( $hotel['lat'] . ',' . $hotel['lng'] );
$heads  = array(
	'pending_payment'  => __( 'Almost done: complete your payment', 'explore-katsina' ),
	'new'              => 'hotel' === $kind ? __( 'Booking received: waiting for the hotel to confirm', 'explore-katsina' ) : ( 'order' === $kind ? __( 'Order received: waiting for the restaurant to accept', 'explore-katsina' ) : __( 'Reservation received: waiting for the restaurant to confirm', 'explore-katsina' ) ),
	'confirmed'        => 'hotel' === $kind ? __( 'Your booking is confirmed', 'explore-katsina' ) : __( 'Your table is confirmed', 'explore-katsina' ),
	'seated'           => __( 'Enjoy your meal', 'explore-katsina' ),
	'completed'        => __( 'Thank you for visiting', 'explore-katsina' ),
	'accepted'         => __( 'Your order was accepted', 'explore-katsina' ),
	'preparing'        => __( 'Your order is being prepared', 'explore-katsina' ),
	'ready'            => __( 'Your order is ready for pickup', 'explore-katsina' ),
	'out_for_delivery' => __( 'Your order is on its way', 'explore-katsina' ),
	'checked_in'       => __( 'Enjoy your stay', 'explore-katsina' ),
	'checked_out'      => __( 'Thank you for staying', 'explore-katsina' ),
	'declined'         => 'hotel' === $kind ? __( 'The hotel could not accept this booking', 'explore-katsina' ) : __( 'The restaurant could not accept this', 'explore-katsina' ),
	'cancelled'        => __( 'This booking was cancelled', 'explore-katsina' ),
	'expired'          => __( 'This booking expired because payment was not completed', 'explore-katsina' ),
	'no_show'          => __( 'Marked as no-show', 'explore-katsina' ),
	'payment_conflict' => __( 'We received your payment but need to contact you', 'explore-katsina' ),
	'requested'        => __( 'Request sent: the venue will reply within 48 hours', 'explore-katsina' ),
	'deposit_paid'     => __( 'Deposit paid: your date is secured', 'explore-katsina' ),
);
$good = in_array( $b->status, array( 'new', 'confirmed', 'checked_in', 'checked_out', 'seated', 'completed', 'accepted', 'preparing', 'ready', 'out_for_delivery', 'requested', 'deposit_paid' ), true );
if ( 'event' === $kind && 'confirmed' === $b->status && ! (int) $b->paid_kobo ) {
	$heads['confirmed'] = __( 'Accepted! Pay the deposit to secure your date', 'explore-katsina' );
}
?>
<div class="ek ek-book" style="max-width:760px;margin:0 auto">
	<div class="ek-confirm-head <?php echo $good ? 'is-good' : 'is-other'; ?>">
		<p class="ek-eyebrow" style="margin:0"><?php esc_html_e( 'Booking code', 'explore-katsina' ); ?></p>
		<p class="ek-code"><?php echo esc_html( $b->code ); ?></p>
		<h1 style="margin:0"><?php echo esc_html( $heads[ $b->status ] ?? $b->status ); ?></h1>
	</div>

	<?php if ( 'event' === $kind && 'confirmed' === $b->status && ! (int) $b->paid_kobo ) : ?>
		<?php $heads['confirmed'] = __( 'Accepted! Pay the deposit to secure your date', 'explore-katsina' ); $pay = Payments::start( $b ); ?>
		<?php if ( ! is_wp_error( $pay ) ) : ?><p><a class="ek-btn" href="<?php echo esc_url( $pay ); ?>"><?php /* translators: %s: amount */ printf( esc_html__( 'Pay %s deposit', 'explore-katsina' ), esc_html( Money::format( $b->deposit_kobo ) ) ); ?></a> <span class="ek-small ek-muted"><?php /* translators: %s: date */ printf( esc_html__( 'Pay by %s or the date will be released.', 'explore-katsina' ), esc_html( \EK\View::date( $b->hold_expires, true ) ) ); ?></span></p><?php endif; ?>
	<?php endif; ?>
	<?php if ( 'pending_payment' === $b->status ) : ?>
		<?php $pay = Payments::start( $b ); ?>
		<?php if ( ! is_wp_error( $pay ) ) : ?><p><a class="ek-btn" href="<?php echo esc_url( $pay ); ?>"><?php /* translators: %s: amount */ printf( esc_html__( 'Pay %s now', 'explore-katsina' ), esc_html( Money::format( $d['pay_now'] ?? 0 ) ) ); ?></a> <span class="ek-small ek-muted"><?php esc_html_e( 'Held for you for 15 minutes.', 'explore-katsina' ); ?></span></p><?php endif; ?>
	<?php elseif ( 'expired' === $b->status || ( 'cancelled' === $b->status && ! (int) $b->paid_kobo ) ) : ?>
		<p><a class="ek-btn" href="<?php echo esc_url( $hotel['url'] . ( 'hotel' === $kind ? '#rooms' : ( 'event' === $kind ? '#halls' : '#reserve' ) ) ); ?>"><?php esc_html_e( 'Try again', 'explore-katsina' ); ?></a></p>
	<?php endif; ?>

	<section class="ek-card ek-stack">
		<div class="ek-row ek-row--between"><h2 style="margin:0"><?php echo esc_html( $d['hotel'] ?? ( $d['business'] ?? '' ) ); ?></h2><span class="ek-pill"><?php echo esc_html( Dashboard::booking_status_label( $b->status ) ); ?></span></div>
		<?php if ( 'hotel' === $kind ) : ?>
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
		<?php elseif ( 'event' === $kind ) : ?>
		<dl class="ek-dl">
			<dt><?php esc_html_e( 'Hall', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['hall'] ?? '' ); ?></dd>
			<dt><?php esc_html_e( 'Date', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( wp_date( 'l j F Y', strtotime( $b->start_date ) ) . ( $b->end_date !== $b->start_date ? ' – ' . wp_date( 'l j F Y', strtotime( $b->end_date ) ) : '' ) ); ?></strong></dd>
			<dt><?php esc_html_e( 'Event', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ( \EK\Venue::event_types()[ $d['event_type'] ?? 'other' ] ?? '' ) . ' · ' . (int) $b->guests . ' ' . ( 'standing' === ( $d['layout'] ?? '' ) ? __( 'standing', 'explore-katsina' ) : __( 'seated', 'explore-katsina' ) ) ); ?></dd>
			<dt><?php esc_html_e( 'Hall price', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $b->total_kobo ) ); ?></dd>
			<dt><?php esc_html_e( 'Deposit', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $b->deposit_kobo ) ); ?> <?php echo (int) $b->paid_kobo ? '<span class="ek-pill ek-pill--ok">' . esc_html__( 'paid', 'explore-katsina' ) . '</span>' : ''; ?></dd>
			<dt><?php esc_html_e( 'Balance', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( (int) $b->total_kobo - (int) $b->deposit_kobo ) ); ?> <?php esc_html_e( '(pay the venue directly)', 'explore-katsina' ); ?></dd>
			<dt><?php esc_html_e( 'Cancellation', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ( $b->policy['label'] ?? '' ) . ': ' . str_replace( __( 'check-in', 'explore-katsina' ), __( 'the event', 'explore-katsina' ), $b->policy['text'] ?? '' ) ); ?></dd>
		</dl>
		<?php elseif ( 'restaurant' === $kind ) : ?>
		<dl class="ek-dl">
			<dt><?php esc_html_e( 'Date', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'l j F Y', strtotime( $b->start_date ) ) ); ?></dd>
			<dt><?php esc_html_e( 'Time', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( substr( (string) $b->start_time, 0, 5 ) ); ?></strong></dd>
			<dt><?php esc_html_e( 'People', 'explore-katsina' ); ?></dt><dd><?php echo (int) $b->guests; ?> · <?php echo esc_html( $b->customer_name ); ?></dd>
			<?php if ( (int) $b->deposit_kobo ) : ?><dt><?php esc_html_e( 'Deposit', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $b->deposit_kobo ) ); ?> <?php echo (int) $b->paid_kobo ? esc_html__( '(paid, deducted from your bill)', 'explore-katsina' ) : ''; ?></dd><?php endif; ?>
		</dl>
		<?php else : ?>
		<ul style="margin:0;padding-left:1.1em"><?php foreach ( (array) ( $d['items'] ?? array() ) as $i ) : ?><li><?php echo (int) $i['qty']; ?> × <?php echo esc_html( $i['name'] ); ?> · <?php echo esc_html( Money::format( $i['price'] * $i['qty'] ) ); ?></li><?php endforeach; ?></ul>
		<dl class="ek-dl">
			<dt><?php esc_html_e( 'Type', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['title'] ?? '' ); ?></dd>
			<dt><?php esc_html_e( 'Total', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( Money::format( $b->total_kobo ) ); ?></strong> <?php echo 'cash' === $b->payment_mode ? esc_html__( '(pay on pickup/delivery)', 'explore-katsina' ) : ''; ?></dd>
		</dl>
		<?php endif; ?>
		<div class="ek-row">
			<a class="ek-btn ek-btn--night" href="<?php echo esc_url( $dir ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a>
			<?php if ( $hotel['whatsapp'] ) : ?><a class="ek-btn ek-btn--wa" href="<?php echo esc_url( 'https://wa.me/' . ltrim( $hotel['whatsapp'], '+' ) . '?text=' . rawurlencode( sprintf( /* translators: %s: code */ __( 'Hello, about my booking %s', 'explore-katsina' ), $b->code ) ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'WhatsApp', 'explore-katsina' ); ?></a><?php endif; ?>
			<a class="ek-btn ek-btn--ghost" href="<?php echo esc_url( 'tel:' . $hotel['phone'] ); ?>"><?php esc_html_e( 'Call', 'explore-katsina' ); ?></a>
		</div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Keep this link: it always shows the latest status of your booking.', 'explore-katsina' ); ?></p>
	</section>
	<?php include EK_DIR . 'templates/booking/guest-actions.php'; ?>
</div>
