<?php
/**
 * Commission invoices (pay-at-hotel bookings). Paying via Paystack arrives in Phase 7.
 *
 * @var array $b
 */
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;

$rows = Money::invoices( $b['id'] );
?>
<section class="ek-card" aria-labelledby="inv-h">
	<h2 id="inv-h"><?php esc_html_e( 'Invoices', 'explore-katsina' ); ?></h2>
	<p class="ek-muted ek-small"><?php esc_html_e( 'When guests book online but pay you directly at your venue, the commission is added up each month into an invoice here. Invoices unpaid for 30 days pause your listing.', 'explore-katsina' ); ?></p>
	<?php if ( ! $rows ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No invoices', 'explore-katsina' ); ?></strong><?php esc_html_e( 'You have nothing to pay.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<div class="ek-table-wrap"><table class="ek-table ek-table--stack">
			<thead><tr><th><?php esc_html_e( 'Invoice', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Period', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Due', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $rows as $i ) : ?>
				<tr>
					<td data-label="<?php esc_attr_e( 'Invoice', 'explore-katsina' ); ?>"><strong><?php echo esc_html( $i->number ); ?></strong></td>
					<td data-label="<?php esc_attr_e( 'Period', 'explore-katsina' ); ?>"><?php echo esc_html( wp_date( 'M Y', strtotime( $i->period_start ) ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Due', 'explore-katsina' ); ?>"><?php echo esc_html( View::date( $i->due_at ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Amount', 'explore-katsina' ); ?>" class="ek-num"><?php echo esc_html( Money::format( $i->amount_kobo ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Status', 'explore-katsina' ); ?>"><span class="ek-pill ek-pill--<?php echo 'paid' === $i->status ? 'ok' : 'bad'; ?>"><?php echo esc_html( 'paid' === $i->status ? __( 'Paid', 'explore-katsina' ) : __( 'Unpaid', 'explore-katsina' ) ); ?></span></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	<?php endif; ?>
</section>
