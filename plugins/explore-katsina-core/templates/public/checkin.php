<?php
/**
 * Staff ticket check-in: scan the QR code with the phone camera, or type the code.
 *
 * @var int[] $events
 */
use EK\Events;
use EK\Tickets;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-checkin ek-stack" data-ek-checkin style="max-width:520px;margin:0 auto">
	<h1 style="margin:0"><?php esc_html_e( 'Ticket check-in', 'explore-katsina' ); ?></h1>
	<?php if ( ! $events ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'No upcoming events with tickets', 'explore-katsina' ); ?></strong></div><?php return; endif; ?>
	<div class="ek-field"><label for="ci-event"><?php esc_html_e( 'Event', 'explore-katsina' ); ?></label>
		<select id="ci-event" data-event><?php foreach ( $events as $id ) : $c = Tickets::counts( $id ); ?><option value="<?php echo (int) $id; ?>" data-issued="<?php echo (int) $c['issued']; ?>" data-used="<?php echo (int) $c['used']; ?>"><?php echo esc_html( get_the_title( $id ) . ' · ' . Events::when( Events::data( $id ) ) ); ?></option><?php endforeach; ?></select></div>
	<p class="ek-small" style="margin:0" data-counts></p>
	<div class="ek-ci-camera"><video data-video playsinline muted></video><canvas data-canvas hidden></canvas></div>
	<div class="ek-row"><button type="button" class="ek-btn ek-btn--night" data-start><?php esc_html_e( 'Start camera', 'explore-katsina' ); ?></button></div>
	<form class="ek-row" data-manual>
		<label class="ek-visually-hidden" for="ci-code"><?php esc_html_e( 'Ticket code', 'explore-katsina' ); ?></label>
		<input type="text" id="ci-code" data-code placeholder="<?php esc_attr_e( 'Or type the code', 'explore-katsina' ); ?>" autocomplete="off" autocapitalize="characters" style="flex:1;min-width:0">
		<button class="ek-btn" type="submit"><?php esc_html_e( 'Check', 'explore-katsina' ); ?></button>
	</form>
	<div class="ek-ci-result" data-result role="status" aria-live="assertive" hidden></div>
</div>
