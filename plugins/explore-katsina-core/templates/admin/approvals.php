<?php
/**
 * Admin: approval queue.
 */
use EK\Business;
use EK\Post_Types;
use EK\View;

defined( 'ABSPATH' ) || exit;

$tabs   = array(
	'pending'                   => __( 'Waiting for approval', 'explore-katsina' ),
	'publish'                   => __( 'Approved', 'explore-katsina' ),
	Post_Types::STATUS_PAUSED   => __( 'Paused', 'explore-katsina' ),
	Post_Types::STATUS_REJECTED => __( 'Rejected', 'explore-katsina' ),
);
$status = sanitize_key( $_GET['status'] ?? 'pending' ); // phpcs:ignore
$status = isset( $tabs[ $status ] ) ? $status : 'pending';
$counts = wp_count_posts( Post_Types::BUSINESS );
$paged  = max( 1, absint( $_GET['paged'] ?? 1 ) ); // phpcs:ignore
$q      = new WP_Query(
	array(
		'post_type'      => Post_Types::BUSINESS,
		'post_status'    => $status,
		'posts_per_page' => 30,
		'paged'          => $paged,
		'orderby'        => 'date',
		'order'          => 'pending' === $status ? 'ASC' : 'DESC',
	)
);
$types  = Business::types();
?>
<h1 class="wp-heading-inline"><?php esc_html_e( 'Business approvals', 'explore-katsina' ); ?></h1>
<p><?php esc_html_e( 'New businesses stay hidden until you approve them. Open each one to check the ID, bank details and map pin.', 'explore-katsina' ); ?></p>
<ul class="subsubsub">
	<?php
	$links = array();
	foreach ( $tabs as $key => $label ) {
		$links[] = '<li><a href="' . esc_url( admin_url( 'admin.php?page=ek-approvals&status=' . $key ) ) . '"' . ( $status === $key ? ' class="current"' : '' ) . '>' . esc_html( $label ) . ' <span class="count">(' . (int) ( $counts->$key ?? 0 ) . ')</span></a>';
	}
	echo implode( ' | </li>', $links ) . '</li>'; // phpcs:ignore
	?>
</ul>
<table class="wp-list-table widefat fixed striped">
	<thead><tr><th><?php esc_html_e( 'Business', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Type', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Owner', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Submitted', 'explore-katsina' ); ?></th><th></th></tr></thead>
	<tbody>
	<?php if ( ! $q->have_posts() ) : ?>
		<tr><td colspan="6"><?php esc_html_e( 'Nothing here.', 'explore-katsina' ); ?></td></tr>
	<?php endif; ?>
	<?php
	foreach ( $q->posts as $p ) :
		$owner = get_userdata( (int) $p->post_author );
		$lga   = Business::lga_of( $p->ID );
		$type  = Business::type_of( $p->ID );
		?>
		<tr>
			<td><strong><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . $p->ID ) ); ?>"><?php echo esc_html( $p->post_title ); ?></a></strong><?php echo get_post_meta( $p->ID, '_ek_verified', true ) ? ' ✓' : ''; ?></td>
			<td><?php echo esc_html( $types[ $type ]['label'] ?? $type ); ?></td>
			<td><?php echo esc_html( $lga ? $lga->name : '' ); ?></td>
			<td><?php echo esc_html( $owner ? $owner->display_name . ' (' . $owner->user_email . ')' : '—' ); ?></td>
			<td><?php echo esc_html( View::date( $p->post_date_gmt, true ) ); ?></td>
			<td><a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&business=' . $p->ID ) ); ?>"><?php esc_html_e( 'Review', 'explore-katsina' ); ?></a></td>
		</tr>
	<?php endforeach; ?>
	</tbody>
</table>
<?php
echo '<div class="tablenav"><div class="tablenav-pages">' . paginate_links( array( 'base' => add_query_arg( 'paged', '%#%' ), 'total' => $q->max_num_pages, 'current' => $paged ) ) . '</div></div>'; // phpcs:ignore
