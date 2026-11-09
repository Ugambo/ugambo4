<?php
/**
 * Admin: revenue dashboard (Explore Katsina's own income per month, by source).
 */
use EK\Money;
use EK\Revenue;

defined( 'ABSPATH' ) || exit;
$data    = Revenue::by_month( 12 );
$sources = Revenue::sources();
$totals  = array_map( 'array_sum', $data );
$max     = max( 1, max( $totals ) );
$by_src  = array();
foreach ( $data as $row ) {
	foreach ( $row as $k => $v ) {
		$by_src[ $k ] = ( $by_src[ $k ] ?? 0 ) + $v;
	}
}
$this_m = (string) array_key_last( $data );
?>
<h1><?php esc_html_e( 'Revenue', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'Explore Katsina\'s own income per month (net of refunds). Businesses\' share of bookings is not counted: it is money we hold and pay out to them.', 'explore-katsina' ); ?></p>
<div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));margin:12px 0">
	<div class="card" style="margin:0"><p style="margin:0;color:#50575e"><?php esc_html_e( 'This month', 'explore-katsina' ); ?></p><p style="font-size:24px;font-weight:600;margin:4px 0 0"><?php echo esc_html( Money::format( $totals[ $this_m ] ?? 0 ) ); ?></p></div>
	<div class="card" style="margin:0"><p style="margin:0;color:#50575e"><?php esc_html_e( 'Last 12 months', 'explore-katsina' ); ?></p><p style="font-size:24px;font-weight:600;margin:4px 0 0"><?php echo esc_html( Money::format( array_sum( $totals ) ) ); ?></p></div>
	<div class="card" style="margin:0"><p style="margin:0;color:#50575e"><?php esc_html_e( 'Biggest source (12 months)', 'explore-katsina' ); ?></p><p style="font-size:18px;font-weight:600;margin:4px 0 0"><?php arsort( $by_src ); echo esc_html( current( $by_src ) ? $sources[ key( $by_src ) ] . ' · ' . Money::format( current( $by_src ) ) : '—' ); ?></p></div>
</div>
<div class="card" style="max-width:none" aria-label="<?php esc_attr_e( 'Income per month', 'explore-katsina' ); ?>">
	<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:8px;align-items:end;height:180px">
		<?php foreach ( $totals as $m => $t ) : ?><div style="display:flex;flex-direction:column;align-items:center;justify-content:end;height:100%;gap:4px"><span style="font-size:11px;color:#50575e"><?php echo $t ? esc_html( Money::format( $t ) ) : ''; ?></span><span title="<?php echo esc_attr( Money::format( $t ) ); ?>" style="display:block;width:100%;background:#8E1B2C;border-radius:4px 4px 0 0;height:<?php echo (int) max( 2, round( 140 * $t / $max ) ); ?>px"></span><span style="font-size:12px"><?php echo esc_html( wp_date( 'M', strtotime( $m . '-15' ) ) ); ?></span></div><?php endforeach; ?>
	</div>
</div>
<div style="overflow-x:auto">
<table class="wp-list-table widefat striped" style="min-width:1100px">
	<thead><tr><th><?php esc_html_e( 'Source', 'explore-katsina' ); ?></th><?php foreach ( array_keys( $data ) as $m ) : ?><th style="text-align:right"><?php echo esc_html( wp_date( 'M y', strtotime( $m . '-15' ) ) ); ?></th><?php endforeach; ?><th style="text-align:right"><?php esc_html_e( '12 months', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php foreach ( $sources as $k => $label ) : ?>
		<tr><td><?php echo esc_html( $label ); ?></td><?php foreach ( $data as $row ) : ?><td style="text-align:right"><?php echo $row[ $k ] ? esc_html( Money::format( $row[ $k ] ) ) : '<span style="color:#a7aaad">—</span>'; ?></td><?php endforeach; ?><td style="text-align:right"><strong><?php echo esc_html( Money::format( array_sum( array_column( $data, $k ) ) ) ); ?></strong></td></tr>
	<?php endforeach; ?>
	<tr><th><?php esc_html_e( 'Total', 'explore-katsina' ); ?></th><?php foreach ( $totals as $t ) : ?><th style="text-align:right"><?php echo esc_html( Money::format( $t ) ); ?></th><?php endforeach; ?><th style="text-align:right"><?php echo esc_html( Money::format( array_sum( $totals ) ) ); ?></th></tr>
	</tbody>
</table>
</div>
<?php include __DIR__ . '/_income-form.php'; ?>
