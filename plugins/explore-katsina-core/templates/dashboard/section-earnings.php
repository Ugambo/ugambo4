<?php
/**
 * Earnings.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;

$s     = Money::summary( $b['id'] );
$lines = Dashboard::ledger( $b['id'] );
$types = array(
	'earning'    => __( 'Booking payment', 'explore-katsina' ),
	'commission' => __( 'Commission', 'explore-katsina' ),
	'refund'     => __( 'Refund', 'explore-katsina' ),
	'payout'     => __( 'Payout', 'explore-katsina' ),
	'adjustment' => __( 'Adjustment', 'explore-katsina' ),
);
$status = array(
	'on_hold'   => __( 'On hold', 'explore-katsina' ),
	'available' => __( 'Available', 'explore-katsina' ),
	'paid_out'  => __( 'Paid out', 'explore-katsina' ),
	'cancelled' => __( 'Cancelled', 'explore-katsina' ),
);
?>
<div class="ek-stats">
	<div class="ek-stat"><small><?php esc_html_e( 'Total earned', 'explore-katsina' ); ?></small><b><?php echo esc_html( Money::format( $s['gross'] ) ); ?></b></div>
	<div class="ek-stat"><small><?php esc_html_e( 'Commission deducted', 'explore-katsina' ); ?></small><b><?php echo esc_html( Money::format( $s['commission'] ) ); ?></b></div>
	<div class="ek-stat"><small><?php esc_html_e( 'Earnings on hold', 'explore-katsina' ); ?></small><b><?php echo esc_html( Money::format( $s['on_hold'] ) ); ?></b></div>
	<div class="ek-stat ek-stat--accent"><small><?php esc_html_e( 'Available to pay out', 'explore-katsina' ); ?></small><b><?php echo esc_html( Money::format( $s['requestable'] ) ); ?></b></div>
</div>
<div class="ek-notice ek-notice--info ek-small">
	<?php esc_html_e( 'How holds work: hotel earnings are released 3 days after check-out, and event centre earnings 3 days after the event, if there is no complaint. Then you can request a payout.', 'explore-katsina' ); ?>
</div>
<section class="ek-card" aria-labelledby="ern-h">
	<h2 id="ern-h"><?php esc_html_e( 'Money movements', 'explore-katsina' ); ?></h2>
	<?php if ( ! $lines ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No earnings yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Online payments for your bookings will show here.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<div class="ek-table-wrap"><table class="ek-table ek-table--stack">
			<thead><tr><th><?php esc_html_e( 'Date', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Type', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Release date', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $lines as $l ) : ?>
				<tr>
					<td data-label="<?php esc_attr_e( 'Date', 'explore-katsina' ); ?>"><?php echo esc_html( View::date( $l->created_at ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Type', 'explore-katsina' ); ?>"><?php echo esc_html( $types[ $l->entry_type ] ?? $l->entry_type ); ?><?php echo $l->note ? '<br><span class="ek-small ek-muted">' . esc_html( $l->note ) . '</span>' : ''; ?></td>
					<td data-label="<?php esc_attr_e( 'Status', 'explore-katsina' ); ?>"><span class="ek-pill"><?php echo esc_html( $status[ $l->status ] ?? $l->status ); ?></span></td>
					<td data-label="<?php esc_attr_e( 'Release date', 'explore-katsina' ); ?>"><?php echo esc_html( View::date( $l->release_at ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Amount', 'explore-katsina' ); ?>" class="ek-num"><?php echo esc_html( Money::format( $l->amount_kobo ) ); ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	<?php endif; ?>
</section>
