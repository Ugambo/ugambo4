<?php
/**
 * Explore hub.
 *
 * @var array $tiles From Explore::tiles().
 */
use EK\Install;

defined( 'ABSPATH' ) || exit;
?>
<div class="ek ek-explore ek-stack">
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Everything Explore Katsina offers, in one place.', 'explore-katsina' ); ?></p>
	<ul class="ek-explore-grid">
		<?php foreach ( $tiles as $key => $t ) : ?>
			<li><a class="ek-explore-tile ek-explore-tile--<?php echo esc_attr( $key ); ?>" href="<?php echo esc_url( Install::page_url( $t[2] ) ); ?>">
				<span class="ek-explore-title"><?php echo esc_html( $t[0] ); ?></span>
				<?php if ( null !== $t[1] ) : ?><span class="ek-explore-count"><?php echo esc_html( sprintf( /* translators: %s: number */ _n( '%s listed', '%s listed', (int) $t[1], 'explore-katsina' ), number_format_i18n( (int) $t[1] ) ) ); ?></span><?php endif; ?>
			</a></li>
		<?php endforeach; ?>
	</ul>
</div>
