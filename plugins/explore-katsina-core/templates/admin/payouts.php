<?php
/**
 * Admin: payout requests → approve → transfer → mark paid with the reference (or reject).
 */
use EK\Admin;
use EK\Crypto;
use EK\Money;
use EK\Payouts;
use EK\View;

defined( 'ABSPATH' ) || exit;
$reveal = absint( $_GET['reveal'] ?? 0 ); // phpcs:ignore
if ( $reveal && ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_wpnonce'] ?? '' ) ), 'ek_reveal_' . $reveal ) ) { // phpcs:ignore
	$reveal = 0;
}
$form = static function ( $action, $p, $label, $class, $field = '' ) {
	echo '<form method="post" style="margin:0 0 6px">';
	wp_nonce_field( 'ek_admin_' . $action . '_' . $p->id );
	echo '<input type="hidden" name="ek_admin_action" value="' . esc_attr( $action ) . '"><input type="hidden" name="payout_id" value="' . (int) $p->id . '">';
	echo $field; // phpcs:ignore
	echo ' <button class="' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
};
?>
<h1><?php esc_html_e( 'Payouts', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'Businesses request payouts from money that has finished its hold. Approve, send the bank transfer from your bank, then mark it paid with the transfer reference. The business is emailed at each step.', 'explore-katsina' ); ?></p>
<h2><?php esc_html_e( 'Waiting', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Pay to', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th style="width:34%"><?php esc_html_e( 'Action', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Payouts::waiting(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'No payout requests waiting.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $p ) : $s = Money::summary( $p->business_id ); ?>
		<tr>
			<td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $p->business_id ) ); ?>"><strong><?php echo esc_html( get_the_title( $p->business_id ) ); ?></strong></a><br><span class="description"><?php /* translators: %s: date */ printf( esc_html__( 'Requested %s', 'explore-katsina' ), esc_html( View::date( $p->requested_at, true ) ) ); ?></span></td>
			<td><strong><?php echo esc_html( Money::format( $p->amount_kobo ) ); ?></strong><br><span class="description"><?php /* translators: %s: amount */ printf( esc_html__( 'Available balance: %s', 'explore-katsina' ), esc_html( Money::format( $s['available'] ) ) ); ?></span><?php if ( $s['available'] < (int) $p->amount_kobo ) : ?><br><strong style="color:#b32d2e"><?php esc_html_e( 'Balance is lower than the request (a refund happened since). Reject or wait.', 'explore-katsina' ); ?></strong><?php endif; ?></td>
			<td>
				<?php if ( $reveal === (int) $p->id ) : $bank = Payouts::bank( $p ); ?>
					<strong><?php echo esc_html( $bank['bank_name'] ); ?></strong><br><?php echo esc_html( $bank['account_name'] ); ?><br><code style="font-size:15px"><?php echo esc_html( $bank['account_number'] ); ?></code>
				<?php else : ?>
					<?php echo esc_html( $p->bank_name ); ?><br><?php echo esc_html( Crypto::mask_account( substr( Payouts::bank( $p, false )['account_number'], -4 ) ) ); ?><br>
					<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin.php?page=ek-payouts&reveal=' . (int) $p->id ), 'ek_reveal_' . (int) $p->id ) ); ?>"><?php esc_html_e( 'Show full account details (logged)', 'explore-katsina' ); ?></a>
				<?php endif; ?>
			</td>
			<td><?php echo esc_html( Money::payout_status_label( $p->status ) ); ?></td>
			<td>
				<?php
				if ( 'requested' === $p->status ) {
					$form( 'payout_approve', $p, __( 'Approve', 'explore-katsina' ), 'button button-primary' );
				}
				$form( 'payout_paid', $p, __( 'Mark paid', 'explore-katsina' ), 'button', '<input type="text" name="reference" placeholder="' . esc_attr__( 'Transfer reference', 'explore-katsina' ) . '" required>' );
				$form( 'payout_reject', $p, __( 'Reject', 'explore-katsina' ), 'button-link button-link-delete', '<input type="text" name="reason" placeholder="' . esc_attr__( 'Reason (sent to the business)', 'explore-katsina' ) . '" required>' );
				?>
			</td>
		</tr>
	<?php endforeach; ?>
	</tbody>
</table>
<h2><?php esc_html_e( 'Recently finished', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Reference / reason', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'When', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Payouts::recent(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'None yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $p ) : ?>
		<tr><td><?php echo esc_html( get_the_title( $p->business_id ) ); ?></td><td><?php echo esc_html( Money::format( $p->amount_kobo ) ); ?></td><td><?php echo esc_html( Money::payout_status_label( $p->status ) ); ?></td><td><?php echo esc_html( 'paid' === $p->status ? $p->reference : $p->note ); ?></td><td><?php echo esc_html( View::date( $p->processed_at, true ) ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>
