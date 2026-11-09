<?php
/**
 * Event promotion order page.
 *
 * @var array $errors
 * @var array $v
 * @var array $packages
 * @var int[] $events
 */
use EK\Money;
use EK\View;

defined( 'ABSPATH' ) || exit;
$val = static fn( $k ) => esc_attr( $v[ $k ] ?? '' );
?>
<div class="ek ek-stack" style="max-width:820px;margin:0 auto">
	<h1 style="margin:0"><?php esc_html_e( 'Promote your event', 'explore-katsina' ); ?></h1>
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Feature your event on our homepage and at the top of the Events page, clearly labelled "Promoted". Our team checks every event before it goes live; if we cannot accept it, we refund you.', 'explore-katsina' ); ?></p>
	<?php if ( ! empty( $errors['_form'] ) ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $errors['_form'] ); ?></div><?php endif; ?>
	<form method="post" class="ek-card ek-stack" novalidate>
		<input type="hidden" name="ek_action" value="promote_event"><?php wp_nonce_field( 'ek_promote_event', '_ek_nonce' ); ?>
		<div class="ek-hp" aria-hidden="true"><label>Company <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
		<fieldset class="<?php echo esc_attr( View::field_class( $errors, 'package' ) ); ?>" style="border:0;padding:0;margin:0">
			<legend class="ek-label"><?php esc_html_e( 'Package', 'explore-katsina' ); ?></legend>
			<div class="ek-row"><?php foreach ( $packages as $k => $p ) : ?><label class="ek-card ek-choice" style="margin:0"><input type="radio" name="package" value="<?php echo esc_attr( $k ); ?>" <?php checked( (string) ( $v['package'] ?? '7' ), (string) $k ); ?>> <strong><?php echo esc_html( $p[0] ); ?></strong> · <?php echo esc_html( Money::format( $p[1] ) ); ?></label><?php endforeach; ?></div>
		</fieldset>
		<div class="ek-field"><label for="pe-event"><?php esc_html_e( 'Your event', 'explore-katsina' ); ?></label>
			<select id="pe-event" name="event_id"><option value="0"><?php esc_html_e( 'It is not on Explore Katsina yet (fill in below)', 'explore-katsina' ); ?></option><?php foreach ( $events as $id ) : ?><option value="<?php echo (int) $id; ?>" <?php selected( absint( $v['event_id'] ?? 0 ), $id ); ?>><?php echo esc_html( get_the_title( $id ) ); ?></option><?php endforeach; ?></select></div>
		<div class="ek-grid ek-grid--2">
			<div class="<?php echo esc_attr( View::field_class( $errors, 'event_title' ) ); ?>"><label for="pe-title"><?php esc_html_e( 'Event name', 'explore-katsina' ); ?></label><input type="text" id="pe-title" name="event_title" value="<?php echo $val( 'event_title' ); // phpcs:ignore ?>"><?php echo View::error( $errors, 'event_title' ); // phpcs:ignore ?></div>
			<div class="ek-field"><label for="pe-date"><?php esc_html_e( 'Date (leave empty if not confirmed)', 'explore-katsina' ); ?></label><input type="date" id="pe-date" name="event_date" value="<?php echo $val( 'event_date' ); // phpcs:ignore ?>"></div>
			<div class="ek-field ek-span-2"><label for="pe-venue"><?php esc_html_e( 'Venue / place', 'explore-katsina' ); ?></label><input type="text" id="pe-venue" name="event_venue" value="<?php echo $val( 'event_venue' ); // phpcs:ignore ?>"></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'event_about' ) ); ?> ek-span-2"><label for="pe-about"><?php esc_html_e( 'About the event', 'explore-katsina' ); ?></label><textarea id="pe-about" name="event_about" rows="4"><?php echo esc_textarea( $v['event_about'] ?? '' ); ?></textarea><?php echo View::error( $errors, 'event_about' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'name' ) ); ?>"><label for="pe-name"><?php esc_html_e( 'Your name', 'explore-katsina' ); ?></label><input type="text" id="pe-name" name="name" autocomplete="name" value="<?php echo $val( 'name' ); // phpcs:ignore ?>"><?php echo View::error( $errors, 'name' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'phone' ) ); ?>"><label for="pe-phone"><?php esc_html_e( 'Phone', 'explore-katsina' ); ?></label><input type="tel" id="pe-phone" name="phone" autocomplete="tel" placeholder="0803 123 4567" value="<?php echo $val( 'phone' ); // phpcs:ignore ?>"><?php echo View::error( $errors, 'phone' ); // phpcs:ignore ?></div>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'email' ) ); ?> ek-span-2"><label for="pe-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="pe-email" name="email" autocomplete="email" value="<?php echo $val( 'email' ); // phpcs:ignore ?>"><?php echo View::error( $errors, 'email' ); // phpcs:ignore ?></div>
		</div>
		<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Continue to payment', 'explore-katsina' ); ?></button></div>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Prices are placeholders until launch.', 'explore-katsina' ); ?></p>
	</form>
</div>
