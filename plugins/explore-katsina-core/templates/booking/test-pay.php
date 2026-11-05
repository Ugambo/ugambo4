<?php
/**
 * LOCAL TEST payment screen. Never shown on a live site.
 *
 * @var object $b
 */
use EK\Money;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-book" style="max-width:520px;margin:0 auto">
	<div class="ek-card ek-stack" style="border:3px dashed var(--ek-brass)">
		<p class="ek-eyebrow" style="margin:0"><?php esc_html_e( 'Test payment: no real money', 'explore-katsina' ); ?></p>
		<h1 style="margin:0"><?php echo esc_html( Money::format( (int) ( $b->details['pay_now'] ?? 0 ) ) ); ?></h1>
		<p style="margin:0"><?php echo esc_html( $b->code . ' · ' . ( $b->details['hotel'] ?? '' ) ); ?></p>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'On the live site this is the Paystack or Flutterwave payment page. Here you can pretend the payment worked or failed.', 'explore-katsina' ); ?></p>
		<?php if ( 'pending_payment' !== $b->status ) : ?>
			<p class="ek-notice ek-notice--warn" style="margin:0"><?php esc_html_e( 'This booking is no longer waiting for payment.', 'explore-katsina' ); ?></p>
		<?php endif; ?>
		<form method="post" class="ek-row">
			<input type="hidden" name="ek_action" value="test_pay">
			<input type="hidden" name="code" value="<?php echo esc_attr( $b->code ); ?>">
			<input type="hidden" name="key" value="<?php echo esc_attr( $b->access_key ); ?>">
			<?php wp_nonce_field( 'ek_test_pay', '_ek_nonce' ); ?>
			<button class="ek-btn" type="submit" name="result" value="success"><?php esc_html_e( 'Pay (test, succeeds)', 'explore-katsina' ); ?></button>
			<button class="ek-btn ek-btn--ghost" type="submit" name="result" value="fail"><?php esc_html_e( 'Simulate failed payment', 'explore-katsina' ); ?></button>
		</form>
	</div>
</div>
