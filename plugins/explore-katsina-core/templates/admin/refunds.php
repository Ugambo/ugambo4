<?php
/**
 * Admin: refunds waiting to be paid, and recent refunds.
 */
use EK\Booking;
use EK\Business;
use EK\Money;
use EK\Refunds;
use EK\View;

defined( 'ABSPATH' ) || exit;
$msg = sanitize_key( $_GET['ek_msg'] ?? '' ); // phpcs:ignore
?>
<h1><?php esc_html_e( 'Refunds', 'explore-katsina' ); ?></h1>
<p><?php esc_html_e( 'Refunds are sent back automatically through Paystack/Flutterwave when possible. The ones below could not be sent automatically: pay them by bank transfer to the guest, then mark them as refunded with your transfer reference.', 'explore-katsina' ); ?></p>
<?php if ( 'done' === $msg ) : ?><div class="notice notice-success"><p><?php esc_html_e( 'Done.', 'explore-katsina' ); ?></p></div><?php endif; ?>
<?php if ( 'ref' === $msg ) : ?><div class="notice notice-error"><p><?php esc_html_e( 'Enter the transfer reference.', 'explore-katsina' ); ?></p></div><?php endif; ?>
<h2><?php esc_html_e( 'Waiting to be paid', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Booking', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Guest', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Reason', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Action', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Refunds::pending(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'Nothing waiting.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $r ) : $b = Booking::get( $r->booking_id ); ?>
		<tr>
			<td><strong><?php echo esc_html( $b ? $b->code : '#' . $r->booking_id ); ?></strong><br><?php echo esc_html( get_the_title( $r->business_id ) ); ?><br><span class="description"><?php echo esc_html( View::date( $r->created_at, true ) ); ?></span></td>
			<td><?php echo $b ? esc_html( $b->customer_name ) . '<br>' . esc_html( $b->customer_email ) . '<br>' . esc_html( Business::display_phone( $b->customer_phone ) ) : ''; ?></td>
			<td><strong><?php echo esc_html( Money::format( $r->amount_kobo ) ); ?></strong></td>
			<td><?php echo esc_html( $r->reason ); ?></td>
			<td>
				<form method="post" style="margin-bottom:6px"><?php wp_nonce_field( 'ek_admin_refund_done_' . $r->id ); ?><input type="hidden" name="ek_admin_action" value="refund_done"><input type="hidden" name="refund_id" value="<?php echo (int) $r->id; ?>"><input type="text" name="reference" placeholder="<?php esc_attr_e( 'Transfer reference', 'explore-katsina' ); ?>" required> <button class="button button-primary"><?php esc_html_e( 'Mark refunded', 'explore-katsina' ); ?></button></form>
				<form method="post"><?php wp_nonce_field( 'ek_admin_refund_retry_' . $r->id ); ?><input type="hidden" name="ek_admin_action" value="refund_retry"><input type="hidden" name="refund_id" value="<?php echo (int) $r->id; ?>"><button class="button"><?php esc_html_e( 'Try the gateway again', 'explore-katsina' ); ?></button></form>
			</td>
		</tr>
	<?php endforeach; ?>
	</tbody>
</table>
<h2><?php esc_html_e( 'Recent refunds', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Booking', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'How', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Reference', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'When', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Refunds::recent(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'None yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $r ) : $b = Booking::get( $r->booking_id ); ?>
		<tr><td><?php echo esc_html( $b ? $b->code : sprintf( /* translators: %d: id */ __( 'Booking #%d (deleted)', 'explore-katsina' ), $r->booking_id ) ); ?></td><td><?php echo esc_html( Money::format( $r->amount_kobo ) ); ?></td><td><?php echo esc_html( $r->method ); ?></td><td><?php echo esc_html( $r->reference ); ?></td><td><?php echo esc_html( View::date( $r->processed_at, true ) ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>
