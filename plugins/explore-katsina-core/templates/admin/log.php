<?php
/**
 * Admin: activity log.
 */
use EK\Log;
use EK\View;

defined( 'ABSPATH' ) || exit;

$page   = max( 1, absint( $_GET['paged'] ?? 1 ) ); // phpcs:ignore
$rows   = Log::recent( 100, ( $page - 1 ) * 100 );
?>
<h1><?php esc_html_e( 'Activity log', 'explore-katsina' ); ?></h1>
<p><?php esc_html_e( 'Every approval, rejection, pause, verification, bank change, ID view and (later) every hidden review, with who did it and why.', 'explore-katsina' ); ?></p>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th style="width:170px"><?php esc_html_e( 'When', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'What', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'By', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Reason / details', 'explore-katsina' ); ?></th></tr></thead>
	<tbody>
	<?php if ( ! $rows ) : ?><tr><td colspan="5"><?php esc_html_e( 'Nothing logged yet.', 'explore-katsina' ); ?></td></tr><?php endif; ?>
	<?php
	foreach ( $rows as $l ) :
		$actor = $l->actor_id ? get_userdata( (int) $l->actor_id ) : null;
		$title = 'business' === $l->object_type ? get_the_title( (int) $l->object_id ) : '';
		$meta  = $l->meta ? json_decode( $l->meta, true ) : array();
		?>
		<tr>
			<td><?php echo esc_html( View::date( $l->created_at, true ) ); ?></td>
			<td><?php echo esc_html( Log::label( $l->action ) ); ?></td>
			<td><?php echo $title ? '<a href="' . esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . (int) $l->object_id ) ) . '">' . esc_html( $title ) . '</a>' : '—'; ?></td>
			<td><?php echo esc_html( $actor ? $actor->display_name : __( 'system', 'explore-katsina' ) ); ?></td>
			<td><?php echo esc_html( $l->reason ); ?><?php echo ! empty( $meta['fields'] ) ? esc_html( ' ' . implode( ', ', (array) $meta['fields'] ) ) : ''; ?></td>
		</tr>
	<?php endforeach; ?>
	</tbody>
</table>
<p>
	<?php if ( $page > 1 ) : ?><a class="button" href="<?php echo esc_url( add_query_arg( 'paged', $page - 1 ) ); ?>">← <?php esc_html_e( 'Newer', 'explore-katsina' ); ?></a><?php endif; ?>
	<?php if ( count( $rows ) === 100 ) : ?><a class="button" href="<?php echo esc_url( add_query_arg( 'paged', $page + 1 ) ); ?>"><?php esc_html_e( 'Older', 'explore-katsina' ); ?> →</a><?php endif; ?>
</p>
