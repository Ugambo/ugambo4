<?php
/**
 * Bookings / reservations list (status actions arrive with each business type in Phases 3–5).
 *
 * @var array $b
 * @var array $sections
 */
use EK\Dashboard;
use EK\Money;

defined( 'ABSPATH' ) || exit;

$filter   = sanitize_key( $_GET['status'] ?? '' ); // phpcs:ignore WordPress.Security.NonceVerification
$rows     = Dashboard::bookings( $b['id'], $filter );
$statuses = array( '' => __( 'All', 'explore-katsina' ), 'new' => __( 'New', 'explore-katsina' ), 'requested' => __( 'Requested', 'explore-katsina' ), 'confirmed' => __( 'Confirmed', 'explore-katsina' ), 'completed' => __( 'Completed', 'explore-katsina' ), 'cancelled' => __( 'Cancelled', 'explore-katsina' ) );
?>
<section class="ek-card ek-stack" aria-labelledby="bk-h">
	<h2 id="bk-h" style="margin:0"><?php echo esc_html( $sections['bookings'] ); ?></h2>
	<nav class="ek-row" aria-label="<?php esc_attr_e( 'Filter by status', 'explore-katsina' ); ?>">
		<?php foreach ( $statuses as $key => $label ) : ?>
			<a class="ek-pill" href="<?php echo esc_url( Dashboard::url( 'bookings', $b['id'], $key ? array( 'status' => $key ) : array() ) ); ?>"<?php echo $filter === $key ? ' aria-current="true" style="background:var(--ek-night);color:#fff"' : ''; ?>><?php echo esc_html( $label ); ?></a>
		<?php endforeach; ?>
	</nav>
	<?php if ( ! $rows ) : ?>
		<div class="ek-empty">
			<strong><?php /* translators: %s: bookings/reservations */ printf( esc_html__( 'No %s yet', 'explore-katsina' ), esc_html( strtolower( $sections['bookings'] ) ) ); ?></strong>
			<?php esc_html_e( 'When visitors book or reserve, they appear here with a booking code. You will also get an email for each one.', 'explore-katsina' ); ?>
		</div>
	<?php else : ?>
		<div class="ek-table-wrap">
			<table class="ek-table ek-table--stack">
				<thead><tr><th><?php esc_html_e( 'Code', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Guest', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Date', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Total', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th></tr></thead>
				<tbody>
				<?php foreach ( $rows as $r ) : ?>
					<tr>
						<td data-label="<?php esc_attr_e( 'Code', 'explore-katsina' ); ?>"><strong><?php echo esc_html( $r->code ); ?></strong></td>
						<td data-label="<?php esc_attr_e( 'Guest', 'explore-katsina' ); ?>"><?php echo esc_html( $r->customer_name ); ?></td>
						<td data-label="<?php esc_attr_e( 'Date', 'explore-katsina' ); ?>"><?php echo esc_html( $r->start_date ? wp_date( 'j M Y', strtotime( $r->start_date ) ) : '' ); ?><?php echo $r->end_date && $r->end_date !== $r->start_date ? ' – ' . esc_html( wp_date( 'j M', strtotime( $r->end_date ) ) ) : ''; ?></td>
						<td data-label="<?php esc_attr_e( 'Guests', 'explore-katsina' ); ?>" class="ek-num"><?php echo (int) $r->guests; ?></td>
						<td data-label="<?php esc_attr_e( 'Total', 'explore-katsina' ); ?>" class="ek-num"><?php echo esc_html( Money::format( $r->total_kobo ) ); ?></td>
						<td data-label="<?php esc_attr_e( 'Status', 'explore-katsina' ); ?>"><span class="ek-pill"><?php echo esc_html( Dashboard::booking_status_label( $r->status ) ); ?></span></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
		</div>
	<?php endif; ?>
</section>
