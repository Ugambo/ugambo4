<?php
/**
 * Admin: money and booking reports.
 */
use EK\Business;
use EK\Money;
use EK\Reports;

defined( 'ABSPATH' ) || exit;
$p     = Reports::period( sanitize_text_field( wp_unslash( $_GET['from'] ?? '' ) ), sanitize_text_field( wp_unslash( $_GET['to'] ?? '' ) ) ); // phpcs:ignore
$s     = Reports::summary( $p );
$per   = Reports::per_business();
$ns    = Reports::no_shows( $p );
$kinds = array( 'hotel' => __( 'Hotel stays', 'explore-katsina' ), 'restaurant' => __( 'Table reservations', 'explore-katsina' ), 'event' => __( 'Event centre bookings', 'explore-katsina' ), 'order' => __( 'Food orders', 'explore-katsina' ) );
$csv   = wp_nonce_url( admin_url( 'admin.php?page=ek-reports&ek_csv=1&from=' . $p['from'] . '&to=' . $p['to'] ), 'ek_csv' );
$box   = static function ( $label, $value, $hint = '' ) {
	echo '<div class="card" style="margin:0;min-width:0"><p style="margin:0;color:#50575e">' . esc_html( $label ) . '</p><p style="font-size:22px;font-weight:600;margin:4px 0 0">' . esc_html( $value ) . '</p>' . ( $hint ? '<p class="description" style="margin:4px 0 0">' . esc_html( $hint ) . '</p>' : '' ) . '</div>';
};
?>
<h1><?php esc_html_e( 'Reports', 'explore-katsina' ); ?></h1>
<form method="get" style="margin:12px 0 18px">
	<input type="hidden" name="page" value="ek-reports">
	<label><?php esc_html_e( 'From', 'explore-katsina' ); ?> <input type="date" name="from" value="<?php echo esc_attr( $p['from'] ); ?>"></label>
	<label><?php esc_html_e( 'To', 'explore-katsina' ); ?> <input type="date" name="to" value="<?php echo esc_attr( $p['to'] ); ?>"></label>
	<button class="button"><?php esc_html_e( 'Show', 'explore-katsina' ); ?></button>
	<a class="button" href="<?php echo esc_url( $csv ); ?>"><?php esc_html_e( 'Download bookings (CSV)', 'explore-katsina' ); ?></a>
</form>

<h2><?php esc_html_e( 'In this period', 'explore-katsina' ); ?></h2>
<div class="ek-cards" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
	<?php
	$box( __( 'Bookings made', 'explore-katsina' ), number_format_i18n( $s['bookings'] ) );
	$box( __( 'Paid online by guests', 'explore-katsina' ), Money::format( $s['received_online'] ) );
	$box( __( 'Commission earned', 'explore-katsina' ), Money::format( $s['commission_total'] ), sprintf( /* translators: 1: online, 2: invoices */ __( '%1$s from online payments + %2$s from paid invoices', 'explore-katsina' ), Money::format( $s['commission_online'] ), Money::format( $s['commission_invoices'] ) ) );
	$box( __( 'Refunded to guests', 'explore-katsina' ), Money::format( $s['refunded'] ) );
	$box( __( 'Paid out to businesses', 'explore-katsina' ), Money::format( $s['paid_out'] ) );
	?>
