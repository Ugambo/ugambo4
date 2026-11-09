<?php
/**
 * Tickets with QR codes on the receipt page.
 *
 * @var object $s
 */
use EK\Events;
use EK\Tickets;

defined( 'ABSPATH' ) || exit;
if ( 'paid' !== $s->status ) {
	return;
}
$tickets = Tickets::for_sale( $s->id );
$d       = Events::data( $s->object_id );
wp_enqueue_script( 'ek-qrcode', EK_URL . 'assets/vendor/qrcode/qrcode.js', array(), '1.4.4', true );
wp_enqueue_script( 'ek-tickets', EK_URL . 'assets/js/tickets.js', array( 'ek-qrcode' ), \EK\Assets::ver( 'assets/js/tickets.js' ), true );
?>
<section class="ek-stack" aria-labelledby="tix-h">
	<div class="ek-row ek-row--between"><h2 id="tix-h" style="margin:0"><?php esc_html_e( 'Your tickets', 'explore-katsina' ); ?></h2><button type="button" class="ek-btn ek-btn--ghost ek-btn--sm" onclick="window.print()"><?php esc_html_e( 'Print', 'explore-katsina' ); ?></button></div>
	<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Show each QR code at the entrance (on your phone or printed). Each code works once.', 'explore-katsina' ); ?></p>
	<ol class="ek-tickets">
		<?php foreach ( $tickets as $i => $k ) : ?>
			<li class="ek-ticket<?php echo 'valid' !== $k->status ? ' is-' . esc_attr( $k->status ) : ''; ?>">
				<div class="ek-ticket-qr" data-ek-qr="<?php echo esc_attr( $k->code ); ?>" role="img" aria-label="<?php echo esc_attr( sprintf( /* translators: %s: code */ __( 'QR code for ticket %s', 'explore-katsina' ), $k->code ) ); ?>"></div>
				<div class="ek-stack" style="gap:2px;min-width:0">
					<p class="ek-eyebrow" style="margin:0"><?php echo esc_html( sprintf( /* translators: 1: number, 2: total */ __( 'Ticket %1$d of %2$d', 'explore-katsina' ), $i + 1, count( $tickets ) ) ); ?></p>
					<strong><?php echo esc_html( get_the_title( $s->object_id ) ); ?></strong>
					<span><?php echo esc_html( $k->type_name . ' · ' . $k->holder ); ?></span>
					<span class="ek-small"><?php echo esc_html( Events::when( $d ) ); ?><?php echo $d['venue'] ? ' · ' . esc_html( $d['venue'] ) : ''; ?></span>
					<code class="ek-ticket-code"><?php echo esc_html( trim( chunk_split( $k->code, 4, ' ' ) ) ); ?></code>
					<?php if ( 'used' === $k->status ) : ?><span class="ek-pill"><?php esc_html_e( 'Used', 'explore-katsina' ); ?></span><?php elseif ( 'void' === $k->status ) : ?><span class="ek-pill ek-pill--bad"><?php esc_html_e( 'Cancelled', 'explore-katsina' ); ?></span><?php endif; ?>
				</div>
			</li>
		<?php endforeach; ?>
	</ol>
</section>
