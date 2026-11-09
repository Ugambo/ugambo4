<?php
/**
 * Tour booking details + cancel on the receipt page.
 *
 * @var object $s
 */
use EK\Money;
use EK\Sales;

defined( 'ABSPATH' ) || exit;
$can = apply_filters( 'ek_sale_guest_can_cancel', new WP_Error( 'no', '' ), $s );
?>
<section class="ek-card ek-stack" aria-labelledby="tr-h">
	<h2 id="tr-h" style="margin:0"><?php esc_html_e( 'Your tour', 'explore-katsina' ); ?></h2>
	<dl class="ek-dl">
		<dt><?php esc_html_e( 'Date', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'l j F Y', strtotime( $s->details['date'] . ' 12:00' ) ) . ( $s->details['time'] ? ', ' . $s->details['time'] : '' ) ); ?></dd>
		<dt><?php esc_html_e( 'People', 'explore-katsina' ); ?></dt><dd><?php echo (int) $s->quantity; ?> × <?php echo esc_html( Money::format( $s->details['each'] ?? 0 ) ); ?></dd>
		<?php if ( ! empty( $s->details['pickup'] ) ) : ?><dt><?php esc_html_e( 'Pickup point', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $s->details['pickup'] ); ?></dd><?php endif; ?>
	</dl>
	<?php if ( true === $can ) : ?>
		<details><summary class="ek-link-btn"><?php esc_html_e( 'Cancel this booking (full refund)', 'explore-katsina' ); ?></summary>
			<form method="post" style="margin-top:10px"><input type="hidden" name="ek_action" value="sale_cancel"><input type="hidden" name="code" value="<?php echo esc_attr( $s->code ); ?>"><input type="hidden" name="key" value="<?php echo esc_attr( $s->access_key ); ?>"><?php wp_nonce_field( 'ek_sale_cancel_' . $s->code, '_ek_nonce' ); ?><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Yes, cancel it', 'explore-katsina' ); ?></button></form>
		</details>
	<?php elseif ( 'paid' === $s->status && is_wp_error( $can ) && $can->get_error_message() ) : ?>
		<p class="ek-small ek-muted" style="margin:0"><?php echo esc_html( $can->get_error_message() ); ?></p>
	<?php endif; ?>
</section>
