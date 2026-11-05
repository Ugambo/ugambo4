<?php
/**
 * Booking form: summary, guest details, payment choice.
 *
 * @var array  $room
 * @var array  $hotel
 * @var array  $p
 * @var string $error
 * @var array  $v
 */
use EK\Availability;
use EK\Hotel;
use EK\Install;
use EK\Money;
use EK\Payments;

defined( 'ABSPATH' ) || exit;

$user     = wp_get_current_user();
$s        = Hotel::settings( $hotel['id'] );
$policy   = Hotel::policies()[ $s['policy'] ];
$dates_ok = $p['checkin'] && $p['checkout'];
$quote    = $dates_ok ? Availability::quote( $room, $p['checkin'], $p['checkout'], $p['rooms'] ) : null;
$choices  = $quote ? Hotel::payment_choices( $hotel['id'], $quote['total'] ) : array();
if ( ! Payments::online_available() ) {
	$choices = array_intersect_key( $choices, array( 'venue' => 1 ) );
}
$picked = $v['payment'] ?? ( array_key_first( $choices ) ?? '' );
$back   = add_query_arg( array_filter( array( 'checkin' => $p['checkin'], 'checkout' => $p['checkout'], 'guests' => $p['guests'], 'rooms' => $p['rooms'] ) ), $hotel['url'] ) . '#rooms';
?>
<div class="ek ek-book">
	<p><a href="<?php echo esc_url( $back ); ?>">← <?php /* translators: %s: hotel */ printf( esc_html__( 'Back to %s', 'explore-katsina' ), esc_html( $hotel['name'] ) ); ?></a></p>
	<h1><?php esc_html_e( 'Complete your booking', 'explore-katsina' ); ?></h1>
	<?php if ( 'test' === Payments::provider() ) : ?>
		<p class="ek-notice ek-notice--warn"><?php esc_html_e( 'TEST SITE: online payments use a test screen. No real money is taken.', 'explore-katsina' ); ?></p>
	<?php endif; ?>
	<?php if ( $error ) : ?><div class="ek-notice ek-notice--error" role="alert" tabindex="-1"><?php echo esc_html( $error ); ?></div><?php endif; ?>

	<?php if ( ! $dates_ok || ! $quote || ! $quote['ok'] || $room['max_guests'] * $p['rooms'] < $p['guests'] ) : ?>
		<div class="ek-empty">
			<strong><?php echo $quote && ! $quote['ok'] ? esc_html( $quote['reason'] ) : esc_html__( 'Please choose your dates and number of guests first.', 'explore-katsina' ); ?></strong>
			<a href="<?php echo esc_url( $back ); ?>"><?php esc_html_e( 'Choose other dates or rooms', 'explore-katsina' ); ?></a>
		</div>
	<?php else : ?>
	<div class="ek-book-layout">
		<form method="post" class="ek-card ek-stack" novalidate>
			<input type="hidden" name="ek_action" value="book_hotel">
			<?php wp_nonce_field( 'ek_book_hotel', '_ek_nonce' ); ?>
			<?php foreach ( array( 'room' => $room['id'], 'checkin' => $p['checkin'], 'checkout' => $p['checkout'], 'guests' => $p['guests'], 'rooms' => $p['rooms'] ) as $k => $val ) : ?>
				<input type="hidden" name="<?php echo esc_attr( $k ); ?>" value="<?php echo esc_attr( $val ); ?>">
			<?php endforeach; ?>
			<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>

			<h2 style="margin:0"><?php esc_html_e( 'Guest details', 'explore-katsina' ); ?></h2>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field ek-span-2"><label for="g-name"><?php esc_html_e( 'Full name', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="g-name" name="guest_name" autocomplete="name" required value="<?php echo esc_attr( $v['guest_name'] ?? ( $user->exists() ? $user->display_name : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="email" id="g-email" name="guest_email" autocomplete="email" required value="<?php echo esc_attr( $v['guest_email'] ?? ( $user->exists() ? $user->user_email : '' ) ); ?>"><span class="ek-hint"><?php esc_html_e( 'Your confirmation is sent here.', 'explore-katsina' ); ?></span></div>
				<div class="ek-field"><label for="g-phone"><?php esc_html_e( 'Phone (WhatsApp if possible)', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="tel" id="g-phone" name="guest_phone" autocomplete="tel" inputmode="tel" required placeholder="0803 123 4567" value="<?php echo esc_attr( $v['guest_phone'] ?? '' ); ?>"></div>
				<div class="ek-field ek-span-2"><label for="g-notes"><?php esc_html_e( 'Special requests (optional)', 'explore-katsina' ); ?></label><textarea id="g-notes" name="notes" rows="3" maxlength="500" placeholder="<?php esc_attr_e( 'e.g. arriving late, airport pickup, ground floor', 'explore-katsina' ); ?>"><?php echo esc_textarea( $v['notes'] ?? '' ); ?></textarea></div>
			</div>

			<fieldset style="border:0;padding:0;margin:0">
				<legend><h2 style="margin:0 0 10px"><?php esc_html_e( 'How would you like to pay?', 'explore-katsina' ); ?></h2></legend>
				<div class="ek-choices">
					<?php foreach ( $choices as $k => $c ) : ?>
						<label class="ek-choice">
							<input type="radio" name="payment" value="<?php echo esc_attr( $k ); ?>" <?php checked( $picked, $k ); ?> required>
							<span><strong><?php echo esc_html( $c['label'] ); ?></strong><br>
								<span class="ek-small">
									<?php if ( $c['now'] ) : ?><?php esc_html_e( 'Now:', 'explore-katsina' ); ?> <strong class="ek-num"><?php echo esc_html( Money::format( $c['now'] ) ); ?></strong><?php endif; ?>
									<?php if ( $c['now'] && $c['later'] ) : ?> · <?php endif; ?>
									<?php if ( $c['later'] ) : ?><?php esc_html_e( 'At the hotel:', 'explore-katsina' ); ?> <strong class="ek-num"><?php echo esc_html( Money::format( $c['later'] ) ); ?></strong><?php endif; ?>
								</span>
							</span>
						</label>
					<?php endforeach; ?>
				</div>
				<?php if ( ! Payments::online_available() && ( $s['pay_full'] || $s['pay_deposit'] ) ) : ?><p class="ek-small ek-muted"><?php esc_html_e( 'Online payment is temporarily unavailable.', 'explore-katsina' ); ?></p><?php endif; ?>
			</fieldset>

			<label class="ek-check"><input type="checkbox" name="agree" value="1" required <?php checked( ! empty( $v['agree'] ) ); ?>> <span><?php /* translators: 1: policy label, 2: policy text */ printf( esc_html__( 'I accept the hotel’s %1$s cancellation policy (%2$s) and the booking terms.', 'explore-katsina' ), '<strong>' . esc_html( $policy['label'] ) . '</strong>', esc_html( $policy['text'] ) ); // phpcs:ignore ?></span></label>
			<button class="ek-btn ek-btn--block" type="submit"><?php esc_html_e( 'Confirm booking', 'explore-katsina' ); ?></button>
			<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Online payments are held by Explore Katsina and paid to the hotel after your stay. Your room is held for 15 minutes while you pay.', 'explore-katsina' ); ?></p>
		</form>

		<aside class="ek-card ek-stack ek-book-summary" aria-labelledby="sum-h">
			<h2 id="sum-h" style="margin:0"><?php esc_html_e( 'Your stay', 'explore-katsina' ); ?></h2>
			<?php if ( $hotel['photos'] ) { echo wp_get_attachment_image( $room['photos'][0] ?? $hotel['photos'][0], 'medium', false, array( 'class' => 'ek-book-img', 'alt' => '' ) ); } // phpcs:ignore ?>
			<p style="margin:0"><strong><?php echo esc_html( $hotel['name'] ); ?></strong><br><?php echo esc_html( $room['name'] ); ?> × <?php echo (int) $p['rooms']; ?></p>
			<dl class="ek-dl">
				<dt><?php esc_html_e( 'Check-in', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'D j M Y', strtotime( $p['checkin'] ) ) ); ?> · <?php /* translators: %s: time */ printf( esc_html__( 'from %s', 'explore-katsina' ), esc_html( $s['checkin'] ) ); ?></dd>
				<dt><?php esc_html_e( 'Check-out', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'D j M Y', strtotime( $p['checkout'] ) ) ); ?> · <?php /* translators: %s: time */ printf( esc_html__( 'by %s', 'explore-katsina' ), esc_html( $s['checkout'] ) ); ?></dd>
				<dt><?php esc_html_e( 'Guests', 'explore-katsina' ); ?></dt><dd><?php echo (int) $p['guests']; ?></dd>
			</dl>
			<table class="ek-table ek-nights">
				<tbody>
				<?php foreach ( $quote['nights'] as $date => $price ) : ?>
					<tr><td><?php echo esc_html( wp_date( 'D j M', strtotime( $date ) ) ); ?></td><td class="ek-num"><?php echo esc_html( Money::format( $price ) ); ?><?php echo $p['rooms'] > 1 ? ' × ' . (int) $p['rooms'] : ''; ?></td></tr>
				<?php endforeach; ?>
				</tbody>
				<tfoot><tr><th><?php esc_html_e( 'Total', 'explore-katsina' ); ?></th><th class="ek-num"><?php echo esc_html( Money::format( $quote['total'] ) ); ?></th></tr></tfoot>
			</table>
		</aside>
	</div>
	<?php endif; ?>
</div>
