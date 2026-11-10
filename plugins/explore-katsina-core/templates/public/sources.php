<?php
/**
 * "Sources" list under guide content, so visitors can check the facts.
 *
 * @var array $sources [ [label, url], … ] from Attractions::parse_sources().
 */
defined( 'ABSPATH' ) || exit;
if ( empty( $sources ) ) {
	return;
}
?>
<section class="ek ek-sources" aria-labelledby="ek-sources-h">
	<h2 id="ek-sources-h"><?php esc_html_e( 'Sources', 'explore-katsina' ); ?></h2>
	<ul class="ek-small">
		<?php foreach ( $sources as $src ) : ?>
			<li><?php if ( $src[1] ) : ?><a href="<?php echo esc_url( $src[1] ); ?>" rel="noopener nofollow" target="_blank"><?php echo esc_html( $src[0] ); ?></a><?php else : ?><?php echo esc_html( $src[0] ); ?><?php endif; ?></li>
		<?php endforeach; ?>
	</ul>
	<p class="ek-small ek-muted"><?php printf( /* translators: %s: email link */ esc_html__( 'Spotted a mistake or have better information? Please tell us at %s.', 'explore-katsina' ), '<a href="mailto:info@explorekatsina.com.ng">info@explorekatsina.com.ng</a>' ); ?></p>
</section>
