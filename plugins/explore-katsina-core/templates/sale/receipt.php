<?php
/**
 * Receipt / status page for a direct sale (?sale=CODE&key=…). Kinds add their own part
 * (tickets with QR codes, tour details…) through templates/sale/{kind}.php.
 *
 * @var object $s
 */
use EK\Money;
use EK\Sales;
use EK\View;

defined( 'ABSPATH' ) || exit;
$titles = array(
	'pending_payment'  => __( 'Waiting for payment', 'explore-katsina' ),
	'paid'             => __( 'Thank you, you are all set', 'explore-katsina' ),
	'expired'          => __( 'This order expired before payment', 'explore-katsina' ),
	'cancelled'        => __( 'This order was cancelled', 'explore-katsina' ),
	'refunded'         => __( 'Cancelled and refunded', 'explore-katsina' ),
	'payment_conflict' => __( 'Payment received, but we need to contact you', 'explore-katsina' ),
);
$part = EK_DIR . 'templates/sale/' . sanitize_key( $s->kind ) . '.php';
?>
<div class="ek ek-book ek-stack" style="max-width:760px;margin:0 auto">
	<header class="ek-confirm-head">
		<p class="ek-eyebrow" style="margin:0"><?php esc_html_e( 'Order code', 'explore-katsina' ); ?></p>
		<p class="ek-code"><?php echo esc_html( $s->code ); ?></p>
		<h1><?php echo esc_html( $titles[ $s->status ] ?? $s->status ); ?></h1>
	</header>
	<?php if ( isset( $_GET['cancelled'] ) ) : // phpcs:ignore ?>
		<div class="ek-notice <?php echo empty( $_GET['cancelled'] ) ? 'ek-notice--error' : 'ek-notice--ok'; // phpcs:ignore ?>" role="status"><?php echo empty( $_GET['cancelled'] ) ? esc_html__( 'This order cannot be cancelled online. Please contact us.', 'explore-katsina' ) : esc_html__( 'Cancelled. We have emailed you the details.', 'explore-katsina' ); // phpcs:ignore ?></div>
	<?php endif; ?>
	<section class="ek-card ek-stack">
		<h2 style="margin:0"><?php echo esc_html( ( Sales::kinds()[ $s->kind ] ?? '' ) . ( ! empty( $s->details['title'] ) ? ': ' . $s->details['title'] : '' ) ); ?></h2>
		<dl class="ek-dl">
			<dt><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $s->amount_kobo ) ); ?></dd>
			<?php if ( $s->paid_at ) : ?><dt><?php esc_html_e( 'Paid', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( View::date( $s->paid_at, true ) ); ?></dd><?php endif; ?>
			<?php if ( ! empty( $s->details['refund'] ) ) : ?><dt><?php esc_html_e( 'Refund', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $s->details['refund']['amount'] ) . ' · ' . ( 'refunded' === $s->details['refund']['status'] ? __( 'sent back to you', 'explore-katsina' ) : __( 'being processed', 'explore-katsina' ) ) ); ?></dd><?php endif; ?>
			<dt><?php esc_html_e( 'Name', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $s->customer_name ); ?></dd>
		</dl>
		<?php if ( 'pending_payment' === $s->status ) : $url = Sales::pay_url( $s ); ?>
			<?php if ( ! is_wp_error( $url ) ) : ?><div><a class="ek-btn" href="<?php echo esc_url( $url ); ?>"><?php esc_html_e( 'Pay now', 'explore-katsina' ); ?></a></div><?php endif; ?>
		<?php endif; ?>
	</section>
	<?php if ( file_exists( $part ) ) { include $part; } ?>
</div>
