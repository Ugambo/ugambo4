<?php
/**
 * Ticket purchase form on an event page.
 *
 * @var int    $id
 * @var array  $d
 * @var string $error
 * @var array  $v
 */
use EK\Money;
use EK\Tickets;

defined( 'ABSPATH' ) || exit;
$types = Tickets::types( $id );
if ( ! $types ) {
	return;
}
$user = wp_get_current_user();
$any  = (bool) array_filter( $types, static fn( $t ) => Tickets::on_sale( $t, $id ) );
?>
<section class="ek ek-card ek-stack" id="tickets" aria-labelledby="tk-h">
	<h2 id="tk-h" style="margin:0"><?php esc_html_e( 'Tickets', 'explore-katsina' ); ?></h2>
	<?php if ( $error ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
	<form method="post" class="ek-stack">
		<input type="hidden" name="ek_action" value="buy_tickets"><input type="hidden" name="event_id" value="<?php echo (int) $id; ?>"><?php wp_nonce_field( 'ek_buy_tickets_' . $id, '_ek_nonce' ); ?>
		<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
		<?php foreach ( $types as $t ) : $left = Tickets::available( $t ); $ok = Tickets::on_sale( $t, $id ); ?>
			<div class="ek-ticket-row">
				<div><strong><?php echo esc_html( $t->name ); ?></strong><br><span class="ek-small ek-muted"><?php echo $ok ? esc_html( sprintf( /* translators: %d: left */ _n( '%d left', '%d left', $left, 'explore-katsina' ), $left ) ) : esc_html__( 'Not on sale', 'explore-katsina' ); ?></span></div>
				<div class="ek-num"><strong><?php echo (int) $t->price_kobo ? esc_html( Money::format( $t->price_kobo ) ) : esc_html__( 'Free', 'explore-katsina' ); ?></strong></div>
				<label class="ek-visually-hidden" for="tq-<?php echo (int) $t->id; ?>"><?php echo esc_html( $t->name ); ?></label>
				<select id="tq-<?php echo (int) $t->id; ?>" name="qty[<?php echo (int) $t->id; ?>]" <?php disabled( ! $ok ); ?>>
					<?php for ( $i = 0; $i <= min( Tickets::MAX_PER_ORDER, $left ); $i++ ) : ?><option value="<?php echo (int) $i; ?>" <?php selected( (int) ( $v['qty'][ $t->id ] ?? 0 ), $i ); ?>><?php echo (int) $i; ?></option><?php endfor; ?>
				</select>
			</div>
		<?php endforeach; ?>
		<?php if ( $any ) : ?>
			<div class="ek-grid ek-grid--2">
				<div class="ek-field ek-span-2"><label for="tk-name"><?php esc_html_e( 'Name on the tickets', 'explore-katsina' ); ?></label><input type="text" id="tk-name" name="guest_name" autocomplete="name" required value="<?php echo esc_attr( $v['guest_name'] ?? ( $user->exists() ? $user->display_name : '' ) ); ?>"></div>
				<div class="ek-field"><label for="tk-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="tk-email" name="guest_email" autocomplete="email" required value="<?php echo esc_attr( $v['guest_email'] ?? ( $user->exists() ? $user->user_email : '' ) ); ?>"></div>
				<div class="ek-field"><label for="tk-phone"><?php esc_html_e( 'Phone', 'explore-katsina' ); ?></label><input type="tel" id="tk-phone" name="guest_phone" autocomplete="tel" placeholder="0803 123 4567" required value="<?php echo esc_attr( $v['guest_phone'] ?? ( $user->exists() ? get_user_meta( $user->ID, '_ek_phone', true ) : '' ) ); ?>"></div>
			</div>
			<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Get tickets', 'explore-katsina' ); ?></button></div>
			<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Tickets are held for 15 minutes while you pay. Each ticket has its own QR code. Tickets are not refundable unless the event is cancelled.', 'explore-katsina' ); ?></p>
		<?php else : ?>
			<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Tickets are not on sale right now.', 'explore-katsina' ); ?></p>
		<?php endif; ?>
	</form>
</section>
