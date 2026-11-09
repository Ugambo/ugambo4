<?php
/**
 * Admin: guest complaints. The business's money for the booking is frozen until you decide.
 */
use EK\Booking;
use EK\Business;
use EK\Complaints;
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;
?>
<h1><?php esc_html_e( 'Complaints', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'Guests can report a problem during a stay and up to 3 days after it (or after the event or meal). While a complaint is open, the business is not paid for that booking. Contact both sides if needed, then decide: release the money to the business, or refund the guest part or all of what they paid online. The business keeps the rest, minus commission on it.', 'explore-katsina' ); ?></p>
<h2><?php esc_html_e( 'Open', 'explore-katsina' ); ?></h2>
<?php $rows = Complaints::open_list(); if ( ! $rows ) : ?><p><?php esc_html_e( 'No open complaints.', 'explore-katsina' ); ?></p><?php endif; ?>
<?php foreach ( $rows as $c ) : $b = Booking::get( $c->booking_id ); if ( ! $b ) { continue; } $max = Complaints::refundable( $b ); ?>
	<div class="card" style="max-width:none">
		<h3 style="margin-top:0"><?php echo esc_html( $b->code ); ?> · <?php echo esc_html( get_the_title( $b->business_id ) ); ?> <span class="ek-pill"><?php echo esc_html( Booking::statuses()[ $b->status ] ?? $b->status ); ?></span></h3>
		<p><strong><?php esc_html_e( 'Guest', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( $b->customer_name ); ?> · <?php echo esc_html( $b->customer_email ); ?> · <?php echo esc_html( Business::display_phone( $b->customer_phone ) ); ?><br>
		<strong><?php esc_html_e( 'Dates', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( View::date( $b->start_date . ' 12:00:00' ) ); ?><?php echo $b->end_date && $b->end_date !== $b->start_date ? ' – ' . esc_html( View::date( $b->end_date . ' 12:00:00' ) ) : ''; ?> ·
		<strong><?php esc_html_e( 'Total', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( Money::format( $b->total_kobo ) ); ?> · <strong><?php esc_html_e( 'Paid online', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( Money::format( $b->paid_kobo ) ); ?><br>
		<strong><?php esc_html_e( 'Reported', 'explore-katsina' ); ?>:</strong> <?php echo esc_html( View::date( $c->created_at, true ) ); ?></p>
		<blockquote style="background:#f6f7f7;padding:10px 14px;margin:0 0 12px;border-left:4px solid #8E1B2C"><?php echo nl2br( esc_html( $c->message ) ); ?></blockquote>
		<form method="post">
			<?php wp_nonce_field( 'ek_admin_complaint_resolve_' . $c->id ); ?>
			<input type="hidden" name="ek_admin_action" value="complaint_resolve"><input type="hidden" name="complaint_id" value="<?php echo (int) $c->id; ?>">
			<p><label><input type="radio" name="outcome" value="release" required> <?php esc_html_e( 'No refund: release the money to the business', 'explore-katsina' ); ?></label><br>
			<?php if ( $max ) : ?><label><input type="radio" name="outcome" value="refund"> <?php esc_html_e( 'Refund the guest', 'explore-katsina' ); ?> ₦ <input type="text" name="refund" size="10" placeholder="<?php echo esc_attr( number_format( $max / 100 ) ); ?>"> <span class="description"><?php /* translators: %s: amount */ printf( esc_html__( 'up to %s', 'explore-katsina' ), esc_html( Money::format( $max ) ) ); ?></span></label><?php else : ?><span class="description"><?php esc_html_e( 'Nothing was paid online, so there is nothing to refund through us.', 'explore-katsina' ); ?></span><?php endif; ?></p>
			<p><label><?php esc_html_e( 'Note (sent to the guest and the business)', 'explore-katsina' ); ?><br><textarea name="note" rows="2" cols="70"></textarea></label></p>
			<p><button class="button button-primary"><?php esc_html_e( 'Decide', 'explore-katsina' ); ?></button></p>
		</form>
	</div>
<?php endforeach; ?>
<h2><?php esc_html_e( 'Resolved', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Booking', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Decision', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Note', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'When', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php $rows = Complaints::recent(); if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'None yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $c ) : $b = Booking::get( $c->booking_id ); ?>
		<tr><td><?php echo esc_html( $b ? $b->code : '#' . $c->booking_id ); ?></td><td><?php echo esc_html( get_the_title( $c->business_id ) ); ?></td><td><?php echo 'refund' === $c->resolution ? esc_html__( 'Refunded', 'explore-katsina' ) . ' ' . esc_html( Money::format( $c->refund_kobo ) ) : esc_html__( 'Released to business', 'explore-katsina' ); ?></td><td><?php echo esc_html( $c->resolution_note ); ?></td><td><?php echo esc_html( View::date( $c->resolved_at, true ) ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>
