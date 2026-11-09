<?php
/**
 * Event centre booking form.
 *
 * @var array  $hall
 * @var array  $venue
 * @var array  $src
 * @var string $error
 * @var array  $v
 */
use EK\Availability;
use EK\Money;
use EK\Payments;
use EK\Venue;

defined( 'ABSPATH' ) || exit;

$s      = Venue::settings( $venue['id'] );
$date   = sanitize_text_field( $src['date'] ?? '' );
$end    = sanitize_text_field( $src['end'] ?? '' );
$end    = $end ? $end : $date;
$guests = absint( $src['guests'] ?? 0 );
$layout = 'standing' === ( $src['layout'] ?? '' ) ? 'standing' : 'seated';
$ok     = Availability::valid_date( $date ) && $date >= Availability::today();
$q      = $ok ? Venue::quote( $hall, $date, max( $end, $date ) ) : null;
$dep    = $q ? (int) round( $q['total'] * $s['deposit_pct'] / 100 ) : 0;
$user   = wp_get_current_user();
$back   = add_query_arg( array_filter( array( 'date' => $date, 'guests' => $guests ) ), $venue['url'] ) . '#halls';
$mode   = $s['booking_mode'];
?>
<div class="ek ek-book">
	<p><a href="<?php echo esc_url( $back ); ?>">← <?php /* translators: %s: venue */ printf( esc_html__( 'Back to %s', 'explore-katsina' ), esc_html( $venue['name'] ) ); ?></a></p>
	<h1><?php echo 'instant' === $mode ? esc_html__( 'Book your event', 'explore-katsina' ) : esc_html__( 'Request to book', 'explore-katsina' ); ?></h1>
	<?php if ( 'instant' === $mode && 'test' === Payments::provider() ) : ?><p class="ek-notice ek-notice--warn"><?php esc_html_e( 'TEST SITE: the deposit uses a test payment screen. No real money is taken.', 'explore-katsina' ); ?></p><?php endif; ?>
	<?php if ( $error ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
	<?php if ( ! $q || ! $q['ok'] ) : ?>
		<div class="ek-empty"><strong><?php echo $q ? esc_html( $q['reason'] ) : esc_html__( 'Choose your event date first.', 'explore-katsina' ); ?></strong><a href="<?php echo esc_url( $back ); ?>"><?php esc_html_e( 'Choose another date', 'explore-katsina' ); ?></a></div>
	<?php else : ?>
	<div class="ek-book-layout">
		<form method="post" class="ek-card ek-stack" novalidate>
			<input type="hidden" name="ek_action" value="book_event">
			<?php wp_nonce_field( 'ek_book_event', '_ek_nonce' ); ?>
			<input type="hidden" name="hall" value="<?php echo (int) $hall['id']; ?>">
			<input type="hidden" name="date" value="<?php echo esc_attr( $date ); ?>">
			<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
			<h2 style="margin:0"><?php esc_html_e( 'Your event', 'explore-katsina' ); ?></h2>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field"><label for="e-type"><?php esc_html_e( 'Type of event', 'explore-katsina' ); ?></label><select id="e-type" name="event_type"><?php foreach ( Venue::event_types() as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $v['event_type'] ?? '', $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></div>
				<?php if ( 'day' === $hall['pricing'] ) : ?>
					<div class="ek-field"><label for="e-end"><?php esc_html_e( 'Last day (for events over several days)', 'explore-katsina' ); ?></label><input type="date" id="e-end" name="end" min="<?php echo esc_attr( $date ); ?>" value="<?php echo esc_attr( $end ); ?>"></div>
				<?php endif; ?>
				<div class="ek-field"><label for="e-guests"><?php esc_html_e( 'Number of guests', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="number" id="e-guests" name="guests" min="1" required value="<?php echo $guests ? (int) $guests : ''; ?>"></div>
				<div class="ek-field"><label for="e-layout"><?php esc_html_e( 'Layout', 'explore-katsina' ); ?></label><select id="e-layout" name="layout"><option value="seated" <?php selected( $layout, 'seated' ); ?>><?php /* translators: %d: capacity */ printf( esc_html__( 'Seated (up to %d)', 'explore-katsina' ), (int) $hall['capacity_seated'] ); ?></option><option value="standing" <?php selected( $layout, 'standing' ); ?>><?php /* translators: %d: capacity */ printf( esc_html__( 'Standing (up to %d)', 'explore-katsina' ), (int) $hall['capacity_standing'] ); ?></option></select></div>
			</div>
			<h2 style="margin:0"><?php esc_html_e( 'Your details', 'explore-katsina' ); ?></h2>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field ek-span-2"><label for="g-name"><?php esc_html_e( 'Full name', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="g-name" name="guest_name" autocomplete="name" required value="<?php echo esc_attr( $v['guest_name'] ?? ( $user->exists() ? $user->display_name : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="email" id="g-email" name="guest_email" autocomplete="email" required value="<?php echo esc_attr( $v['guest_email'] ?? ( $user->exists() ? $user->user_email : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-phone"><?php esc_html_e( 'Phone (WhatsApp if possible)', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="tel" id="g-phone" name="guest_phone" autocomplete="tel" inputmode="tel" required placeholder="0803 123 4567" value="<?php echo esc_attr( $v['guest_phone'] ?? ( $user->exists() ? get_user_meta( $user->ID, '_ek_phone', true ) : '' ) ); ?>"></div>
				<div class="ek-field ek-span-2"><label for="g-notes"><?php esc_html_e( 'Anything the venue should know (optional)', 'explore-katsina' ); ?></label><textarea id="g-notes" name="notes" rows="3" maxlength="500" placeholder="<?php esc_attr_e( 'e.g. start and end time, catering, decoration', 'explore-katsina' ); ?>"><?php echo esc_textarea( $v['notes'] ?? '' ); ?></textarea></div>
			</div>
			<p class="ek-notice ek-notice--info" style="margin:0">
				<?php if ( 'instant' === $mode ) : ?>
					<?php /* translators: %s: deposit */ printf( esc_html__( 'You pay a %s deposit online now to book the date. Pay the balance to the venue directly.', 'explore-katsina' ), '<strong>' . esc_html( Money::format( $dep ) ) . '</strong>' ); // phpcs:ignore ?>
				<?php else : ?>
					<?php /* translators: %s: deposit */ printf( esc_html__( 'Nothing to pay now. The date is held while the venue replies (within 48 hours). If they accept, you pay a %s deposit online within 72 hours to secure it.', 'explore-katsina' ), '<strong>' . esc_html( Money::format( $dep ) ) . '</strong>' ); // phpcs:ignore ?>
				<?php endif; ?>
			</p>
			<button class="ek-btn ek-btn--block" type="submit"><?php echo 'instant' === $mode ? esc_html( sprintf( /* translators: %s: amount */ __( 'Book and pay %s deposit', 'explore-katsina' ), Money::format( $dep ) ) ) : esc_html__( 'Send booking request', 'explore-katsina' ); ?></button>
		</form>
		<aside class="ek-card ek-stack ek-book-summary">
			<h2 style="margin:0"><?php echo esc_html( $venue['name'] ); ?></h2>
			<?php if ( $hall['photos'] ) { echo wp_get_attachment_image( $hall['photos'][0], 'medium', false, array( 'class' => 'ek-book-img', 'alt' => '' ) ); } // phpcs:ignore ?>
			<dl class="ek-dl">
				<dt><?php esc_html_e( 'Hall', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $hall['name'] ); ?></dd>
				<dt><?php esc_html_e( 'Date', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'l j F Y', strtotime( $date ) ) ); ?></dd>
				<dt><?php esc_html_e( 'Price', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( Money::format( $q['total'] ) ); ?></strong> <?php echo 'event' === $hall['pricing'] ? esc_html__( 'per event', 'explore-katsina' ) : esc_html__( 'for the first day', 'explore-katsina' ); ?></dd>
				<dt><?php esc_html_e( 'Deposit', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $dep ) ); ?> (<?php echo (int) $s['deposit_pct']; ?>%)</dd>
			</dl>
		</aside>
	</div>
	<?php endif; ?>
</div>
