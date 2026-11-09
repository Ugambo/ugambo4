<?php
/**
 * Guest tools on the booking page: add to calendar, cancel (with the refund shown first),
 * report a problem (freezes the business's payment until we decide), review.
 *
 * @var object $b
 */
use EK\Booking_Page;
use EK\Calendar;
use EK\Complaints;
use EK\Money;
use EK\Refunds;
use EK\Reviews;
use EK\View;

defined( 'ABSPATH' ) || exit;

$live    = in_array( $b->status, array( 'new', 'confirmed', 'requested', 'deposit_paid', 'pending_payment' ), true ) && 'order' !== $b->kind;
$cancel  = Refunds::can_cancel( $b );
$quote   = is_wp_error( $cancel ) ? null : Refunds::quote( $b );
$rev_ok  = Reviews::can_review( $b );
$review  = Reviews::for_booking( $b->id );
$values  = Booking_Page::$review_values;
$refunds = Refunds::for_booking( $b->id );
$problem = Complaints::for_booking( $b->id );
$can_rep = true === Complaints::can_report( $b );
$nonce   = static fn( $a ) => wp_nonce_field( 'ek_' . $a . '_' . $b->code, '_ek_nonce', true, false ) . '<input type="hidden" name="code" value="' . esc_attr( $b->code ) . '"><input type="hidden" name="key" value="' . esc_attr( $b->access_key ) . '"><input type="hidden" name="ek_action" value="' . esc_attr( $a ) . '">';
?>
<?php if ( Booking_Page::$notice ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( Booking_Page::$notice ); ?></div><?php endif; ?>
<?php if ( ! empty( $_GET['cancelled'] ) ) : // phpcs:ignore ?><div class="ek-notice ek-notice--ok" role="status"><?php esc_html_e( 'Cancelled. We have emailed you the details.', 'explore-katsina' ); ?></div><?php endif; ?>

<?php if ( $refunds ) : ?>
	<section class="ek-card ek-stack" aria-labelledby="rf-h">
		<h2 id="rf-h" style="margin:0"><?php esc_html_e( 'Refund', 'explore-katsina' ); ?></h2>
		<?php foreach ( $refunds as $r ) : ?>
			<p style="margin:0"><strong><?php echo esc_html( Money::format( $r->amount_kobo ) ); ?></strong> · <?php echo 'refunded' === $r->status ? esc_html__( 'sent back to you', 'explore-katsina' ) . ' (' . esc_html( View::date( $r->processed_at ) ) . ')' : esc_html__( 'being processed', 'explore-katsina' ); ?></p>
		<?php endforeach; ?>
	</section>
<?php endif; ?>

<?php if ( $problem || $can_rep ) : ?>
	<section class="ek-card ek-stack" id="problem" aria-labelledby="pb-h">
		<?php if ( $problem ) : ?>
			<?php if ( ! empty( $_GET['reported'] ) ) : // phpcs:ignore ?><div class="ek-notice ek-notice--ok" role="status"><?php esc_html_e( 'Thank you. We have received your report and emailed you a copy.', 'explore-katsina' ); ?></div><?php endif; ?>
			<h2 id="pb-h" style="margin:0"><?php esc_html_e( 'Your report', 'explore-katsina' ); ?></h2>
			<p style="margin:0" class="ek-small ek-muted"><?php echo esc_html( View::date( $problem->created_at, true ) ); ?></p>
			<p style="margin:0"><?php echo esc_html( $problem->message ); ?></p>
			<?php if ( 'open' === $problem->status ) : ?>
				<p style="margin:0"><span class="ek-pill"><?php esc_html_e( 'Being looked into', 'explore-katsina' ); ?></span> <?php esc_html_e( 'Our team usually replies within 2 working days.', 'explore-katsina' ); ?></p>
			<?php else : ?>
				<p style="margin:0"><span class="ek-pill"><?php esc_html_e( 'Resolved', 'explore-katsina' ); ?></span> <?php echo (int) $problem->refund_kobo ? esc_html( sprintf( /* translators: %s: amount */ __( 'Refund of %s agreed.', 'explore-katsina' ), Money::format( $problem->refund_kobo ) ) ) : esc_html__( 'No refund was given.', 'explore-katsina' ); ?> <?php echo esc_html( (string) $problem->resolution_note ); ?></p>
			<?php endif; ?>
		<?php else : ?>
			<h2 id="pb-h" style="margin:0"><?php esc_html_e( 'Problem with your booking?', 'explore-katsina' ); ?></h2>
			<p style="margin:0" class="ek-small"><?php /* translators: %s: date */ printf( esc_html__( 'Tell us by %s. We hold the business’s payment until we have looked into it.', 'explore-katsina' ), esc_html( wp_date( 'j M Y', Complaints::deadline( $b ) ) ) ); ?></p>
			<details<?php echo isset( $values['complaint'] ) ? ' open' : ''; ?>>
				<summary class="ek-link-btn"><?php esc_html_e( 'Report a problem', 'explore-katsina' ); ?></summary>
				<form method="post" class="ek-stack" style="margin-top:10px">
					<?php echo $nonce( 'guest_complaint' ); // phpcs:ignore ?>
					<div class="ek-field"><label for="pb-msg"><?php esc_html_e( 'What went wrong?', 'explore-katsina' ); ?></label><textarea id="pb-msg" name="complaint" rows="4" maxlength="3000" required><?php echo esc_textarea( $values['complaint'] ?? '' ); ?></textarea><span class="ek-hint"><?php esc_html_e( 'For example: the room was not as shown, the hall was given to someone else, or you were wrongly marked as a no-show.', 'explore-katsina' ); ?></span></div>
					<div><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Send report', 'explore-katsina' ); ?></button></div>
				</form>
			</details>
		<?php endif; ?>
	</section>
<?php endif; ?>

<?php if ( $live ) : ?>
	<section class="ek-card ek-stack" aria-labelledby="cal-h2">
		<h2 id="cal-h2" style="margin:0"><?php esc_html_e( 'Add to your calendar', 'explore-katsina' ); ?></h2>
		<div class="ek-row">
			<a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Calendar::ics_url( $b ) ); ?>"><?php esc_html_e( 'Phone / Outlook / Apple (.ics)', 'explore-katsina' ); ?></a>
			<a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Calendar::google_url( $b ) ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Google Calendar', 'explore-katsina' ); ?></a>
		</div>
	</section>
