<?php
/**
 * Directory: every listed business by category, with filters (category, LGA, name).
 *
 * @var array  $groups type => pins (from Map_Index::card)
 * @var array  $types  Business::types()
 * @var string $type
 * @var int    $lga
 * @var string $q
 * @var int    $total
 */
defined( 'ABSPATH' ) || exit;
$lgas = get_terms( array( 'taxonomy' => 'ek_lga', 'hide_empty' => false ) );
?>
<div class="ek ek-directory ek-stack">
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Every business listed on Explore Katsina: places to stay, eat and celebrate, tour operators, transport, crafts, shopping, health services and banks.', 'explore-katsina' ); ?></p>
	<form method="get" class="ek-card ek-dir-filter" role="search">
		<p><label for="ek-dir-type"><?php esc_html_e( 'Category', 'explore-katsina' ); ?></label>
			<select id="ek-dir-type" name="type"><option value=""><?php esc_html_e( 'All categories', 'explore-katsina' ); ?></option>
				<?php foreach ( $types as $k => $t ) : ?><option value="<?php echo esc_attr( $k ); ?>"<?php selected( $type, $k ); ?>><?php echo esc_html( $t['label'] ); ?></option><?php endforeach; ?>
			</select></p>
		<p><label for="ek-dir-lga"><?php esc_html_e( 'LGA', 'explore-katsina' ); ?></label>
			<select id="ek-dir-lga" name="lga"><option value=""><?php esc_html_e( 'All of Katsina State', 'explore-katsina' ); ?></option>
				<?php foreach ( is_wp_error( $lgas ) ? array() : $lgas as $t ) : ?><option value="<?php echo (int) $t->term_id; ?>"<?php selected( $lga, (int) $t->term_id ); ?>><?php echo esc_html( $t->name ); ?></option><?php endforeach; ?>
			</select></p>
		<p><label for="ek-dir-q"><?php esc_html_e( 'Name', 'explore-katsina' ); ?></label><input type="search" id="ek-dir-q" name="q" value="<?php echo esc_attr( $q ); ?>"></p>
		<p><button type="submit" class="ek-btn"><?php esc_html_e( 'Show', 'explore-katsina' ); ?></button></p>
	</form>
	<p class="ek-small ek-muted" style="margin:0" role="status"><?php echo esc_html( sprintf( /* translators: %s: number */ _n( '%s business', '%s businesses', $total, 'explore-katsina' ), number_format_i18n( $total ) ) ); ?></p>
	<?php if ( ! $groups ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'Nothing found', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Try another category or LGA.', 'explore-katsina' ); ?></div><?php endif; ?>
	<?php foreach ( $types as $k => $t ) : if ( empty( $groups[ $k ] ) ) { continue; } ?>
		<section aria-labelledby="dir-<?php echo esc_attr( $k ); ?>">
			<h2 id="dir-<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $t['label'] ); ?> <span class="ek-muted ek-small">(<?php echo count( $groups[ $k ] ); ?>)</span></h2>
			<ul class="ek-dir-list">
				<?php foreach ( $groups[ $k ] as $p ) : ?>
					<li>
						<a class="ek-dir-name" href="<?php echo esc_url( $p['url'] ); ?>"><?php echo esc_html( $p['title'] ); ?></a>
						<span class="ek-small ek-muted"><?php echo esc_html( $p['lga'] ); ?><?php echo $p['rating'] && $p['reviews'] ? ' · ★ ' . esc_html( number_format_i18n( $p['rating'], 1 ) ) : ''; ?><?php echo $p['verified'] ? ' · ' . esc_html__( 'Verified', 'explore-katsina' ) : ''; ?></span>
						<span class="ek-dir-actions ek-small">
							<?php if ( $p['whatsapp'] ) : ?><a href="<?php echo esc_url( $p['whatsapp'] ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'WhatsApp', 'explore-katsina' ); ?></a><?php endif; ?>
							<a href="<?php echo esc_url( $p['directions'] ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'Directions', 'explore-katsina' ); ?></a>
						</span>
					</li>
				<?php endforeach; ?>
			</ul>
		</section>
	<?php endforeach; ?>
</div>
