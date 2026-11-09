<?php
/**
 * Table reservation form.
 *
 * @var array  $r     Restaurant profile.
 * @var array  $src   Request values (date, time, party).
 * @var string $error
 * @var array  $v
 */
use EK\Money;
use EK\Payments;
use EK\Restaurant;
use EK\Slots;

defined( 'ABSPATH' ) || exit;

$date  = sanitize_text_field( $src['date'] ?? '' );
$time  = sanitize_text_field( $src['time'] ?? '' );
$party = absint( $src['party'] ?? 2 );
$slot  = Slots::check( $r['id'], $date, $time, $party );
$dep   = Restaurant::deposit_for( $r['id'], $party );
$user  = wp_get_current_user();
$back  = add_query_arg( array( 'date' => $date, 'party' => $party ), $r['url'] ) . '#reserve';
?>
<div class="ek ek-book">
	<p><a href="<?php echo esc_url( $back ); ?>">← <?php /* translators: %s: restaurant */ printf( esc_html__( 'Back to %s', 'explore-katsina' ), esc_html( $r['name'] ) ); ?></a></p>
	<h1><?php esc_html_e( 'Reserve a table', 'explore-katsina' ); ?></h1>
	<?php if ( $dep && 'test' === Payments::provider() ) : ?><p class="ek-notice ek-notice--warn"><?php esc_html_e( 'TEST SITE: the deposit uses a test payment screen. No real money is taken.', 'explore-katsina' ); ?></p><?php endif; ?>
	<?php if ( $error ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
	<?php if ( is_wp_error( $slot ) ) : ?>
		<div class="ek-empty"><strong><?php echo esc_html( $slot->get_error_message() ); ?></strong><a href="<?php echo esc_url( $back ); ?>"><?php esc_html_e( 'Choose another time', 'explore-katsina' ); ?></a></div>
	<?php else : ?>
	<div class="ek-book-layout">
		<form method="post" class="ek-card ek-stack" novalidate>
			<input type="hidden" name="ek_action" value="reserve_table">
			<?php wp_nonce_field( 'ek_reserve_table', '_ek_nonce' ); ?>
			<?php foreach ( array( 'reserve' => $r['id'], 'date' => $date, 'time' => $time, 'party' => $party ) as $k => $val ) : ?><input type="hidden" name="<?php echo esc_attr( $k ); ?>" value="<?php echo esc_attr( $val ); ?>"><?php endforeach; ?>
			<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
			<h2 style="margin:0"><?php esc_html_e( 'Your details', 'explore-katsina' ); ?></h2>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field ek-span-2"><label for="g-name"><?php esc_html_e( 'Name', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="text" id="g-name" name="guest_name" autocomplete="name" required value="<?php echo esc_attr( $v['guest_name'] ?? ( $user->exists() ? $user->display_name : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="email" id="g-email" name="guest_email" autocomplete="email" required value="<?php echo esc_attr( $v['guest_email'] ?? ( $user->exists() ? $user->user_email : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-phone"><?php esc_html_e( 'Phone (WhatsApp if possible)', 'explore-katsina' ); ?> <span class="ek-req">*</span></label><input type="tel" id="g-phone" name="guest_phone" autocomplete="tel" inputmode="tel" required placeholder="0803 123 4567" value="<?php echo esc_attr( $v['guest_phone'] ?? '' ); ?>"></div>
				<div class="ek-field ek-span-2"><label for="g-notes"><?php esc_html_e( 'Occasion or requests (optional)', 'explore-katsina' ); ?></label><textarea id="g-notes" name="notes" rows="3" maxlength="500" placeholder="<?php esc_attr_e( 'e.g. birthday, high chair, quiet table', 'explore-katsina' ); ?>"><?php echo esc_textarea( $v['notes'] ?? '' ); ?></textarea></div>
			</div>
			<?php if ( $dep ) : ?><p class="ek-notice ek-notice--info" style="margin:0"><?php /* translators: %s: amount */ printf( esc_html__( 'A deposit of %s is paid online now and deducted from your bill at the restaurant.', 'explore-katsina' ), '<strong>' . esc_html( Money::format( $dep ) ) . '</strong>' ); // phpcs:ignore ?></p><?php endif; ?>
			<button class="ek-btn ek-btn--block" type="submit"><?php echo $dep ? esc_html( sprintf( /* translators: %s: amount */ __( 'Reserve and pay %s deposit', 'explore-katsina' ), Money::format( $dep ) ) ) : esc_html__( 'Request reservation', 'explore-katsina' ); ?></button>
			<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'The restaurant confirms your table by email. Please arrive on time; tables may be given away after 15 minutes.', 'explore-katsina' ); ?></p>
		</form>
		<aside class="ek-card ek-stack ek-book-summary">
			<h2 style="margin:0"><?php echo esc_html( $r['name'] ); ?></h2>
			<dl class="ek-dl">
				<dt><?php esc_html_e( 'Date', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( wp_date( 'l j F Y', strtotime( $date ) ) ); ?></dd>
				<dt><?php esc_html_e( 'Time', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( $time ); ?></strong></dd>
				<dt><?php esc_html_e( 'People', 'explore-katsina' ); ?></dt><dd><?php echo (int) $party; ?></dd>
				<dt><?php esc_html_e( 'Address', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $r['address'] ); ?></dd>
			</dl>
		</aside>
	</div>
	<?php endif; ?>
</div>