<?php endif; ?>

<?php if ( $quote ) : ?>
	<section class="ek-card ek-stack" aria-labelledby="cx-h">
		<h2 id="cx-h" style="margin:0"><?php esc_html_e( 'Need to cancel?', 'explore-katsina' ); ?></h2>
		<p style="margin:0"><?php echo esc_html( $quote['rule'] ); ?></p>
		<?php if ( (int) $b->paid_kobo ) : ?>
			<p style="margin:0"><?php /* translators: 1: refund, 2: paid */ printf( esc_html__( 'If you cancel now you get back %1$s of the %2$s you paid.', 'explore-katsina' ), '<strong>' . esc_html( Money::format( $quote['refund'] ) ) . '</strong>', esc_html( Money::format( $b->paid_kobo ) ) ); // phpcs:ignore ?></p>
		<?php endif; ?>
		<details>
			<summary class="ek-link-btn"><?php esc_html_e( 'Cancel this booking', 'explore-katsina' ); ?></summary>
			<form method="post" class="ek-stack" style="margin-top:10px">
				<?php echo $nonce( 'guest_cancel' ); // phpcs:ignore ?>
				<p class="ek-small" style="margin:0"><?php esc_html_e( 'This cannot be undone.', 'explore-katsina' ); ?></p>
				<div><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Yes, cancel it', 'explore-katsina' ); ?></button></div>
			</form>
		</details>
	</section>
<?php endif; ?>

