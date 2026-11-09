<?php
/**
 * Food order checkout (only reachable when ordering is switched on).
 *
 * @var array  $r
 * @var array  $src  Posted items etc.
 * @var string $error
 */
use EK\Menu;
use EK\Money;
use EK\Payments;
use EK\Restaurant;

defined( 'ABSPATH' ) || exit;

$s     = Restaurant::settings( $r['id'] );
$lines = array();
$sub   = 0;
foreach ( (array) ( $src['items'] ?? array() ) as $id => $qty ) {
	$qty  = min( 50, absint( $qty ) );
	$item = $qty ? Menu::item( absint( $id ), $r['id'] ) : null;
	if ( $item && $item->available ) {
		$lines[] = array( $item, $qty );
		$sub    += $item->price_kobo * $qty;
	}
}
$ful  = sanitize_key( $src['fulfilment'] ?? ( $s['order_pickup'] ? 'pickup' : 'delivery' ) );
$user = wp_get_current_user();
?>
<div class="ek ek-book">
	<p><a href="<?php echo esc_url( $r['url'] . '#menu' ); ?>">← <?php esc_html_e( 'Back to the menu', 'explore-katsina' ); ?></a></p>
	<h1><?php /* translators: %s: restaurant */ printf( esc_html__( 'Your order from %s', 'explore-katsina' ), esc_html( $r['name'] ) ); ?></h1>
	<?php if ( $error ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
	<?php if ( ! $lines ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No dishes chosen', 'explore-katsina' ); ?></strong><a href="<?php echo esc_url( $r['url'] . '#menu' ); ?>"><?php esc_html_e( 'Choose from the menu', 'explore-katsina' ); ?></a></div>
	<?php else : ?>
	<div class="ek-book-layout">
		<form method="post" class="ek-card ek-stack" novalidate>
			<input type="hidden" name="ek_action" value="place_order">
			<input type="hidden" name="order" value="<?php echo (int) $r['id']; ?>">
			<?php wp_nonce_field( 'ek_place_order', '_ek_nonce' ); ?>
			<?php foreach ( $lines as $l ) : ?><input type="hidden" name="items[<?php echo (int) $l[0]->id; ?>]" value="<?php echo (int) $l[1]; ?>"><?php endforeach; ?>
			<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
			<fieldset style="border:0;padding:0;margin:0"><legend class="ek-label"><?php esc_html_e( 'Pickup or delivery', 'explore-katsina' ); ?></legend>
				<div class="ek-choices">
					<?php if ( $s['order_pickup'] ) : ?><label class="ek-choice"><input type="radio" name="fulfilment" value="pickup" <?php checked( 'pickup', $ful ); ?>><span><strong><?php esc_html_e( 'Pickup', 'explore-katsina' ); ?></strong><br><span class="ek-small"><?php /* translators: %d: minutes */ printf( esc_html__( 'Ready in about %d minutes', 'explore-katsina' ), (int) $s['prep_minutes'] ); ?></span></span></label><?php endif; ?>
					<?php if ( $s['order_delivery'] ) : ?><label class="ek-choice"><input type="radio" name="fulfilment" value="delivery" <?php checked( 'delivery', $ful ); ?>><span><strong><?php esc_html_e( 'Delivery', 'explore-katsina' ); ?></strong><br><span class="ek-small"><?php /* translators: %s: fee */ printf( esc_html__( 'Delivery fee %s', 'explore-katsina' ), esc_html( Money::format( $s['delivery_fee'] ) ) ); ?></span></span></label><?php endif; ?>
				</div>
			</fieldset>
			<?php if ( $s['order_delivery'] ) : ?><div class="ek-field"><label for="o-addr"><?php esc_html_e( 'Delivery address (for delivery)', 'explore-katsina' ); ?></label><textarea id="o-addr" name="address" rows="2"><?php echo esc_textarea( $src['address'] ?? '' ); ?></textarea></div><?php endif; ?>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field ek-span-2"><label for="g-name"><?php esc_html_e( 'Name', 'explore-katsina' ); ?></label><input type="text" id="g-name" name="guest_name" required value="<?php echo esc_attr( $src['guest_name'] ?? ( $user->exists() ? $user->display_name : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="g-email" name="guest_email" required value="<?php echo esc_attr( $src['guest_email'] ?? ( $user->exists() ? $user->user_email : '' ) ); ?>"></div>
				<div class="ek-field"><label for="g-phone"><?php esc_html_e( 'Phone', 'explore-katsina' ); ?></label><input type="tel" id="g-phone" name="guest_phone" required value="<?php echo esc_attr( $src['guest_phone'] ?? ( $user->exists() ? get_user_meta( $user->ID, '_ek_phone', true ) : '' ) ); ?>"></div>
				<div class="ek-field ek-span-2"><label for="g-notes"><?php esc_html_e( 'Notes (optional)', 'explore-katsina' ); ?></label><input type="text" id="g-notes" name="notes" maxlength="300" value="<?php echo esc_attr( $src['notes'] ?? '' ); ?>"></div>
			</div>
			<fieldset style="border:0;padding:0;margin:0"><legend class="ek-label"><?php esc_html_e( 'Payment', 'explore-katsina' ); ?></legend>
				<div class="ek-choices">
					<?php if ( $s['order_pay_online'] && Payments::online_available() ) : ?><label class="ek-choice"><input type="radio" name="pay" value="online" checked><span><?php esc_html_e( 'Pay online now', 'explore-katsina' ); ?></span></label><?php endif; ?>
					<?php if ( $s['order_pay_cash'] ) : ?><label class="ek-choice"><input type="radio" name="pay" value="cash" <?php checked( ! ( $s['order_pay_online'] && Payments::online_available() ) ); ?>><span><?php esc_html_e( 'Pay on pickup / delivery', 'explore-katsina' ); ?></span></label><?php endif; ?>
				</div>
			</fieldset>
			<button class="ek-btn ek-btn--block" type="submit"><?php esc_html_e( 'Place order', 'explore-katsina' ); ?></button>
		</form>
		<aside class="ek-card ek-stack ek-book-summary">
			<h2 style="margin:0"><?php esc_html_e( 'Your order', 'explore-katsina' ); ?></h2>
			<table class="ek-table ek-nights"><tbody>
				<?php foreach ( $lines as $l ) : ?><tr><td><?php echo (int) $l[1]; ?> × <?php echo esc_html( $l[0]->name ); ?></td><td class="ek-num"><?php echo esc_html( Money::format( $l[0]->price_kobo * $l[1] ) ); ?></td></tr><?php endforeach; ?>
			</tbody><tfoot><tr><th><?php esc_html_e( 'Subtotal', 'explore-katsina' ); ?></th><th class="ek-num"><?php echo esc_html( Money::format( $sub ) ); ?></th></tr></tfoot></table>
			<?php if ( $s['min_order'] && $sub < $s['min_order'] ) : ?><p class="ek-notice ek-notice--warn" style="margin:0"><?php /* translators: %s: amount */ printf( esc_html__( 'Minimum order is %s.', 'explore-katsina' ), esc_html( Money::format( $s['min_order'] ) ) ); ?></p><?php endif; ?>
		</aside>
	</div>
	<?php endif; ?>
</div>
