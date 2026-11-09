<?php
/**
 * Admin: review moderation. Hide fake or abusive reviews (with a reason, kept in the log).
 */
use EK\Log;
use EK\Reviews;
use EK\View;

defined( 'ABSPATH' ) || exit;
$status = sanitize_key( $_GET['status'] ?? '' ); // phpcs:ignore
$search = sanitize_text_field( wp_unslash( $_GET['s'] ?? '' ) ); // phpcs:ignore
$rows   = Reviews::admin_list( $status, $search );
?>
<h1><?php esc_html_e( 'Reviews', 'explore-katsina' ); ?></h1>
<?php include __DIR__ . '/_msg.php'; ?>
<p><?php esc_html_e( 'Every review comes from a completed booking. If one is fake, abusive or about something else, hide it: it stops counting for ratings and rankings, and the reason is kept in the moderation log below. You can show it again later.', 'explore-katsina' ); ?></p>
<form method="get" style="margin:10px 0">
	<input type="hidden" name="page" value="ek-reviews">
	<select name="status"><option value=""><?php esc_html_e( 'All', 'explore-katsina' ); ?></option><option value="published" <?php selected( $status, 'published' ); ?>><?php esc_html_e( 'Visible', 'explore-katsina' ); ?></option><option value="hidden" <?php selected( $status, 'hidden' ); ?>><?php esc_html_e( 'Hidden', 'explore-katsina' ); ?></option></select>
	<input type="search" name="s" value="<?php echo esc_attr( $search ); ?>" placeholder="<?php esc_attr_e( 'Search text, name or business', 'explore-katsina' ); ?>">
	<button class="button"><?php esc_html_e( 'Filter', 'explore-katsina' ); ?></button>
</form>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th style="width:18%"><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Review', 'explore-katsina' ); ?></th><th style="width:12%"><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th style="width:28%"><?php esc_html_e( 'Action', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php if ( ! $rows ) : ?><tr><td colspan="4"><?php esc_html_e( 'No reviews found.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php foreach ( $rows as $r ) : ?>
		<tr>
			<td><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $r->business_id ) ); ?>"><?php echo esc_html( $r->business ); ?></a></td>
			<td><strong><?php echo esc_html( str_repeat( '★', (int) $r->rating_overall ) . str_repeat( '☆', 5 - (int) $r->rating_overall ) ); ?> <?php echo esc_html( $r->title ); ?></strong><br><?php echo esc_html( $r->body ); ?><br><span class="description"><?php echo esc_html( $r->author_name . ' · ' . View::date( $r->created_at ) . ' · #' . $r->id ); ?></span>
				<?php if ( $r->owner_reply ) : ?><br><em><?php esc_html_e( 'Owner:', 'explore-katsina' ); ?> <?php echo esc_html( $r->owner_reply ); ?></em><?php endif; ?></td>
			<td><?php echo 'hidden' === $r->status ? '<strong style="color:#b32d2e">' . esc_html__( 'Hidden', 'explore-katsina' ) . '</strong><br><span class="description">' . esc_html( $r->hidden_reason ) . '</span>' : esc_html__( 'Visible', 'explore-katsina' ); ?></td>
			<td>
				<form method="post">
					<?php if ( 'hidden' === $r->status ) : ?>
						<?php wp_nonce_field( 'ek_admin_review_restore_' . $r->id ); ?><input type="hidden" name="ek_admin_action" value="review_restore"><input type="hidden" name="review_id" value="<?php echo (int) $r->id; ?>"><button class="button"><?php esc_html_e( 'Show again', 'explore-katsina' ); ?></button>
					<?php else : ?>
						<?php wp_nonce_field( 'ek_admin_review_hide_' . $r->id ); ?><input type="hidden" name="ek_admin_action" value="review_hide"><input type="hidden" name="review_id" value="<?php echo (int) $r->id; ?>">
						<select name="reason" required><option value=""><?php esc_html_e( 'Reason…', 'explore-katsina' ); ?></option><option><?php esc_html_e( 'Fake or written by the business/competitor', 'explore-katsina' ); ?></option><option><?php esc_html_e( 'Abusive, hateful or threatening language', 'explore-katsina' ); ?></option><option><?php esc_html_e( 'Personal information (phone, address, names)', 'explore-katsina' ); ?></option><option><?php esc_html_e( 'Not about this business or stay', 'explore-katsina' ); ?></option><option><?php esc_html_e( 'Spam or advertising', 'explore-katsina' ); ?></option></select>
						<button class="button button-link-delete"><?php esc_html_e( 'Hide', 'explore-katsina' ); ?></button>
					<?php endif; ?>
				</form>
			</td>
		</tr>
	<?php endforeach; ?>
	</tbody>
</table>
<form method="post" style="margin-top:12px"><?php wp_nonce_field( 'ek_admin_rankings_run' ); ?><input type="hidden" name="ek_admin_action" value="rankings_run"><input type="hidden" name="back" value="ek-reviews"><button class="button"><?php esc_html_e( 'Recalculate rankings now', 'explore-katsina' ); ?></button></form>
<h2><?php esc_html_e( 'Moderation log', 'explore-katsina' ); ?></h2>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'When', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'What', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'By', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php
	global $wpdb;
	$log = $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}ek_log WHERE action IN ('review_hidden','review_restored') ORDER BY id DESC LIMIT 50" );
	if ( ! $log ) :
		?>
		<tr><td colspan="4"><?php esc_html_e( 'Nothing hidden yet.', 'explore-katsina' ); ?></td></tr>
	<?php endif; ?>
	<?php foreach ( $log as $l ) : $m = json_decode( (string) $l->meta, true ); $who = get_userdata( (int) $l->actor_id ); ?>
		<tr><td><?php echo esc_html( View::date( $l->created_at, true ) ); ?></td><td><?php echo esc_html( $l->reason ); ?><?php echo ! empty( $m['excerpt'] ) ? '<br><span class="description">“' . esc_html( $m['excerpt'] ) . '” (' . esc_html( $m['author'] ?? '' ) . ', ' . (int) ( $m['rating'] ?? 0 ) . '★)</span>' : ''; ?></td><td><?php echo esc_html( get_the_title( (int) $l->object_id ) ); ?></td><td><?php echo esc_html( $who ? $who->display_name : '' ); ?></td></tr>
	<?php endforeach; ?>
	</tbody>
</table>
