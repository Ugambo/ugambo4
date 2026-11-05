<?php
/**
 * Admin: one business, with approve / reject / pause / verify.
 *
 * @var int $id
 */
use EK\Admin;
use EK\Assets;
use EK\Business;
use EK\Log;
use EK\Post_Types;
use EK\Private_Files;
use EK\View;

defined( 'ABSPATH' ) || exit;

$b       = Business::profile( $id );
$priv    = Business::private_details( $id, true );
$owner   = get_userdata( Business::owner_id( $id ) );
$types   = Business::types();
$colours = Assets::map_config()['pinColours'];
$msg     = sanitize_key( $_GET['ek_msg'] ?? '' ); // phpcs:ignore
?>
<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=ek-approvals&status=' . $b['status'] ) ); ?>">← <?php esc_html_e( 'Back to list', 'explore-katsina' ); ?></a></p>
<h1><?php echo esc_html( $b['name'] ); ?> <span class="ek-pill ek-pill--<?php echo esc_attr( $b['status'] ); ?>"><?php echo esc_html( Business::status_label( $b['status'] ) ); ?></span> <?php echo $b['verified'] ? '<span class="ek-pill">✓ ' . esc_html__( 'Verified', 'explore-katsina' ) . '</span>' : ''; ?></h1>
<?php if ( 'done' === $msg ) : ?><div class="notice notice-success"><p><?php esc_html_e( 'Done. The owner has been emailed where relevant.', 'explore-katsina' ); ?></p></div><?php endif; ?>
<?php if ( 'reason' === $msg ) : ?><div class="notice notice-error"><p><?php esc_html_e( 'Please give a reason when rejecting, so the owner knows what to fix.', 'explore-katsina' ); ?></p></div><?php endif; ?>

<div class="card ek-actions">
	<h2><?php esc_html_e( 'Decision', 'explore-katsina' ); ?></h2>
	<?php
	if ( in_array( $b['status'], array( 'pending', Post_Types::STATUS_REJECTED ), true ) ) {
		echo Admin::action_form( 'approve', $id, __( 'Approve and publish', 'explore-katsina' ), 'button button-primary' ); // phpcs:ignore
	}
	if ( 'pending' === $b['status'] ) {
		echo Admin::action_form( 'reject', $id, __( 'Reject', 'explore-katsina' ), 'button', true, true ); // phpcs:ignore
	}
	if ( 'publish' === $b['status'] ) {
		echo Admin::action_form( 'pause', $id, __( 'Pause listing', 'explore-katsina' ), 'button', true ); // phpcs:ignore
	}
	if ( Post_Types::STATUS_PAUSED === $b['status'] ) {
		echo Admin::action_form( 'resume', $id, __( 'Resume listing', 'explore-katsina' ), 'button button-primary' ); // phpcs:ignore
	}
	echo $b['verified'] // phpcs:ignore
		? Admin::action_form( 'unverify', $id, __( 'Remove Verified badge', 'explore-katsina' ) )
		: Admin::action_form( 'verify', $id, __( 'Give Verified badge', 'explore-katsina' ) );
	if ( 'hotel' === $b['type'] && (int) get_post_meta( $id, '_ek_stars', true ) ) {
		$stars = (int) get_post_meta( $id, '_ek_stars', true );
		echo get_post_meta( $id, '_ek_stars_verified', true ) // phpcs:ignore
			/* translators: %d: stars */
			? Admin::action_form( 'unverify_stars', $id, sprintf( __( 'Remove verification of %d★ rating', 'explore-katsina' ), $stars ) )
			/* translators: %d: stars */
			: Admin::action_form( 'verify_stars', $id, sprintf( __( 'Verify self-declared %d★ rating', 'explore-katsina' ), $stars ) );
	}
	?>
	<p class="description"><?php esc_html_e( 'Verified means you have checked the ID, CAC (if given) and that the business really exists at the pinned location.', 'explore-katsina' ); ?></p>
</div>

