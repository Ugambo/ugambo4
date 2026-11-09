<?php
/**
 * Commission invoices (bookings where the guest paid the business directly).
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Invoices;
use EK\Money;
use EK\Payments;
use EK\View;

defined( 'ABSPATH' ) || exit;

$rows    = \EK\Money::invoices( $b['id'] );
$summary = Money::summary( $b['id'] );
$online  = Payments::online_available();
$test    = 'test' === Payments::provider();
$owed    = Invoices::owed( wp_date( 'Y-m-d' ), $b['id'] );
$next    = array_sum( array_map( static fn( $r ) => (int) $r->owed, $owed ) );
?>
<?php if ( ! empty( $_GET['paid'] ) ) : // phpcs:ignore ?><div class="ek-notice ek-notice--ok" role="status"><?php esc_html_e( 'Payment received. Thank you!', 'explore-katsina' ); ?></div><?php endif; ?>
<section class="ek-card ek-stack" aria-labelledby="inv-h">
	<h2 id="inv-h" style="margin:0"><?php esc_html_e( 'Invoices', 'explore-katsina' ); ?></h2>
	<p class="ek-muted ek-small" style="margin:0"><?php esc_html_e( 'When guests book through Explore Katsina but pay you directly at your venue, our commission is added up on the 1st of each month into an invoice here. Pay online or from your earnings balance. An invoice unpaid for 30 days pauses your listing until it is paid.', 'explore-katsina' ); ?></p>
	<?php if ( $next ) : ?><p class="ek-small" style="margin:0"><?php /* translators: 1: amount, 2: count */ printf( esc_html__( 'Building up for your next invoice: %1$s from %2$d completed booking(s).', 'explore-katsina' ), esc_html( Money::format( $next ) ), count( $owed ) ); ?></p><?php endif; ?>
	<?php if ( ! $rows ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No invoices', 'explore-katsina' ); ?></strong><?php esc_html_e( 'You have nothing to pay.', 'explore-katsina' ); ?></div>
	<?php endif; ?>
	<?php foreach ( $rows as $i ) : $unpaid = 'unpaid' === $i->status; $over = $unpaid && strtotime( $i->due_at . ' UTC' ) < time(); ?>
		<article class="ek-card ek-invoice<?php echo $unpaid ? ' is-unpaid' : ''; ?>" style="margin:0">
			<div class="ek-row ek-row--between">
				<div><strong><?php echo esc_html( $i->number ); ?></strong><br><span class="ek-small ek-muted"><?php /* translators: %s: month */ printf( esc_html__( 'Bookings completed up to the end of %s', 'explore-katsina' ), esc_html( wp_date( 'F Y', strtotime( $i->period_start . ' 12:00 UTC' ) ) ) ); ?></span></div>
				<div class="ek-row" style="align-items:center;gap:8px"><span class="ek-display ek-num" style="font-size:1.3rem"><?php echo esc_html( Money::format( $i->amount_kobo ) ); ?></span>
					<span class="ek-pill ek-pill--<?php echo $unpaid ? 'bad' : 'ok'; ?>"><?php echo esc_html( $unpaid ? ( $over ? __( 'Overdue', 'explore-katsina' ) : __( 'Unpaid', 'explore-katsina' ) ) : ( 'void' === $i->status ? __( 'Written off', 'explore-katsina' ) : __( 'Paid', 'explore-katsina' ) ) ); ?></span></div>
			</div>
			<p class="ek-small" style="margin:8px 0 0"><?php echo $unpaid ? esc_html( sprintf( /* translators: %s: date */ __( 'Due by %s', 'explore-katsina' ), View::date( $i->due_at ) ) ) : esc_html( sprintf( /* translators: 1: date, 2: reference */ __( 'Paid %1$s · ref %2$s', 'explore-katsina' ), View::date( $i->paid_at ), $i->reference ) ); ?></p>
			<details style="margin-top:8px"><summary class="ek-link-btn"><?php esc_html_e( 'Show bookings', 'explore-katsina' ); ?></summary>
				<div class="ek-table-wrap"><table class="ek-table ek-table--stack" style="margin-top:8px">
					<thead><tr><th><?php esc_html_e( 'Booking', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Guest', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Dates', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Booking value', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Commission', 'explore-katsina' ); ?></th></tr></thead>
					<tbody><?php foreach ( Invoices::lines( $i->id ) as $l ) : ?>
						<tr><td data-label="<?php esc_attr_e( 'Booking', 'explore-katsina' ); ?>"><?php echo esc_html( $l->code ); ?></td><td data-label="<?php esc_attr_e( 'Guest', 'explore-katsina' ); ?>"><?php echo esc_html( $l->customer_name ); ?></td><td data-label="<?php esc_attr_e( 'Dates', 'explore-katsina' ); ?>"><?php echo esc_html( $l->start_date . ( $l->end_date && $l->end_date !== $l->start_date ? ' → ' . $l->end_date : '' ) ); ?></td><td class="ek-num" data-label="<?php esc_attr_e( 'Booking value', 'explore-katsina' ); ?>"><?php echo esc_html( Money::format( $l->total_kobo ) ); ?></td><td class="ek-num" data-label="<?php esc_attr_e( 'Commission', 'explore-katsina' ); ?>"><?php echo esc_html( Money::format( $l->amount_kobo ) . ' (' . \EK\Commission::percent( $l->commission_rate_bp ) . ')' ); ?></td></tr>
					<?php endforeach; ?></tbody>
				</table></div>
			</details>
			<?php if ( $unpaid ) : ?>
				<div class="ek-row" style="margin-top:10px">
					<?php if ( $online ) : ?>
						<form method="post"><?php echo Dashboard::nonce_fields( 'dash_invoice_pay', $b['id'] ); // phpcs:ignore ?><input type="hidden" name="invoice_id" value="<?php echo (int) $i->id; ?>"><button class="ek-btn" type="submit"><?php echo $test ? esc_html__( 'Pay online (test, succeeds)', 'explore-katsina' ) : esc_html__( 'Pay online (Paystack)', 'explore-katsina' ); ?></button></form>
					<?php endif; ?>
					<?php if ( $summary['requestable'] >= (int) $i->amount_kobo ) : ?>
						<form method="post"><?php echo Dashboard::nonce_fields( 'dash_invoice_balance', $b['id'] ); // phpcs:ignore ?><input type="hidden" name="invoice_id" value="<?php echo (int) $i->id; ?>"><button class="ek-btn ek-btn--ghost" type="submit"><?php /* translators: %s: amount */ printf( esc_html__( 'Pay from my earnings (%s available)', 'explore-katsina' ), esc_html( Money::format( $summary['requestable'] ) ) ); ?></button></form>
					<?php endif; ?>
				</div>
				<?php if ( ! $online ) : ?><p class="ek-small ek-muted" style="margin:6px 0 0"><?php esc_html_e( 'Online payment is not available right now. You can pay by bank transfer: contact us for the details.', 'explore-katsina' ); ?></p><?php endif; ?>
			<?php endif; ?>
		</article>
	<?php endforeach; ?>
</section>