<section class="ek-stack" id="review" aria-label="<?php esc_attr_e( 'Review', 'explore-katsina' ); ?>">
	<?php if ( $review ) : ?>
		<div class="ek-card ek-stack">
			<?php if ( ! empty( $_GET['reviewed'] ) ) : // phpcs:ignore ?><div class="ek-notice ek-notice--ok" role="status"><?php esc_html_e( 'Thank you! Your review is published.', 'explore-katsina' ); ?></div><?php endif; ?>
			<h2 style="margin:0"><?php esc_html_e( 'Your review', 'explore-katsina' ); ?></h2>
			<p style="margin:0"><?php echo View::stars( $review->rating_overall ); // phpcs:ignore ?> <strong><?php echo esc_html( $review->title ); ?></strong></p>
			<p style="margin:0"><?php echo esc_html( $review->body ); ?></p>
		</div>
	<?php elseif ( true === $rev_ok ) : ?>
		<form method="post" class="ek-card ek-stack ek-review-form" novalidate>
			<?php echo $nonce( 'guest_review' ); // phpcs:ignore ?>
			<h2 style="margin:0"><?php esc_html_e( 'Write a review', 'explore-katsina' ); ?></h2>
			<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Your review is marked "verified" because you really booked. Be honest and fair.', 'explore-katsina' ); ?></p>
			<fieldset class="ek-rating" style="border:0;padding:0;margin:0">
				<legend class="ek-label"><?php esc_html_e( 'Overall', 'explore-katsina' ); ?> <span class="ek-req">*</span></legend>
				<div class="ek-stars-input">
					<?php for ( $i = 5; $i >= 1; $i-- ) : ?>
						<input type="radio" id="ro-<?php echo (int) $i; ?>" name="rating_overall" value="<?php echo (int) $i; ?>" <?php checked( (int) ( $values['rating_overall'] ?? 0 ), $i ); ?> required><label for="ro-<?php echo (int) $i; ?>" title="<?php /* translators: %d: stars */ printf( esc_attr__( '%d stars', 'explore-katsina' ), (int) $i ); ?>">★<span class="ek-visually-hidden"><?php /* translators: %d: stars */ printf( esc_html__( '%d stars', 'explore-katsina' ), (int) $i ); ?></span></label>
					<?php endfor; ?>
				</div>
			</fieldset>
			<div class="ek-grid ek-grid--2">
				<?php foreach ( Reviews::parts( $b->kind ) as $k => $label ) : ?>
					<div class="ek-field"><label for="rp-<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $label ); ?></label><select id="rp-<?php echo esc_attr( $k ); ?>" name="rating_<?php echo esc_attr( $k ); ?>"><option value=""><?php esc_html_e( 'Skip', 'explore-katsina' ); ?></option><?php for ( $i = 5; $i >= 1; $i-- ) : ?><option value="<?php echo (int) $i; ?>" <?php selected( (int) ( $values[ 'rating_' . $k ] ?? 0 ), $i ); ?>><?php echo esc_html( str_repeat( '★', $i ) ); ?></option><?php endfor; ?></select></div>
				<?php endforeach; ?>
			</div>
			<div class="ek-field"><label for="rv-title"><?php esc_html_e( 'Title', 'explore-katsina' ); ?></label><input type="text" id="rv-title" name="review_title" maxlength="120" value="<?php echo esc_attr( $values['review_title'] ?? '' ); ?>" placeholder="<?php esc_attr_e( 'e.g. Clean rooms, friendly staff', 'explore-katsina' ); ?>"></div>
			<div class="ek-field"><label for="rv-body"><?php esc_html_e( 'Your review', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><textarea id="rv-body" name="review_body" rows="5" maxlength="3000" required><?php echo esc_textarea( $values['review_body'] ?? '' ); ?></textarea></div>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field"><label for="rv-name"><?php esc_html_e( 'Name shown', 'explore-katsina' ); ?></label><input type="text" id="rv-name" name="review_name" maxlength="60" value="<?php echo esc_attr( $values['review_name'] ?? '' ); ?>" placeholder="<?php echo esc_attr( strtok( $b->customer_name, ' ' ) ); ?>"></div>
				<div class="ek-field"><label for="rv-lang"><?php esc_html_e( 'Language', 'explore-katsina' ); ?></label><select id="rv-lang" name="lang"><option value="en">English</option><option value="ha" <?php selected( $values['lang'] ?? '', 'ha' ); ?>>Hausa</option></select></div>
			</div>
			<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Publish review', 'explore-katsina' ); ?></button></div>
		</form>
	<?php endif; ?>
</section>
