<?php
/**
 * Online orders (only shown when food ordering is switched on site-wide).
 *
 * @var array $b
 */
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Money;
use EK\Restaurant;
use EK\Restaurant_Dashboard;
use EK\View;

defined( 'ABSPATH' ) || exit;

if ( ! Restaurant::ordering_on_sitewide() ) {
	echo '<div class="ek-empty"><strong>' . esc_html__( 'Online ordering is not available yet.', 'explore-katsina' ) . '</strong></div>';
	return;
}
$errors = 'ordering' === Restaurant_Dashboard::$group ? Restaurant_Dashboard::$errors : array();
$s      = $errors ? Restaurant::validate( 'ordering', Restaurant_Dashboard::$values, Restaurant::settings( $b['id'] ) )[0] : Restaurant::settings( $b['id'] );
global $wpdb;
$orders = $wpdb->get_results( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_bookings WHERE business_id = %d AND kind = 'order' AND status IN ('new','accepted','preparing','ready','out_for_delivery','completed','declined','cancelled') ORDER BY FIELD(status,'new','accepted','preparing','ready','out_for_delivery') DESC, id DESC LIMIT 60", $b['id'] ) );
?>
<section class="ek-stack" aria-labelledby="o-list">
	<h2 id="o-list" style="margin:0"><?php esc_html_e( 'Orders', 'explore-katsina' ); ?></h2>
	<?php if ( ! $orders ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No orders yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Switch on online ordering below, then new orders appear here.', 'explore-katsina' ); ?></div>
	<?php endif; ?>
	<?php
	foreach ( $orders as $row ) :
		$o = Booking::get( $row->id );
		$d = $o->details;
		?>
		<article class="ek-card ek-booking">
			<div class="ek-row ek-row--between"><h3 style="margin:0"><?php echo esc_html( $o->code . ' · ' . $o->customer_name ); ?></h3><span class="ek-pill ek-status-<?php echo esc_attr( $o->status ); ?>"><?php echo esc_html( Dashboard::booking_status_label( $o->status ) ); ?></span></div>
			<ul class="ek-small" style="margin:0;padding-left:1.1em"><?php foreach ( (array) ( $d['items'] ?? array() ) as $i ) : ?><li><?php echo (int) $i['qty']; ?> × <?php echo esc_html( $i['name'] ); ?></li><?php endforeach; ?></ul>
			<dl class="ek-dl">
				<dt><?php esc_html_e( 'Type', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['title'] ?? '' ); ?><?php echo 'delivery' === ( $d['fulfilment'] ?? '' ) ? ': ' . esc_html( $d['address'] ?? '' ) : ''; ?></dd>
				<dt><?php esc_html_e( 'Total', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( Money::format( $o->total_kobo ) ); ?> · <?php echo 'cash' === $o->payment_mode ? esc_html__( 'collect payment', 'explore-katsina' ) : esc_html__( 'paid online', 'explore-katsina' ); ?></dd>
				<dt><?php esc_html_e( 'Contact', 'explore-katsina' ); ?></dt><dd><a href="<?php echo esc_url( 'tel:' . $o->customer_phone ); ?>"><?php echo esc_html( Business::display_phone( $o->customer_phone ) ); ?></a></dd>
				<?php if ( $o->notes ) : ?><dt><?php esc_html_e( 'Notes', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $o->notes ); ?></dd><?php endif; ?>
			</dl>
			<div class="ek-row">
				<?php foreach ( Booking::actions( $o ) as $to => $label ) : ?>
					<form method="post"><?php echo Dashboard::nonce_fields( 'dash_booking', $b['id'] ); // phpcs:ignore ?><input type="hidden" name="booking_id" value="<?php echo (int) $o->id; ?>"><input type="hidden" name="to" value="<?php echo esc_attr( $to ); ?>"><input type="hidden" name="back" value="orders"><button class="ek-btn ek-btn--sm <?php echo in_array( $to, array( 'declined', 'cancelled' ), true ) ? 'ek-btn--ghost' : ''; ?>" type="submit"><?php echo esc_html( $label ); ?></button></form>
				<?php endforeach; ?>
			</div>
		</article>
	<?php endforeach; ?>
</section>

<form class="ek-card ek-stack" method="post" novalidate>
	<?php echo Dashboard::nonce_fields( 'dash_restaurant', $b['id'] ); // phpcs:ignore ?>
	<input type="hidden" name="group" value="ordering">
	<h2 style="margin:0"><?php esc_html_e( 'Online ordering settings', 'explore-katsina' ); ?></h2>
	<?php echo View::error( $errors, 'order' ); // phpcs:ignore ?>
	<label class="ek-check"><input type="checkbox" name="order_enabled" value="1" <?php checked( $s['order_enabled'] ); ?>> <strong><?php esc_html_e( 'Accept online orders', 'explore-katsina' ); ?></strong></label>
	<label class="ek-check"><input type="checkbox" name="order_pickup" value="1" <?php checked( $s['order_pickup'] ); ?>> <?php esc_html_e( 'Pickup', 'explore-katsina' ); ?></label>
	<label class="ek-check"><input type="checkbox" name="order_delivery" value="1" <?php checked( $s['order_delivery'] ); ?>> <?php esc_html_e( 'Delivery', 'explore-katsina' ); ?></label>
	<div class="ek-grid ek-grid--3">
		<div class="ek-field"><label for="o-fee"><?php esc_html_e( 'Delivery fee (₦)', 'explore-katsina' ); ?></label><input type="text" id="o-fee" name="delivery_fee" inputmode="numeric" value="<?php echo esc_attr( number_format( $s['delivery_fee'] / 100 ) ); ?>"></div>
		<div class="ek-field"><label for="o-min"><?php esc_html_e( 'Minimum order (₦)', 'explore-katsina' ); ?></label><input type="text" id="o-min" name="min_order" inputmode="numeric" value="<?php echo esc_attr( number_format( $s['min_order'] / 100 ) ); ?>"></div>
		<div class="ek-field"><label for="o-prep"><?php esc_html_e( 'Preparation time (minutes)', 'explore-katsina' ); ?></label><input type="number" id="o-prep" name="prep_minutes" min="5" max="240" value="<?php echo (int) $s['prep_minutes']; ?>"></div>
	</div>
	<label class="ek-check"><input type="checkbox" name="order_pay_online" value="1" <?php checked( $s['order_pay_online'] ); ?>> <?php esc_html_e( 'Customers can pay online', 'explore-katsina' ); ?></label>
	<label class="ek-check"><input type="checkbox" name="order_pay_cash" value="1" <?php checked( $s['order_pay_cash'] ); ?>> <?php esc_html_e( 'Customers can pay on pickup / delivery', 'explore-katsina' ); ?></label>
	<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save ordering settings', 'explore-katsina' ); ?></button></div>
</form>
