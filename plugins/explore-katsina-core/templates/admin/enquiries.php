<?php
/**
 * Admin: "Advertise with us" enquiries.
 */
use EK\Advertise;
use EK\View;

defined( 'ABSPATH' ) || exit;
?>
<h1><?php esc_html_e( 'Advertising enquiries', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'From', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Interested in', 'explore-katsina' ); ?></th><th style="width:40%"><?php esc_html_e( 'Message', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th></tr></thead><tbody>
<?php $rows = Advertise::list(); if ( ! $rows ) : ?><tr><td colspan="4"><?php esc_html_e( 'No enquiries yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
<?php foreach ( $rows as $r ) : ?>
	<tr><td><strong><?php echo esc_html( $r->name ); ?></strong><?php echo $r->company ? ' · ' . esc_html( $r->company ) : ''; ?><br><a href="mailto:<?php echo esc_attr( $r->email ); ?>"><?php echo esc_html( $r->email ); ?></a> <?php echo esc_html( $r->phone ); ?><br><span class="description"><?php echo esc_html( View::date( $r->created_at, true ) ); ?></span></td>
	<td><?php echo esc_html( Advertise::interests()[ $r->interest ] ?? $r->interest ); ?></td><td><?php echo nl2br( esc_html( $r->message ) ); ?></td>
	<td><form method="post"><?php wp_nonce_field( 'ek_admin_enquiry_status_' . $r->id ); ?><input type="hidden" name="ek_admin_action" value="enquiry_status"><input type="hidden" name="enquiry_id" value="<?php echo (int) $r->id; ?>"><select name="status" onchange="this.form.submit()"><?php foreach ( array( 'new' => __( 'New', 'explore-katsina' ), 'replied' => __( 'Replied', 'explore-katsina' ), 'won' => __( 'Became a customer', 'explore-katsina' ), 'closed' => __( 'Closed', 'explore-katsina' ) ) as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $r->status, $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></form></td></tr>
<?php endforeach; ?>
</tbody></table>
