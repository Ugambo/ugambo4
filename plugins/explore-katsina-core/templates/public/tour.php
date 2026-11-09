<?php
/**
 * Tour details + booking form.
 *
 * @var int    $id
 * @var array  $d
 * @var array  $deps
 * @var string $error
 * @var array  $v
 */
use EK\Favourites;
use EK\Money;
use EK\Settings;
use EK\Tours;

defined( 'ABSPATH' ) || exit;
$user = wp_get_current_user();
$open = array_values( array_filter( $deps, static fn( $r ) => 'open' === $r->status && Tours::seats_left( $r ) > 0 && Tours::starts_at( $r ) > time() ) );
?>
<div class="ek ek-tour ek-stack">
	<section class="ek-card ek-stack" aria-label="<?php esc_attr_e( 'Tour details', 'explore-katsina' ); ?>">
		<dl class="ek-dl">
			<dt><?php esc_html_e( 'Price', 'explore-katsina' ); ?></dt><dd><strong><?php echo esc_html( Money::format( $d['price'] ) ); ?></strong> <?php esc_html_e( 'per person', 'explore-katsina' ); ?></dd>
			<?php if ( $d['duration'] ) : ?><dt><?php esc_html_e( 'Duration', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['duration'] ); ?></dd><?php endif; ?>
			<?php if ( $d['group'] ) : ?><dt><?php esc_html_e( 'Group size', 'explore-katsina' ); ?></dt><dd><?php /* translators: %d: people */ printf( esc_html__( 'Up to %d people', 'explore-katsina' ), (int) $d['group'] ); ?></dd><?php endif; ?>
			<?php if ( $d['pickup'] ) : ?><dt><?php esc_html_e( 'Pickup point', 'explore-katsina' ); ?></dt><dd><?php echo esc_html( $d['pickup'] ); ?></dd><?php endif; ?>
			<?php if ( $d['includes'] ) : ?><dt><?php esc_html_e( "What's included", 'explore-katsina' ); ?></dt><dd><?php echo nl2br( esc_html( $d['includes'] ) ); ?></dd><?php endif; ?>
		</dl>
		<div class="ek-row"><?php echo Favourites::button( $id ); // phpcs:ignore ?></div>
	</section>
	<section class="ek-card ek-stack" id="book-tour" aria-labelledby="bt-h">
		<h2 id="bt-h" style="margin:0"><?php esc_html_e( 'Book this tour', 'explore-katsina' ); ?></h2>
		<?php if ( $error ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $error ); ?></div><?php endif; ?>
		<?php if ( ! $open ) : ?>
			<p class="ek-muted" style="margin:0"><?php esc_html_e( 'No dates available right now. Check back soon.', 'explore-katsina' ); ?></p>
		<?php else : ?>
			<form method="post" class="ek-stack">
				<input type="hidden" name="ek_action" value="book_tour"><input type="hidden" name="tour_id" value="<?php echo (int) $id; ?>"><?php wp_nonce_field( 'ek_book_tour_' . $id, '_ek_nonce' ); ?>
				<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
				<div class="ek-grid ek-grid--2">
					<div class="ek-field ek-span-2"><label for="bt-dep"><?php esc_html_e( 'Date', 'explore-katsina' ); ?></label>
						<select id="bt-dep" name="departure" required><?php foreach ( $open as $r ) : ?><option value="<?php echo (int) $r->id; ?>" <?php selected( absint( $v['departure'] ?? 0 ), (int) $r->id ); ?>><?php echo esc_html( wp_date( 'D j M Y', strtotime( $r->depart_date . ' 12:00' ) ) . ( $r->depart_time ? ', ' . substr( $r->depart_time, 0, 5 ) : '' ) . ' · ' . Money::format( Tours::price_of( $r ) ) . ' · ' . sprintf( /* translators: %d: seats */ _n( '%d seat left', '%d seats left', Tours::seats_left( $r ), 'explore-katsina' ), Tours::seats_left( $r ) ) ); ?></option><?php endforeach; ?></select></div>
					<div class="ek-field"><label for="bt-people"><?php esc_html_e( 'People', 'explore-katsina' ); ?></label><input type="number" id="bt-people" name="people" min="1" max="<?php echo (int) max( 1, $d['group'] ); ?>" value="<?php echo (int) ( $v['people'] ?? 1 ); ?>" required></div>
					<div class="ek-field"><label for="bt-name"><?php esc_html_e( 'Full name', 'explore-katsina' ); ?></label><input type="text" id="bt-name" name="guest_name" autocomplete="name" required value="<?php echo esc_attr( $v['guest_name'] ?? ( $user->exists() ? $user->display_name : '' ) ); ?>"></div>
					<div class="ek-field"><label for="bt-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="bt-email" name="guest_email" autocomplete="email" required value="<?php echo esc_attr( $v['guest_email'] ?? ( $user->exists() ? $user->user_email : '' ) ); ?>"></div>
					<div class="ek-field"><label for="bt-phone"><?php esc_html_e( 'Phone (WhatsApp if possible)', 'explore-katsina' ); ?></label><input type="tel" id="bt-phone" name="guest_phone" autocomplete="tel" placeholder="0803 123 4567" required value="<?php echo esc_attr( $v['guest_phone'] ?? ( $user->exists() ? get_user_meta( $user->ID, '_ek_phone', true ) : '' ) ); ?>"></div>
				</div>
				<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Book and pay', 'explore-katsina' ); ?></button></div>
				<p class="ek-small ek-muted" style="margin:0"><?php /* translators: %d: hours */ printf( esc_html__( 'Seats are held for 15 minutes while you pay. Free cancellation online until %d hours before departure.', 'explore-katsina' ), (int) Settings::get( 'tour_cancel_hours' ) ); ?></p>
			</form>
		<?php endif; ?>
	</section>
</div>
