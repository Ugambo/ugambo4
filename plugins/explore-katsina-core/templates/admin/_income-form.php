<?php
/**
 * Record money received outside the website (banner ads, partner commissions).
 */
use EK\Money;
use EK\Revenue;
use EK\View;

defined( 'ABSPATH' ) || exit;
?>
<h2><?php esc_html_e( 'Record money received', 'explore-katsina' ); ?></h2>
<form method="post" class="card" style="max-width:760px">
	<?php wp_nonce_field( 'ek_admin_income_record' ); ?><input type="hidden" name="ek_admin_action" value="income_record"><input type="hidden" name="back" value="<?php echo esc_attr( sanitize_key( $_GET['page'] ?? 'ek-revenue' ) ); // phpcs:ignore ?>">
	<p><select name="source"><option value="partner"><?php esc_html_e( 'Partner commission', 'explore-katsina' ); ?></option><option value="ads"><?php esc_html_e( 'Banner ads', 'explore-katsina' ); ?></option><option value="other"><?php esc_html_e( 'Other', 'explore-katsina' ); ?></option></select>
	₦ <input type="text" name="amount" inputmode="decimal" required style="width:9em"> <input type="date" name="received_on" value="<?php echo esc_attr( wp_date( 'Y-m-d' ) ); ?>" required>
	<input type="text" name="note" placeholder="<?php esc_attr_e( 'From whom / reference', 'explore-katsina' ); ?>" class="regular-text"> <button class="button button-primary"><?php esc_html_e( 'Record', 'explore-katsina' ); ?></button></p>
</form>
<table class="wp-list-table widefat fixed striped" style="max-width:760px"><thead><tr><th><?php esc_html_e( 'Received', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'For', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Note', 'explore-katsina' ); ?></th></tr></thead><tbody>
<?php $rows = Revenue::manual( 20 ); if ( ! $rows ) : ?><tr><td colspan="4"><?php esc_html_e( 'Nothing recorded yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
<?php foreach ( $rows as $r ) : ?><tr><td><?php echo esc_html( $r->received_on ); ?></td><td><?php echo esc_html( Revenue::sources()[ $r->source ] ?? $r->source ); ?></td><td><?php echo esc_html( Money::format( $r->amount_kobo ) ); ?></td><td><?php echo esc_html( $r->note ); ?></td></tr><?php endforeach; ?>
</tbody></table>
