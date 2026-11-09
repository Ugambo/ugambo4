<?php
/**
 * Admin: direct sales and the paid services waiting for you.
 */
use EK\Events;
use EK\Money;
use EK\Sales;
use EK\View;

defined( 'ABSPATH' ) || exit;
$tab  = sanitize_key( $_GET['tab'] ?? 'todo' ); // phpcs:ignore
$tabs = array( 'todo' => __( 'Waiting for you', 'explore-katsina' ), 'all' => __( 'All sales', 'explore-katsina' ) );
$form = static function ( $action, $s, $label, $class = 'button', $extra = '' ) {
	echo '<form method="post" style="margin:0 0 6px">';
	wp_nonce_field( 'ek_admin_' . $action . '_' . $s->id );
	echo '<input type="hidden" name="ek_admin_action" value="' . esc_attr( $action ) . '"><input type="hidden" name="sale_id" value="' . (int) $s->id . '">' . $extra; // phpcs:ignore
	echo ' <button class="' . esc_attr( $class ) . '">' . esc_html( $label ) . '</button></form>';
};
$who = static fn( $s ) => esc_html( $s->customer_name ) . '<br><span class="description">' . esc_html( $s->customer_email . ' · ' . $s->customer_phone ) . '</span>';
?>
<h1><?php esc_html_e( 'Sales & paid services', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<nav class="nav-tab-wrapper"><?php foreach ( $tabs as $k => $label ) : ?><a class="nav-tab<?php echo $k === $tab ? ' nav-tab-active' : ''; ?>" href="<?php echo esc_url( admin_url( 'admin.php?page=ek-sales&tab=' . $k ) ); ?>"><?php echo esc_html( $label ); ?></a><?php endforeach; ?></nav>
<?php if ( 'todo' === $tab ) : ?>
	<h2><?php esc_html_e( 'Verified badge applications', 'explore-katsina' ); ?></h2>
	<p class="description"><?php esc_html_e( 'Check the business\'s ID, CAC (if any) and that it really is at its map pin, then approve or reject.', 'explore-katsina' ); ?></p>
	<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Paid', 'explore-katsina' ); ?></th><th style="width:45%"><?php esc_html_e( 'Decision', 'explore-katsina' ); ?></th></tr></thead><tbody>
	<?php $rows = array_filter( Sales::list( 'verified', 'paid' ), static fn( $s ) => in_array( $s->stage, array( '', 'submitted' ), true ) ); if ( ! $rows ) : ?><tr><td colspan="3"><?php esc_html_e( 'Nothing waiting.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $s ) : ?>
		<tr><td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $s->object_id ) ); ?>"><strong><?php echo esc_html( get_the_title( $s->object_id ) ); ?></strong></a><br><span class="description"><?php echo esc_html( $s->code ); ?></span></td><td><?php echo esc_html( Money::format( $s->amount_kobo ) . ' · ' . View::date( $s->paid_at ) ); ?></td>
		<td><?php $form( 'verified_approve', $s, __( 'Approve: give the Verified badge', 'explore-katsina' ), 'button button-primary' ); $form( 'verified_reject', $s, __( 'Reject', 'explore-katsina' ), 'button', '<input type="text" name="note" placeholder="' . esc_attr__( 'Reason (sent to the business)', 'explore-katsina' ) . '" required> <label><input type="checkbox" name="refund" value="1"> ' . esc_html__( 'Refund the fee', 'explore-katsina' ) . '</label>' ); ?></td></tr>
	<?php endforeach; ?>
	</tbody></table>

	<h2><?php esc_html_e( 'Listing setup orders', 'explore-katsina' ); ?></h2>
	<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'Order', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Customer', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Details', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Progress', 'explore-katsina' ); ?></th></tr></thead><tbody>
	<?php $rows = array_filter( Sales::list( 'setup', 'paid' ), static fn( $s ) => 'done' !== $s->stage ); if ( ! $rows ) : ?><tr><td colspan="4"><?php esc_html_e( 'Nothing waiting.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $s ) : $d = $s->details; ?>
		<tr><td><strong><?php echo esc_html( $d['business'] ?? '' ); ?></strong><br><?php echo esc_html( $s->code . ' · ' . Money::format( $s->amount_kobo ) ); ?></td><td><?php echo $who( $s ); // phpcs:ignore ?></td>
		<td><?php echo esc_html( ( \EK\Business::types()[ $d['type'] ?? '' ]['label'] ?? '' ) . ' · ' . ( $d['lga'] ?? '' ) . ( ! empty( $d['address'] ) ? ' · ' . $d['address'] : '' ) ); ?><br><span class="description"><?php echo esc_html( $d['notes'] ?? '' ); ?></span></td>
		<td><strong><?php echo esc_html( 'in_progress' === $s->stage ? __( 'In progress', 'explore-katsina' ) : __( 'New', 'explore-katsina' ) ); ?></strong><?php
			if ( 'in_progress' !== $s->stage ) {
				$form( 'setup_stage', $s, __( 'Mark in progress', 'explore-katsina' ), 'button', '<input type="hidden" name="stage" value="in_progress">' );
			}
			$form( 'setup_stage', $s, __( 'Mark done', 'explore-katsina' ), 'button button-primary', '<input type="hidden" name="stage" value="done"><input type="text" name="note" placeholder="' . esc_attr__( 'Note (e.g. listing link)', 'explore-katsina' ) . '">' );
		?></td></tr>
	<?php endforeach; ?>
	</tbody></table>

	<h2><?php esc_html_e( 'Event promotions to approve', 'explore-katsina' ); ?></h2>
	<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'Event', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Organiser', 'explore-katsina' ); ?></th><th style="width:40%"><?php esc_html_e( 'Decision', 'explore-katsina' ); ?></th></tr></thead><tbody>
	<?php $rows = array_filter( Sales::list( 'promotion', 'paid' ), static fn( $s ) => 'submitted' === $s->stage ); if ( ! $rows ) : ?><tr><td colspan="3"><?php esc_html_e( 'Nothing waiting.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $s ) : $n = $s->details['new'] ?? null; ?>
		<tr><td><strong><?php echo esc_html( $s->details['title'] ?? '' ); ?></strong><br><?php if ( $s->object_id ) : ?><a href="<?php echo esc_url( get_edit_post_link( $s->object_id ) ); ?>"><?php esc_html_e( 'Existing event', 'explore-katsina' ); ?></a><?php else : ?><span class="description"><?php echo esc_html( ( $n['date'] ? $n['date'] : __( 'Date TBC', 'explore-katsina' ) ) . ' · ' . $n['venue'] ); ?></span><br><?php echo esc_html( $n['about'] ); ?><?php endif; ?></td><td><?php echo $who( $s ); // phpcs:ignore ?></td>
		<td><?php $form( 'promo_approve', $s, __( 'Approve and start promotion', 'explore-katsina' ), 'button button-primary' ); $form( 'promo_reject', $s, __( 'Reject and refund', 'explore-katsina' ), 'button', '<input type="text" name="note" placeholder="' . esc_attr__( 'Reason', 'explore-katsina' ) . '" required>' ); ?></td></tr>
	<?php endforeach; ?>
	</tbody></table>
	<p class="description"><?php esc_html_e( 'Approving a new event creates it in Events (published). Add photos and ticket types there if needed.', 'explore-katsina' ); ?></p>
<?php else : ?>
	<table class="wp-list-table widefat fixed striped"><thead><tr><th><?php esc_html_e( 'Order', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'What', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Customer', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Action', 'explore-katsina' ); ?></th></tr></thead><tbody>
	<?php $rows = Sales::list( '', '', 200 ); if ( ! $rows ) : ?><tr><td colspan="6"><?php esc_html_e( 'No sales yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $s ) : ?>
		<tr><td><a href="<?php echo esc_url( Sales::link( $s ) ); ?>" target="_blank"><?php echo esc_html( $s->code ); ?></a><br><span class="description"><?php echo esc_html( View::date( $s->created_at, true ) ); ?></span></td>
		<td><?php echo esc_html( ( Sales::kinds()[ $s->kind ] ?? $s->kind ) ); ?><br><span class="description"><?php echo esc_html( $s->details['title'] ?? '' ); ?></span></td><td><?php echo $who( $s ); // phpcs:ignore ?></td>
		<td><?php echo esc_html( Money::format( $s->amount_kobo ) ); ?><?php echo ! empty( $s->details['refund'] ) ? '<br><span class="description">' . esc_html( sprintf( /* translators: 1: amount, 2: status */ __( 'Refund %1$s (%2$s)', 'explore-katsina' ), Money::format( $s->details['refund']['amount'] ), $s->details['refund']['status'] ) ) . '</span>' : ''; ?></td>
		<td><?php echo esc_html( $s->status . ( $s->stage ? ' · ' . $s->stage : '' ) ); ?></td>
		<td><?php if ( 'paid' === $s->status ) { $form( 'sale_cancel', $s, __( 'Cancel and refund', 'explore-katsina' ), 'button-link button-link-delete', '<input type="text" name="note" placeholder="' . esc_attr__( 'Reason', 'explore-katsina' ) . '" required>' ); } ?></td></tr>
	<?php endforeach; ?>
	</tbody></table>
<?php endif; ?>
