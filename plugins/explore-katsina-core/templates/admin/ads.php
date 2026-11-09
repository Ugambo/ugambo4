<?php
/**
 * Admin: banner ads + AdSense status.
 */
use EK\Ads;
use EK\Settings;

defined( 'ABSPATH' ) || exit;
$edit = absint( $_GET['ad'] ?? 0 ); // phpcs:ignore
$ad   = $edit ? Ads::get( $edit ) : null;
wp_enqueue_media();
?>
<h1><?php esc_html_e( 'Banner ads', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'Add an advertiser\'s banner to a zone with start and end dates. If several ads share a zone they take turns. Views and clicks are counted every day. Ads are always labelled "Advertisement" and their links marked as sponsored.', 'explore-katsina' ); ?></p>
<p class="description"><?php esc_html_e( 'Zones: Homepage ([ek_ad zone="home"], placed in Phase 11), Search results (above the results), Katsina Map (in the list panel), Sidebar ([ek_ad zone="sidebar"]), Inside articles (after the second paragraph). Suggested image sizes: 1200×300 (wide zones) or 600×500 (sidebar/map).', 'explore-katsina' ); ?></p>
<div class="card" style="max-width:760px">
	<h2><?php echo $ad ? esc_html__( 'Edit ad', 'explore-katsina' ) : esc_html__( 'Add an ad', 'explore-katsina' ); ?></h2>
	<form method="post">
		<?php wp_nonce_field( 'ek_admin_ad_save' ); ?><input type="hidden" name="ek_admin_action" value="ad_save"><input type="hidden" name="ad_id" value="<?php echo (int) $edit; ?>">
		<table class="form-table" role="presentation">
			<tr><th><label for="ad-title"><?php esc_html_e( 'Name', 'explore-katsina' ); ?></label></th><td><input type="text" id="ad-title" name="title" class="regular-text" required value="<?php echo esc_attr( $ad->title ?? '' ); ?>"></td></tr>
			<tr><th><label for="ad-adv"><?php esc_html_e( 'Advertiser', 'explore-katsina' ); ?></label></th><td><input type="text" id="ad-adv" name="advertiser" class="regular-text" value="<?php echo esc_attr( $ad->advertiser ?? '' ); ?>"></td></tr>
			<tr><th><label for="ad-zone"><?php esc_html_e( 'Zone', 'explore-katsina' ); ?></label></th><td><select id="ad-zone" name="zone"><?php foreach ( Ads::zones() as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $ad->zone ?? '', $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></td></tr>
			<tr><th><?php esc_html_e( 'Image', 'explore-katsina' ); ?></th><td><input type="hidden" name="image_id" id="ad-img" value="<?php echo (int) ( $ad->image_id ?? 0 ); ?>"><span id="ad-img-prev"><?php echo ! empty( $ad->image_id ) ? wp_get_attachment_image( (int) $ad->image_id, 'medium' ) : ''; // phpcs:ignore ?></span><br><button type="button" class="button" id="ad-img-btn"><?php esc_html_e( 'Choose image', 'explore-katsina' ); ?></button></td></tr>
			<tr><th><label for="ad-alt"><?php esc_html_e( 'Image description (for blind visitors)', 'explore-katsina' ); ?></label></th><td><input type="text" id="ad-alt" name="alt_text" class="regular-text" value="<?php echo esc_attr( $ad->alt_text ?? '' ); ?>"></td></tr>
			<tr><th><label for="ad-url"><?php esc_html_e( 'Link', 'explore-katsina' ); ?></label></th><td><input type="url" id="ad-url" name="link_url" class="regular-text" required placeholder="https://" value="<?php echo esc_attr( $ad->link_url ?? '' ); ?>"></td></tr>
			<tr><th><?php esc_html_e( 'Dates', 'explore-katsina' ); ?></th><td><input type="date" name="starts_on" value="<?php echo esc_attr( $ad->starts_on ?? '' ); ?>"> – <input type="date" name="ends_on" value="<?php echo esc_attr( $ad->ends_on ?? '' ); ?>"> <span class="description"><?php esc_html_e( 'Empty = no limit', 'explore-katsina' ); ?></span></td></tr>
			<tr><th><?php esc_html_e( 'Active', 'explore-katsina' ); ?></th><td><label><input type="checkbox" name="active" value="1" <?php checked( ! $ad || $ad->active ); ?>> <?php esc_html_e( 'Show this ad', 'explore-katsina' ); ?></label></td></tr>
			<tr><th><label for="ad-paid"><?php esc_html_e( 'Payment received (₦, optional)', 'explore-katsina' ); ?></label></th><td><input type="text" id="ad-paid" name="paid" inputmode="decimal"> <input type="date" name="paid_on" value="<?php echo esc_attr( wp_date( 'Y-m-d' ) ); ?>"> <span class="description"><?php esc_html_e( 'Recorded in the revenue dashboard.', 'explore-katsina' ); ?></span></td></tr>
		</table>
		<?php submit_button( $ad ? __( 'Save ad', 'explore-katsina' ) : __( 'Add ad', 'explore-katsina' ) ); ?>
	</form>
</div>
<script>
jQuery( function ( $ ) {
	$( '#ad-img-btn' ).on( 'click', function () {
		var f = wp.media( { title: <?php echo wp_json_encode( __( 'Choose banner image', 'explore-katsina' ) ); ?>, library: { type: 'image' }, multiple: false } );
		f.on( 'select', function () { var a = f.state().get( 'selection' ).first().toJSON(); $( '#ad-img' ).val( a.id ); $( '#ad-img-prev' ).html( $( '<img>' ).attr( 'src', ( a.sizes && a.sizes.medium ? a.sizes.medium.url : a.url ) ).css( 'max-width', '300px' ) ); } );
		f.open();
	} );
} );
</script>
<h2><?php esc_html_e( 'All ads', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'Ad', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Zone', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Dates', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Views', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Clicks', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Click rate', 'explore-katsina' ); ?></th></tr></thead><tbody>
<?php $rows = Ads::all(); if ( ! $rows ) : ?><tr><td colspan="6"><?php esc_html_e( 'No ads yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
<?php foreach ( $rows as $a ) : $st = Ads::stats( $a->id ); ?>
	<tr><td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-ads&ad=' . (int) $a->id ) ); ?>"><strong><?php echo esc_html( $a->title ); ?></strong></a><?php echo $a->active ? '' : ' <span class="description">(' . esc_html__( 'off', 'explore-katsina' ) . ')</span>'; ?><br><span class="description"><?php echo esc_html( $a->advertiser ); ?></span></td><td><?php echo esc_html( Ads::zones()[ $a->zone ] ?? $a->zone ); ?></td><td><?php echo esc_html( ( $a->starts_on ? $a->starts_on : '…' ) . ' – ' . ( $a->ends_on ? $a->ends_on : '…' ) ); ?></td><td><?php echo (int) $st->views; ?></td><td><?php echo (int) $st->clicks; ?></td><td><?php echo (int) $st->views ? esc_html( round( 100 * $st->clicks / $st->views, 1 ) . '%' ) : '—'; ?></td></tr>
<?php endforeach; ?>
</tbody></table>
<h2><?php esc_html_e( 'Google AdSense', 'explore-katsina' ); ?></h2>
<p><?php echo Ads::adsense_on() ? '✅ ' . esc_html__( 'On. Zones without a booked banner show your AdSense units.', 'explore-katsina' ) : esc_html__( 'Off. Add your AdSense publisher ID and slot numbers in Settings → Advertising to switch it on.', 'explore-katsina' ); ?></p>
