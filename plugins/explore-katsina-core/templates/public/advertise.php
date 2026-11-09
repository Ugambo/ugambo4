<?php
/**
 * Advertise with us.
 *
 * @var array $errors
 * @var array $v
 * @var bool  $sent
 */
use EK\Advertise;
use EK\Events;
use EK\Install;
use EK\Money;
use EK\Plans;
use EK\Services;
use EK\Settings;
use EK\View;

defined( 'ABSPATH' ) || exit;
$kit  = (int) Settings::get( 'media_kit_id' );
$kitu = $kit ? wp_get_attachment_url( $kit ) : '';
$val  = static fn( $k ) => esc_attr( $v[ $k ] ?? '' );
?>
<div class="ek ek-advertise ek-stack" style="max-width:960px;margin:0 auto">
	<h1 style="margin:0"><?php esc_html_e( 'Advertise with Explore Katsina', 'explore-katsina' ); ?></h1>
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Reach visitors planning trips, stays, meals and events in Katsina State. Every paid placement is clearly labelled, and nothing you pay for changes our honest rankings.', 'explore-katsina' ); ?></p>
	<div class="ek-grid ek-grid--2">
		<?php foreach ( Plans::plans() as $p ) : ?>
			<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php echo esc_html( $p['label'] ); ?> <?php esc_html_e( 'listing', 'explore-katsina' ); ?></h2><p style="margin:0"><strong><?php echo esc_html( Money::format( $p['month'] ) ); ?></strong> <?php esc_html_e( '/ month', 'explore-katsina' ); ?> · <?php echo esc_html( Money::format( $p['year'] ) ); ?> <?php esc_html_e( '/ year', 'explore-katsina' ); ?></p><ul class="ek-small" style="margin:0;padding-left:1.1em"><?php foreach ( $p['benefits'] as $bn ) : ?><li><?php echo esc_html( $bn ); ?></li><?php endforeach; ?></ul><p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Buy from your business dashboard.', 'explore-katsina' ); ?></p></section>
		<?php endforeach; ?>
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Banner ads', 'explore-katsina' ); ?></h2><p style="margin:0"><?php esc_html_e( 'Homepage, search results, the Katsina Map, sidebars and articles. Booked by date, with view and click reports.', 'explore-katsina' ); ?></p><p style="margin:0"><strong><?php esc_html_e( 'Price on request', 'explore-katsina' ); ?></strong></p></section>
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Event promotion', 'explore-katsina' ); ?></h2><p style="margin:0"><?php foreach ( Events::packages() as $pk ) { echo esc_html( $pk[0] . ': ' . Money::format( $pk[1] ) ) . '<br>'; } ?></p><p style="margin:0"><a href="<?php echo esc_url( Install::page_url( 'promote_event' ) ); ?>"><?php esc_html_e( 'Promote an event →', 'explore-katsina' ); ?></a></p></section>
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Sponsored articles', 'explore-katsina' ); ?></h2><p style="margin:0"><?php esc_html_e( 'A story about your business or event, written with you and clearly labelled "Sponsored".', 'explore-katsina' ); ?></p><p style="margin:0"><strong><?php esc_html_e( 'Price on request', 'explore-katsina' ); ?></strong></p></section>
		<section class="ek-card ek-stack" style="margin:0"><h2 style="margin:0"><?php esc_html_e( 'Listing setup', 'explore-katsina' ); ?></h2><p style="margin:0"><?php foreach ( Services::setup_packages() as $pk ) { echo esc_html( $pk[0] . ': ' . Money::format( $pk[1] ) ) . '<br>'; } ?></p><p style="margin:0"><a href="<?php echo esc_url( Install::page_url( 'listing_setup' ) ); ?>"><?php esc_html_e( 'Order listing setup →', 'explore-katsina' ); ?></a></p></section>
	</div>
	<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'All prices are placeholders until launch.', 'explore-katsina' ); ?></p>
	<section class="ek-card ek-stack" aria-labelledby="kit-h">
		<h2 id="kit-h" style="margin:0"><?php esc_html_e( 'Media kit', 'explore-katsina' ); ?></h2>
		<?php if ( $kitu ) : ?><p style="margin:0"><a class="ek-btn ek-btn--night" href="<?php echo esc_url( $kitu ); ?>" download><?php esc_html_e( 'Download the media kit (PDF)', 'explore-katsina' ); ?></a></p>
		<?php else : ?><p class="ek-muted" style="margin:0"><?php esc_html_e( 'Our media kit is being prepared. Send us an enquiry and we will email it to you.', 'explore-katsina' ); ?></p><?php endif; ?>
	</section>
	<section class="ek-card ek-stack" id="enquiry" aria-labelledby="enq-h">
		<h2 id="enq-h" style="margin:0"><?php esc_html_e( 'Send an enquiry', 'explore-katsina' ); ?></h2>
		<?php if ( $sent ) : ?>
			<div class="ek-notice ek-notice--ok" role="status"><?php esc_html_e( 'Thank you! We have received your enquiry and will reply within 2 working days.', 'explore-katsina' ); ?></div>
		<?php else : ?>
			<?php if ( ! empty( $errors['_form'] ) ) : ?><div class="ek-notice ek-notice--error" role="alert"><?php echo esc_html( $errors['_form'] ); ?></div><?php endif; ?>
			<form method="post" class="ek-stack" novalidate>
				<input type="hidden" name="ek_action" value="ad_enquiry"><?php wp_nonce_field( 'ek_ad_enquiry', '_ek_nonce' ); ?>
				<div class="ek-hp" aria-hidden="true"><label>Company website <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>
				<div class="ek-grid ek-grid--2">
					<div class="<?php echo esc_attr( View::field_class( $errors, 'name' ) ); ?>"><label for="en-name"><?php esc_html_e( 'Your name', 'explore-katsina' ); ?></label><input type="text" id="en-name" name="name" autocomplete="name" value="<?php echo $val( 'name' ); // phpcs:ignore ?>" required><?php echo View::error( $errors, 'name' ); // phpcs:ignore ?></div>
					<div class="ek-field"><label for="en-co"><?php esc_html_e( 'Company (optional)', 'explore-katsina' ); ?></label><input type="text" id="en-co" name="company" autocomplete="organization" value="<?php echo $val( 'company' ); // phpcs:ignore ?>"></div>
					<div class="<?php echo esc_attr( View::field_class( $errors, 'email' ) ); ?>"><label for="en-email"><?php esc_html_e( 'Email', 'explore-katsina' ); ?></label><input type="email" id="en-email" name="email" autocomplete="email" value="<?php echo $val( 'email' ); // phpcs:ignore ?>" required><?php echo View::error( $errors, 'email' ); // phpcs:ignore ?></div>
					<div class="ek-field"><label for="en-phone"><?php esc_html_e( 'Phone (optional)', 'explore-katsina' ); ?></label><input type="tel" id="en-phone" name="phone" autocomplete="tel" value="<?php echo $val( 'phone' ); // phpcs:ignore ?>"></div>
					<div class="ek-field ek-span-2"><label for="en-int"><?php esc_html_e( 'Interested in', 'explore-katsina' ); ?></label><select id="en-int" name="interest"><?php foreach ( Advertise::interests() as $k => $label ) : ?><option value="<?php echo esc_attr( $k ); ?>" <?php selected( $v['interest'] ?? '', $k ); ?>><?php echo esc_html( $label ); ?></option><?php endforeach; ?></select></div>
					<div class="<?php echo esc_attr( View::field_class( $errors, 'message' ) ); ?> ek-span-2"><label for="en-msg"><?php esc_html_e( 'Message', 'explore-katsina' ); ?></label><textarea id="en-msg" name="message" rows="4" required><?php echo esc_textarea( $v['message'] ?? '' ); ?></textarea><?php echo View::error( $errors, 'message' ); // phpcs:ignore ?></div>
				</div>
				<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Send enquiry', 'explore-katsina' ); ?></button></div>
			</form>
		<?php endif; ?>
	</section>
</div>
