<?php
/**
 * Admin: commission invoices for bookings paid directly to the business.
 */
use EK\Availability;
use EK\Invoices;
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;
$tz      = Availability::tz();
$last    = ( new DateTimeImmutable( 'now', $tz ) )->modify( 'first day of last month' )->format( 'Y-m' );
$owed    = Invoices::owed( ( new DateTimeImmutable( 'now', $tz ) )->format( 'Y-m-d' ) );
$pending = array_sum( array_map( static fn( $r ) => (int) $r->owed, $owed ) );
$row_form = static function ( $action, $inv, $label, $placeholder, $class ) {
	echo '<form method="post" style="margin:0 0 6px">';
	wp_nonce_field( 'ek_admin_' . $action . '_' . $inv->id );
	echo '<input type="hidden" name="ek_admin_action" value="' . esc_attr( $action ) . '"><input type="hidden" name="invoice_id" value="' . (int) $inv->id . '">';
	echo '<input type="text" name="reference" placeholder="' . esc_attr( $placeholder ) . '" required> <button class="' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
};
?>
<h1><?php esc_html_e( 'Commission invoices', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'When guests pay a business directly (for example "Pay at hotel"), our commission is collected with a monthly invoice. Invoices are created automatically on the 1st of each month for everything completed up to the end of the previous month. Businesses pay online or from their earnings; if they pay you by transfer, mark it paid here. An invoice unpaid for 30 days pauses the listing automatically until it is paid.', 'explore-katsina' ); ?></p>
<p><strong><?php esc_html_e( 'Not yet invoiced', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( Money::format( $pending ) ); ?> (<?php /* translators: %d: count */ printf( esc_html( _n( '%d booking', '%d bookings', count( $owed ), 'explore-katsina' ) ), count( $owed ) ); ?>)</p>
<form method="post" style="margin-bottom:16px">
	<?php wp_nonce_field( 'ek_admin_invoices_generate' ); ?><input type="hidden" name="ek_admin_action" value="invoices_generate">
	<label><?php esc_html_e( 'Create invoices now for', 'explore-katsina' ); ?> <input type="month" name="month" value="<?php echo esc_attr( $last ); ?>"></label>
	<button class="button"><?php esc_html_e( 'Create', 'explore-katsina' ); ?></button>
	<span class="description"><?php esc_html_e( 'Normally automatic. Safe to repeat: a booking is never invoiced twice.', 'explore-katsina' ); ?></span>
</form>
<h2><?php esc_html_e( 'Unpaid', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Invoice', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Due', 'explore-katsina' ); ?></th><th style="width:34%"><?php esc_html_e( 'Action', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Invoices::unpaid(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'No unpaid invoices.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $inv ) : $over = strtotime( $inv->due_at . ' UTC' ) < time(); ?>
		<tr>
			<td><strong><?php echo esc_html( $inv->number ); ?></strong><br><span class="description"><?php echo esc_html( count( Invoices::lines( $inv->id ) ) ); ?> <?php esc_html_e( 'bookings', 'explore-katsina' ); ?></span></td>
			<td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $inv->business_id ) ); ?>"><?php echo esc_html( get_the_title( $inv->business_id ) ); ?></a></td>
			<td><strong><?php echo esc_html( Money::format( $inv->amount_kobo ) ); ?></strong></td>
			<td><?php echo esc_html( View::date( $inv->due_at ) ); ?><?php echo $over ? '<br><strong style="color:#b32d2e">' . esc_html__( 'Overdue: listing paused', 'explore-katsina' ) . '</strong>' : ''; ?></td>
			<td>
				<?php
				$row_form( 'invoice_paid', $inv, __( 'Mark paid', 'explore-katsina' ), __( 'Transfer reference', 'explore-katsina' ), 'button button-primary' );
				$row_form( 'invoice_void', $inv, __( 'Write off', 'explore-katsina' ), __( 'Reason', 'explore-katsina' ), 'button-link button-link-delete' );
				?>
			</td>
		</tr>
	<?php endforeach; ?>
	</tbody>
</table>
<h2><?php esc_html_e( 'Paid and written off', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Invoice', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'How', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'When', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Invoices::recent(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'None yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $inv ) : ?>
		<tr><td><?php echo esc_html( $inv->number ); ?></td><td><?php echo esc_html( get_the_title( $inv->business_id ) ); ?></td><td><?php echo esc_html( Money::format( $inv->amount_kobo ) ); ?></td><td><?php echo 'void' === $inv->status ? esc_html__( 'Written off', 'explore-katsina' ) . ': ' . esc_html( $inv->reference ) : esc_html( $inv->method . ' · ' . $inv->reference ); ?></td><td><?php echo esc_html( View::date( $inv->paid_at ? $inv->paid_at : $inv->created_at ) ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>
