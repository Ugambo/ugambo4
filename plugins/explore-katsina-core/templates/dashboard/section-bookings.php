<?php
/**
 * Bookings / reservations with actions.
 *
 * @var array $b
 * @var array $sections
 */
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Money;

defined( 'ABSPATH' ) || exit;

$groups = Dashboard::booking_groups();
$counts = Dashboard::booking_counts( $b['id'] );
$tab    = sanitize_key( $_GET['tab'] ?? '' ); // phpcs:ignore
$tab    = isset( $groups[ $tab ] ) ? $tab : ( $counts['action'] ? 'action' : 'upcoming' );
$rows   = Dashboard::bookings( $b['id'], $tab );
$modes  = array(
	'full'    => __( 'Paid in full online', 'explore-katsina' ),
	'deposit' => __( 'Deposit online', 'explore-katsina' ),
	'venue'   => __( 'Pays at the hotel', 'explore-katsina' ),
);
?>
<nav class="ek-row" aria-label="<?php esc_attr_e( 'Booking groups', 'explore-katsina' ); ?>">
	<?php foreach ( $groups as $key => $g ) : ?>
		<a class="ek-pill" href="<?php echo esc_url( Dashboard::url( 'bookings', $b['id'], array( 'tab' => $key ) ) ); ?>"<?php echo $tab === $key ? ' aria-current="true" style="background:var(--ek-night);color:#fff"' : ''; ?>><?php echo esc_html( $g[0] ); ?> <span class="ek-num">(<?php echo (int) $counts[ $key ]; ?>)</span></a>
	<?php endforeach; ?>
</nav>

<?php if ( ! $rows ) : ?>
	<div class="ek-empty">
		<strong><?php /* translators: %s: group */ printf( esc_html__( 'Nothing in "%s"', 'explore-katsina' ), esc_html( $groups[ $tab ][0] ) ); ?></strong>
		<?php esc_html_e( 'New bookings arrive here with a booking code. You also get an email for each one.', 'explore-katsina' ); ?>
	</div>
<?php else : ?>
	<div class="ek-stack">
		<?php
		foreach ( $rows as $r ) :
			$bk      = Booking::get( $r->id );
			$d       = $bk->details;
			$nights  = count( $d['nights'] ?? array() );
			$due     = (int) $bk->total_kobo - (int) $bk->paid_kobo;
			$actions = Booking::hotel_actions( $bk->status );
			?>
			<article class="ek-card ek-booking" aria-labelledby="bk-<?php echo (int) $bk->id; ?>">
				<div class="ek-row ek-row--between">
					<h3 id="bk-<?php echo (int) $bk->id; ?>" style="margin:0"><?php echo esc_html( $bk->code ); ?> · <?php echo esc_html( $bk->customer_name ); ?></h3>
					<span class="ek-pill ek-status-<?php echo esc_attr( $bk->status ); ?>"><?php echo esc_html( Dashboard::booking_status_label( $bk->status ) ); ?></span>
				</div>
				<dl class="ek-dl">
					<dt><?php esc_html_e( 'Room', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ( $d['room'] ?? '' ) . ' × ' . (int) $bk->quantity ); ?></dd>
					<dt><?php esc_html_e( 'Dates', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'D j M', strtotime( $bk->start_date ) ) . ' → ' . wp_date( 'D j M Y', strtotime( $bk->end_date ) ) ); ?> · <?php /* translators: %d: nights */ printf( esc_html( _n( '%d night', '%d nights', $nights, 'explore-katsina' ) ), (int) $nights ); ?></dd>
					<dt><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></dt><dd><?php echo (int) $bk->guests; ?></dd>
					<dt><?php esc_html_e( 'Payment', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $bk->total_kobo ) ); ?> · <?php echo esc_html( $modes[ $bk->payment_mode ] ?? $bk->payment_mode ); ?><?php echo (int) $bk->paid_kobo ? ' · ' . esc_html__( 'paid', 'explore-katsina' ) . ' ' . esc_html( Money::format( $bk->paid_kobo ) ) : ''; ?><?php echo $due > 0 ? ' · <strong>' . esc_html__( 'collect at hotel', 'explore-katsina' ) . ' ' . esc_html( Money::format( $due ) ) . '</strong>' : ''; ?></dd>
					<?php if ( ! in_array( $bk->status, array( 'cancelled', 'declined' ), true ) ) : ?>
						<dt><?php esc_html_e( 'Contact', 'explore-katsina' ); ?></dt><dd><a href="<?php echo esc_url( 'tel:' . $bk->customer_phone ); ?>"><?php echo esc_html( Business::display_phone( $bk->customer_phone ) ); ?></a> · <a href="<?php echo esc_url( 'mailto:' . $bk->customer_email ); ?>"><?php echo esc_html( $bk->customer_email ); ?></a></dd>
					<?php endif; ?>
					<?php if ( $bk->notes ) : ?><dt><?php esc_html_e( 'Requests', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $bk->notes ); ?></dd><?php endif; ?>
				</dl>
				<?php if ( $actions ) : ?>
					<div class="ek-row">
						<?php foreach ( $actions as $to => $label ) : ?>
							<form method="post">
								<?php echo Dashboard::nonce_fields( 'dash_booking', $b['id'] ); // phpcs:ignore ?>
								<input type="hidden" name="booking_id" value="<?php echo (int) $bk->id; ?>">
								<input type="hidden" name="to" value="<?php echo esc_attr( $to ); ?>">
								<input type="hidden" name="tab" value="<?php echo esc_attr( $tab ); ?>">
								<button type="submit" class="ek-btn ek-btn--sm <?php echo in_array( $to, array( 'declined', 'cancelled', 'no_show' ), true ) ? 'ek-btn--ghost' : ''; ?>"<?php echo in_array( $to, array( 'declined', 'cancelled', 'no_show' ), true ) ? ' data-ek-confirm="' . esc_attr__( 'Tap again to confirm', 'explore-katsina' ) . '"' : ''; ?>><?php echo esc_html( $label ); ?></button>
							</form>
						<?php endforeach; ?>
					</div>
				<?php endif; ?>
			</article>
		<?php endforeach; ?>
	</div>
<?php endif; ?>