<div class="ek-grid">
	<div>
		<div class="card">
			<h2><?php esc_html_e( 'Public profile', 'explore-katsina' ); ?></h2>
			<dl>
				<dt><?php esc_html_e( 'Type', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $types[ $b['type'] ]['label'] ?? $b['type'] ); ?></dd>
				<dt><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $b['lga'] ); ?></dd>
				<dt><?php esc_html_e( 'Address', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $b['address'] ); ?></dd>
				<dt><?php esc_html_e( 'Map pin', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $b['lat'] . ', ' . $b['lng'] ); ?> · <a href="<?php echo esc_url( 'https://www.openstreetmap.org/?mlat=' . $b['lat'] . '&mlon=' . $b['lng'] . '#map=18/' . $b['lat'] . '/' . $b['lng'] ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'open large map', 'explore-katsina' ); ?></a></dd>
				<dt><?php esc_html_e( 'Phone', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $b['phone'] ); ?></dd>
				<dt><?php esc_html_e( 'WhatsApp', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $b['whatsapp'] ? $b['whatsapp'] : '—' ); ?></dd>
				<dt><?php esc_html_e( 'Email', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $b['email'] ); ?></dd>
				<dt><?php esc_html_e( 'Website', 'explore-katsina' ); ?></dt><dd><?php echo $b['website'] ? '<a href="' . esc_url( $b['website'] ) . '" target="_blank" rel="noopener nofollow">' . esc_html( $b['website'] ) . '</a>' : '—'; ?></dd>
				<dt><?php esc_html_e( 'Socials', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( implode( ' · ', array_filter( $b['socials'] ) ) ? implode( ' · ', array_filter( $b['socials'] ) ) : '—' ); ?></dd>
				<dt><?php esc_html_e( 'Hours', 'explore-katsina' ); ?></dt><dd>
					<?php
					if ( $b['hours']['always'] ) {
						esc_html_e( 'Open 24 hours', 'explore-katsina' );
					} else {
						$parts = array();
						foreach ( Business::day_labels() as $k => $label ) {
							$h       = $b['hours'][ $k ];
							$parts[] = substr( $label, 0, 3 ) . ' ' . ( $h['closed'] ? __( 'closed', 'explore-katsina' ) : $h['open'] . '–' . $h['close'] );
						}
						echo esc_html( implode( ', ', $parts ) );
					}
					?>
				</dd>
			</dl>
			<h3><?php esc_html_e( 'Description', 'explore-katsina' ); ?></h3>
			<div><?php echo wpautop( wp_kses_post( $b['description'] ) ); // phpcs:ignore ?></div>
		</div>
		<div class="card">
			<h2><?php /* translators: %d: count */ printf( esc_html__( 'Photos (%d)', 'explore-katsina' ), count( $b['photos'] ) ); ?></h2>
			<div class="ek-photos"><?php foreach ( $b['photos'] as $pid ) { echo '<a href="' . esc_url( wp_get_attachment_url( $pid ) ) . '" target="_blank" rel="noopener">' . wp_get_attachment_image( $pid, 'thumbnail' ) . '</a>'; } // phpcs:ignore ?></div>
		</div>
	</div>
	<div>
		<div class="card">
			<h2><?php esc_html_e( 'Map', 'explore-katsina' ); ?></h2>
			<div class="ek-mini-map" data-ek-mini-map data-lat="<?php echo esc_attr( $b['lat'] ); ?>" data-lng="<?php echo esc_attr( $b['lng'] ); ?>" data-colour="<?php echo esc_attr( $colours[ $b['type'] ] ?? '#8E1B2C' ); ?>"></div>
		</div>
		<div class="card">
			<h2><?php esc_html_e( 'Owner & identity (private)', 'explore-katsina' ); ?></h2>
			<dl>
				<dt><?php esc_html_e( 'Owner name', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $priv['owner_name'] ?? '' ); ?></dd>
				<dt><?php esc_html_e( 'Login account', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $owner ? $owner->user_email : '—' ); ?></dd>
				<dt><?php esc_html_e( 'CAC number', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ! empty( $priv['cac_number'] ) ? $priv['cac_number'] : __( 'Not given', 'explore-katsina' ) ); ?></dd>
				<dt><?php esc_html_e( 'ID document', 'explore-katsina' ); ?></dt><dd><?php echo ! empty( $priv['id_doc_file'] ) ? '<a class="button" href="' . esc_url( Private_Files::admin_url_for( $id ) ) . '" target="_blank" rel="noopener">' . esc_html__( 'View ID (logged)', 'explore-katsina' ) . '</a>' : '—'; ?></dd>
				<dt><?php esc_html_e( 'Agreement', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( ( $priv['agreement_version'] ?? '' ) . ' · ' . View::date( $priv['agreement_accepted_at'] ?? '', true ) . ' · IP ' . ( $priv['agreement_ip'] ?? '' ) ); ?></dd>
			</dl>
		</div>
		<div class="card">
			<h2><?php esc_html_e( 'Payout bank (private)', 'explore-katsina' ); ?></h2>
			<dl>
				<dt><?php esc_html_e( 'Bank', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $priv['bank_name'] ?? '' ); ?></dd>
				<dt><?php esc_html_e( 'Account name', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $priv['account_name'] ?? '' ); ?></dd>
				<dt><?php esc_html_e( 'Account number', 'explore-katsina' ); ?></dt><dd><details><summary><?php echo esc_html( '••••••' . ( $priv['account_last4'] ?? '' ) ); ?> (<?php esc_html_e( 'show', 'explore-katsina' ); ?>)</summary><span class="ek-secret"><?php echo esc_html( $priv['account_number'] ?? '' ); ?></span></details></dd>
			</dl>
			<p class="description"><?php esc_html_e( 'Check that the account name matches the owner or the registered business name.', 'explore-katsina' ); ?></p>
		</div>
		<div class="card">
			<h2><?php esc_html_e( 'History', 'explore-katsina' ); ?></h2>
			<ul>
				<?php
				foreach ( Log::for_object( 'business', $id ) as $l ) :
					$actor = $l->actor_id ? get_userdata( (int) $l->actor_id ) : null;
					?>
					<li><strong><?php echo esc_html( Log::label( $l->action ) ); ?></strong> · <?php echo esc_html( View::date( $l->created_at, true ) ); ?> · <?php echo esc_html( $actor ? $actor->display_name : __( 'system', 'explore-katsina' ) ); ?><?php echo $l->reason ? '<br><em>' . esc_html( $l->reason ) . '</em>' : ''; ?></li>
				<?php endforeach; ?>
			</ul>
		</div>
	</div>
</div>
