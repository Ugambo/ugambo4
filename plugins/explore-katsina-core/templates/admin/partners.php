<?php
/**
 * Admin: partner referral links, clicks per month, commission received.
 */
use EK\Money;
use EK\Partners;
use EK\Revenue;

defined( 'ABSPATH' ) || exit;
$edit   = absint( $_GET['partner'] ?? 0 ); // phpcs:ignore
$rows   = Partners::all();
$p      = $edit ? current( array_filter( $rows, static fn( $r ) => (int) $r->id === $edit ) ) : null;
$clicks = Partners::clicks_by_month( 6 );
$months = Revenue::months( 6 );
?>
<h1><?php esc_html_e( 'Partners (referral links)', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'Links to airlines, bus companies and car hire go through /go/short-name/ so every click is counted. Send partners the monthly click report when you claim your commission, then record what they pay you.', 'explore-katsina' ); ?></p>
<div class="card" style="max-width:760px">
	<h2><?php echo $p ? esc_html__( 'Edit partner', 'explore-katsina' ) : esc_html__( 'Add a partner', 'explore-katsina' ); ?></h2>
	<form method="post">
		<?php wp_nonce_field( 'ek_admin_partner_save' ); ?><input type="hidden" name="ek_admin_action" value="partner_save"><input type="hidden" name="partner_id" value="<?php echo (int) $edit; ?>">
		<table class="form-table" role="presentation">
			<tr><th><label for="pa-name"><?php esc_html_e( 'Name', 'explore-katsina' ); ?></label></th><td><input type="text" id="pa-name" name="name" class="regular-text" required value="<?php echo esc_attr( $p->name ?? '' ); ?>"></td></tr>
			<tr><th><label for="pa-slug"><?php esc_html_e( 'Short name (for /go/…)', 'explore-katsina' ); ?></label></th><td><input type="text" id="pa-slug" name="slug" value="<?php echo esc_attr( $p->slug ?? '' ); ?>" placeholder="e.g. bus-company"></td></tr>
			<tr><th><label for="pa-cat"><?php esc_html_e( 'Type', 'explore-katsina' ); ?></label></th><td><select id="pa-cat" name="category"><?php foreach ( Partners::categories() as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $p->category ?? '', $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></td></tr>
			<tr><th><label for="pa-url"><?php esc_html_e( 'Their link (with your referral code)', 'explore-katsina' ); ?></label></th><td><input type="url" id="pa-url" name="url" class="large-text" required placeholder="https://" value="<?php echo esc_attr( $p->url ?? '' ); ?>"></td></tr>
			<tr><th><label for="pa-note"><?php esc_html_e( 'Commission agreed', 'explore-katsina' ); ?></label></th><td><input type="text" id="pa-note" name="commission_note" class="regular-text" value="<?php echo esc_attr( $p->commission_note ?? '' ); ?>" placeholder="<?php esc_attr_e( 'e.g. 3% of tickets, paid monthly', 'explore-katsina' ); ?>"></td></tr>
			<tr><th><?php esc_html_e( 'Active', 'explore-katsina' ); ?></th><td><label><input type="checkbox" name="active" value="1" <?php checked( ! $p || $p->active ); ?>> <?php esc_html_e( 'Link works', 'explore-katsina' ); ?></label></td></tr>
		</table>
		<?php submit_button( $p ? __( 'Save partner', 'explore-katsina' ) : __( 'Add partner', 'explore-katsina' ) ); ?>
	</form>
</div>
<h2><?php esc_html_e( 'Clicks per month', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'Partner', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Link to use', 'explore-katsina' ); ?></th><?php foreach ( $months as $m ) : ?><th><?php echo esc_html( wp_date( 'M Y', strtotime( $m . '-15' ) ) ); ?></th><?php endforeach; ?></tr></thead><tbody>
<?php if ( ! $rows ) : ?><tr><td colspan="<?php echo 2 + count( $months ); ?>"><?php esc_html_e( 'No partners yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
<?php foreach ( $rows as $r ) : ?>
	<tr><td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-partners&partner=' . (int) $r->id ) ); ?>"><strong><?php echo esc_html( $r->name ); ?></strong></a><?php echo $r->active ? '' : ' (' . esc_html__( 'off', 'explore-katsina' ) . ')'; ?><br><span class="description"><?php echo esc_html( $r->commission_note ); ?></span></td><td><code><?php echo esc_html( Partners::link( $r->slug ) ); ?></code><br><code>[ek_partner slug="<?php echo esc_html( $r->slug ); ?>"]</code></td><?php foreach ( $months as $m ) : ?><td><?php echo (int) ( $clicks[ (int) $r->id ][ $m ] ?? 0 ); ?></td><?php endforeach; ?></tr>
<?php endforeach; ?>
</tbody></table>
<p><?php foreach ( array_slice( $months, -2 ) as $m ) : ?><a class="button" href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin.php?page=ek-partners&ek_partner_csv=' . $m ), 'ek_partner_csv' ) ); ?>"><?php /* translators: %s: month */ printf( esc_html__( 'Download clicks for %s (CSV)', 'explore-katsina' ), esc_html( wp_date( 'F Y', strtotime( $m . '-15' ) ) ) ); ?></a> <?php endforeach; ?></p>
<?php include __DIR__ . '/_income-form.php'; ?>