</div>
<table class="wp-list-table widefat fixed striped" style="margin-top:12px;max-width:720px">
	<thead><tr><th><?php esc_html_e( 'Type', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Bookings', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Cancelled / declined / expired', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Value', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php foreach ( $kinds as $k => $label ) : $r = $s['by_kind'][ $k ] ?? null; ?>
		<tr><td><?php echo esc_html( $label ); ?></td><td><?php echo (int) ( $r->n ?? 0 ); ?></td><td><?php echo (int) ( $r->cancelled ?? 0 ); ?></td><td><?php echo esc_html( Money::format( (int) ( $r->value ?? 0 ) ) ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>

<h2><?php esc_html_e( 'Right now', 'explore-katsina' ); ?></h2>
<div class="ek-cards" style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))">
	<?php
	$box( __( 'Money on hold for businesses', 'explore-katsina' ), Money::format( $s['on_hold_now'] ), $s['frozen_now'] ? sprintf( /* translators: %s: amount */ __( 'of which %s frozen by complaints', 'explore-katsina' ), Money::format( $s['frozen_now'] ) ) : __( 'Waiting for check-out / event date + 3 days', 'explore-katsina' ) );
	$box( __( 'Owed to businesses (available)', 'explore-katsina' ), Money::format( $s['available_now'] ), sprintf( /* translators: %s: amount */ __( '%s already requested as payouts', 'explore-katsina' ), Money::format( $s['pending_payouts'] ) ) );
	$box( __( 'Unpaid invoices', 'explore-katsina' ), Money::format( $s['unpaid_total'] ), sprintf( /* translators: %d: count */ _n( '%d invoice', '%d invoices', $s['unpaid_invoices'], 'explore-katsina' ), $s['unpaid_invoices'] ) );
	?>
</div>

<h2><?php esc_html_e( 'Per business', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'On hold', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Available (we owe)', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Payout requested', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Unpaid invoices (they owe)', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php if ( ! $per ) : ?><tr><td colspan="5"><?php esc_html_e( 'Nothing yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $per as $id => $r ) : ?>
		<tr><td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $id ) ); ?>"><?php echo esc_html( $r['name'] ); ?></a></td><td><?php echo esc_html( Money::format( $r['on_hold'] ) ); ?></td><td><strong><?php echo esc_html( Money::format( $r['available'] ) ); ?></strong></td><td><?php echo esc_html( Money::format( $r['requested'] ) ); ?></td><td><?php echo esc_html( Money::format( $r['unpaid_invoices'] ) ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>

<h2><?php esc_html_e( 'Hotel no-show rates', 'explore-katsina' ); ?></h2>
<p class="description"><?php /* translators: 1: percent, 2: count, 3: average */ printf( esc_html__( 'Stays starting in this period. No-show rate = no-shows ÷ (no-shows + checked out). Flagged (⚠) when %1$s or more with at least %2$d finished bookings, or more than twice the average (%3$s). A high rate on pay-at-hotel bookings can mean real guests are marked "no-show" so no commission is invoiced: worth a call.', 'explore-katsina' ), esc_html( round( Reports::NOSHOW_FLAG_RATE * 100 ) . '%' ), (int) Reports::NOSHOW_MIN_BOOKINGS, esc_html( round( $ns['average'] * 100, 1 ) . '%' ) ); ?></p>
<table class="wp-list-table widefat fixed striped" style="max-width:900px">
	<thead><tr><th><?php esc_html_e( 'Hotel', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Finished bookings', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'No-shows', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'of which pay-at-hotel', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Rate', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php if ( ! $ns['rows'] ) : ?><tr><td colspan="5"><?php esc_html_e( 'No finished hotel stays in this period.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $ns['rows'] as $r ) : ?>
		<tr<?php echo $r['flag'] ? ' style="background:#fcf0f1"' : ''; ?>><td><?php echo $r['flag'] ? '⚠ ' : ''; ?><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $r['business_id'] ) ); ?>"><?php echo esc_html( $r['name'] ); ?></a></td><td><?php echo (int) $r['finished']; ?></td><td><?php echo (int) $r['no_show']; ?></td><td><?php echo (int) $r['no_show_venue']; ?></td><td><strong><?php echo esc_html( round( $r['rate'] * 100 ) . '%' ); ?></strong><?php echo $r['flag'] ? ' <span class="ek-pill ek-pill--ek_rejected">' . esc_html__( 'Unusually high', 'explore-katsina' ) . '</span>' : ''; ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>
