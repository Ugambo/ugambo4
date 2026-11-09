<?php
/**
 * My Account (logged in).
 *
 * @var array  $tabs
 * @var string $tab
 * @var array  $errors
 * @var int    $uid
 */
use EK\Account;
use EK\Booking;
use EK\Business;
use EK\Dashboard;
use EK\Favourites;
use EK\Install;
use EK\Money;
use EK\Refunds;
use EK\Reviews;
use EK\View;

defined( 'ABSPATH' ) || exit;

$user  = wp_get_current_user();
$owner = (bool) Business::for_user( $uid );
$types = Business::types();
$card  = static function ( $b ) {
	$d     = $b->details;
	$name  = $d['hotel'] ?? ( $d['business'] ?? '' );
	$what  = 'hotel' === $b->kind ? ( $d['room'] ?? '' ) : ( 'event' === $b->kind ? ( $d['hall'] ?? '' ) : ( $d['title'] ?? '' ) );
	$when  = 'hotel' === $b->kind ? wp_date( 'j M', strtotime( $b->start_date ) ) . ' – ' . wp_date( 'j M Y', strtotime( $b->end_date ) )
		: ( 'restaurant' === $b->kind ? wp_date( 'D j M Y', strtotime( $b->start_date ) ) . ' · ' . substr( (string) $b->start_time, 0, 5 )
		: wp_date( 'D j M Y', strtotime( $b->start_date ) ) );
	$past  = $b->end_date < \EK\Availability::today() || in_array( $b->status, array( 'checked_out', 'completed', 'cancelled', 'declined', 'no_show' ), true );
	$extra = '';
	if ( true === Reviews::can_review( $b ) ) {
		$extra = '<a class="ek-btn ek-btn--sm" href="' . esc_url( Booking::link( $b ) . '#review' ) . '">' . esc_html__( 'Write a review', 'explore-katsina' ) . '</a>';
	} elseif ( true === Refunds::can_cancel( $b ) ) {
		$extra = '<a class="ek-btn ek-btn--sm ek-btn--ghost" href="' . esc_url( Booking::link( $b ) . '#cx-h' ) . '">' . esc_html__( 'Cancel', 'explore-katsina' ) . '</a>';
	}
	return '<article class="ek-card ek-trip' . ( $past ? ' is-past' : '' ) . '"><div class="ek-row ek-row--between"><h3 style="margin:0">' . esc_html( $name ) . '</h3><span class="ek-pill ek-status-' . esc_attr( $b->status ) . '">' . esc_html( Dashboard::booking_status_label( $b->status ) ) . '</span></div>'
		. '<p style="margin:0">' . esc_html( $what ) . ' · <strong>' . esc_html( $when ) . '</strong></p>'
		. '<p class="ek-small ek-muted" style="margin:0">' . esc_html( $b->code ) . ( (int) $b->total_kobo ? ' · ' . esc_html( Money::format( $b->total_kobo ) ) : '' ) . '</p>'
		. '<div class="ek-row"><a class="ek-btn ek-btn--sm ek-btn--night" href="' . esc_url( Booking::link( $b ) ) . '">' . esc_html__( 'View', 'explore-katsina' ) . '</a>' . $extra . '</div></article>';
};
?>
<div class="ek ek-account">
	<div class="ek-row ek-row--between">
		<h1 style="margin:0"><?php /* translators: %s: name */ printf( esc_html__( 'Hello, %s', 'explore-katsina' ), esc_html( $user->first_name ? $user->first_name : $user->display_name ) ); ?></h1>
		<div class="ek-row">
			<?php if ( $owner ) : ?><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Install::page_url( 'dashboard' ) ); ?>"><?php esc_html_e( 'Business dashboard', 'explore-katsina' ); ?></a><?php endif; ?>
			<a class="ek-small" href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>"><?php esc_html_e( 'Log out', 'explore-katsina' ); ?></a>
		</div>
	</div>
	<nav class="ek-acct-tabs" aria-label="<?php esc_attr_e( 'Account sections', 'explore-katsina' ); ?>">
		<?php foreach ( $tabs as $k => $label ) : ?><a href="<?php echo esc_url( Account::url( $k ) ); ?>"<?php echo $k === $tab ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $label ); ?></a><?php endforeach; ?>
	</nav>
	<?php echo View::flashes( $uid ); // phpcs:ignore ?>

	<?php if ( 'bookings' === $tab || 'reservations' === $tab ) : ?>
		<?php $list = Account::bookings( $uid, 'bookings' === $tab ? array( 'hotel', 'event' ) : array( 'restaurant' ) ); ?>
		<?php if ( ! $list ) : ?>
			<div class="ek-empty"><strong><?php echo 'bookings' === $tab ? esc_html__( 'No bookings yet', 'explore-katsina' ) : esc_html__( 'No reservations yet', 'explore-katsina' ); ?></strong><?php echo 'bookings' === $tab ? '<a href="' . esc_url( Install::page_url( 'hotels' ) ) . '">' . esc_html__( 'Find a hotel', 'explore-katsina' ) . '</a> · <a href="' . esc_url( Install::page_url( 'event_centres' ) ) . '">' . esc_html__( 'Find an event centre', 'explore-katsina' ) . '</a>' : '<a href="' . esc_url( Install::page_url( 'restaurants' ) ) . '">' . esc_html__( 'Find a restaurant', 'explore-katsina' ) . '</a>'; // phpcs:ignore ?></div>
		<?php else : ?>
			<div class="ek-stack"><?php foreach ( $list as $b ) { echo $card( $b ); } // phpcs:ignore ?></div>
		<?php endif; ?>
		<form method="post" class="ek-card ek-stack" style="margin-top:16px">
			<input type="hidden" name="ek_action" value="acct_link"><?php wp_nonce_field( 'ek_acct_link', '_ek_nonce' ); ?>
			<p style="margin:0"><strong><?php esc_html_e( 'Booked before you had an account?', 'explore-katsina' ); ?></strong> <?php /* translators: %s: email */ printf( esc_html__( 'We can add bookings made with %s. We’ll email you a link to confirm it’s you.', 'explore-katsina' ), '<strong>' . esc_html( $user->user_email ) . '</strong>' ); // phpcs:ignore ?></p>
			<div><button class="ek-btn ek-btn--ghost ek-btn--sm" type="submit"><?php esc_html_e( 'Email me the link', 'explore-katsina' ); ?></button></div>
		</form>
	<?php elseif ( 'orders' === $tab ) : ?>
		<?php $food = Account::bookings( $uid, array( 'order' ) ); $shop = Account::shop_orders( $uid ); $sales = \EK\Sales::for_customer( $uid, array( 'ticket', 'tour' ) ); ?>
		<?php if ( ! $food && ! $shop && ! $sales ) : ?>
			<div class="ek-empty"><strong><?php esc_html_e( 'No orders yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Tickets, tours, shop items, digital guides and food orders will appear here.', 'explore-katsina' ); ?></div>
		<?php endif; ?>
		<div class="ek-stack">
			<?php foreach ( $sales as $sl ) : ?>
				<article class="ek-card ek-trip"><div class="ek-row ek-row--between"><h3 style="margin:0"><?php echo esc_html( $sl->details['title'] ?? '' ); ?></h3><span class="ek-pill"><?php echo esc_html( \EK\Sales::kinds()[ $sl->kind ] ?? $sl->kind ); ?></span></div>
				<p class="ek-small ek-muted" style="margin:0"><?php echo esc_html( $sl->code . ' · ' . \EK\Money::format( $sl->amount_kobo ) . ( 'tour' === $sl->kind ? ' · ' . wp_date( 'j M Y', strtotime( ( $sl->details['date'] ?? 'now' ) . ' 12:00' ) ) : ' · ' . sprintf( /* translators: %d: tickets */ _n( '%d ticket', '%d tickets', (int) $sl->quantity, 'explore-katsina' ), (int) $sl->quantity ) ) . ( 'paid' !== $sl->status ? ' · ' . $sl->status : '' ) ); ?></p>
				<div><a class="ek-btn ek-btn--sm ek-btn--night" href="<?php echo esc_url( \EK\Sales::link( $sl ) ); ?>"><?php echo 'ticket' === $sl->kind ? esc_html__( 'Show tickets', 'explore-katsina' ) : esc_html__( 'View', 'explore-katsina' ); ?></a></div></article>
			<?php endforeach; ?>
			<?php foreach ( $food as $b ) { echo $card( $b ); } // phpcs:ignore ?>
			<?php foreach ( $shop as $o ) : ?>
				<article class="ek-card ek-trip"><div class="ek-row ek-row--between"><h3 style="margin:0"><?php /* translators: %s: order number */ printf( esc_html__( 'Order #%s', 'explore-katsina' ), esc_html( $o->get_order_number() ) ); ?></h3><span class="ek-pill"><?php echo esc_html( wc_get_order_status_name( $o->get_status() ) ); ?></span></div>
				<p class="ek-small ek-muted" style="margin:0"><?php echo esc_html( wc_format_datetime( $o->get_date_created() ) ); ?> · <?php echo wp_kses_post( $o->get_formatted_order_total() ); ?></p>
				<div><a class="ek-btn ek-btn--sm ek-btn--night" href="<?php echo esc_url( $o->get_view_order_url() ); ?>"><?php esc_html_e( 'View', 'explore-katsina' ); ?></a></div></article>
			<?php endforeach; ?>
			<?php if ( function_exists( 'wc_get_account_endpoint_url' ) ) : ?><p class="ek-small" style="margin:0"><a href="<?php echo esc_url( wc_get_account_endpoint_url( 'downloads' ) ); ?>"><?php esc_html_e( 'My downloads (digital guides and maps) →', 'explore-katsina' ); ?></a></p><?php endif; ?>
		</div>
	<?php elseif ( 'favourites' === $tab ) : ?>
		<?php $favs = Favourites::for_user( $uid ); ?>
		<?php if ( ! $favs ) : ?>
			<div class="ek-empty"><strong><?php esc_html_e( 'No favourites yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Tap "♡ Save" on any hotel, restaurant or event centre to keep it here.', 'explore-katsina' ); ?></div>
		<?php else : ?>
			<ul class="ek-favlist">
				<?php
				$ek_other = array( 'ek_attraction' => __( 'Attraction', 'explore-katsina' ), 'ek_event' => __( 'Event', 'explore-katsina' ), 'ek_tour' => __( 'Tour', 'explore-katsina' ) );
				foreach ( $favs as $p ) :
					$t     = Business::type_of( $p->ID );
					$photo = (array) get_post_meta( $p->ID, '_ek_gallery', true );
					if ( empty( $photo[0] ) && get_post_thumbnail_id( $p ) ) {
						$photo = array( get_post_thumbnail_id( $p ) );
					}
					?>
					<li class="ek-card ek-favcard">
						<a href="<?php echo esc_url( get_permalink( $p ) ); ?>" class="ek-favcard-img" tabindex="-1" aria-hidden="true"><?php echo ! empty( $photo[0] ) ? wp_get_attachment_image( (int) $photo[0], 'thumbnail', false, array( 'alt' => '' ) ) : ''; // phpcs:ignore ?></a>
						<div style="min-width:0"><a href="<?php echo esc_url( get_permalink( $p ) ); ?>"><strong><?php echo esc_html( $p->post_title ); ?></strong></a><br><span class="ek-small ek-muted"><?php echo esc_html( $types[ $t ]['label'] ?? ( $ek_other[ $p->post_type ] ?? '' ) ); ?></span></div>
						<?php echo Favourites::button( $p->ID ); // phpcs:ignore ?>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>
	<?php else : ?>
		<div class="ek-grid ek-grid--2">
			<form method="post" class="ek-card ek-stack" style="margin:0">
				<h2 style="margin:0"><?php esc_html_e( 'Your details', 'explore-katsina' ); ?></h2>
				<input type="hidden" name="ek_action" value="acct_profile"><?php wp_nonce_field( 'ek_acct_profile', '_ek_nonce' ); ?>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'display_name' ) ); ?>"><label for="p-name"><?php esc_html_e( 'Name', 'explore-katsina' ); ?></label><input type="text" id="p-name" name="display_name" value="<?php echo esc_attr( $user->display_name ); ?>"><?php echo View::error( $errors, 'display_name' ); // phpcs:ignore ?></div>
				<div class="ek-field"><label for="p-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="p-email" value="<?php echo esc_attr( $user->user_email ); ?>" readonly></div>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'phone' ) ); ?>"><label for="p-phone"><?php esc_html_e( 'Phone', 'explore-katsina' ); ?></label><input type="tel" id="p-phone" name="phone" value="<?php echo esc_attr( Business::display_phone( (string) get_user_meta( $uid, '_ek_phone', true ) ) ); ?>"><?php echo View::error( $errors, 'phone' ); // phpcs:ignore ?></div>
				<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save', 'explore-katsina' ); ?></button></div>
			</form>
			<form method="post" class="ek-card ek-stack" style="margin:0">
				<h2 style="margin:0"><?php esc_html_e( 'Change password', 'explore-katsina' ); ?></h2>
				<input type="hidden" name="ek_action" value="acct_password"><?php wp_nonce_field( 'ek_acct_password', '_ek_nonce' ); ?>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'current_password' ) ); ?>"><label for="p-cur"><?php esc_html_e( 'Current password', 'explore-katsina' ); ?></label><input type="password" id="p-cur" name="current_password" autocomplete="current-password"><?php echo View::error( $errors, 'current_password' ); // phpcs:ignore ?></div>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'new_password' ) ); ?>"><label for="p-new"><?php esc_html_e( 'New password', 'explore-katsina' ); ?></label><input type="password" id="p-new" name="new_password" autocomplete="new-password" minlength="8"><?php echo View::error( $errors, 'new_password' ); // phpcs:ignore ?></div>
				<div><button class="ek-btn ek-btn--night" type="submit"><?php esc_html_e( 'Change password', 'explore-katsina' ); ?></button></div>
			</form>
		</div>
	<?php endif; ?>
</div>
