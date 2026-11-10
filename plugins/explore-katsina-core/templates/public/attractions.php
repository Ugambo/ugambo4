<?php
/**
 * "Things to do": attraction cards with a category filter.
 *
 * @var int[]  $ids
 * @var string $cat Selected category slug ('' = all).
 */
use EK\Attractions;
use EK\Gallery;
use EK\Install;

defined( 'ABSPATH' ) || exit;
$cats = get_terms( array( 'taxonomy' => Attractions::TAX, 'hide_empty' => true ) );
$base = get_permalink();
?>
<div class="ek ek-attractions ek-stack">
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Historic sites, palaces, dams, markets and crafts across Katsina State. Every fact is sourced, and each page shows the nearest places to stay and eat.', 'explore-katsina' ); ?> <a href="<?php echo esc_url( Install::page_url( 'map' ) ); ?>"><?php esc_html_e( 'See them on the Katsina Map', 'explore-katsina' ); ?></a></p>
	<?php if ( $cats && ! is_wp_error( $cats ) ) : ?>
		<nav class="ek-chips" aria-label="<?php esc_attr_e( 'Filter by type', 'explore-katsina' ); ?>">
			<a class="ek-chip<?php echo '' === $cat ? ' is-active' : ''; ?>" href="<?php echo esc_url( $base ); ?>"<?php echo '' === $cat ? ' aria-current="page"' : ''; ?>><?php esc_html_e( 'All', 'explore-katsina' ); ?></a>
			<?php foreach ( $cats as $t ) : ?>
				<a class="ek-chip<?php echo $cat === $t->slug ? ' is-active' : ''; ?>" href="<?php echo esc_url( add_query_arg( 'type', $t->slug, $base ) ); ?>"<?php echo $cat === $t->slug ? ' aria-current="page"' : ''; ?>><?php echo esc_html( wp_specialchars_decode( $t->name ) ); ?></a>
			<?php endforeach; ?>
		</nav>
	<?php endif; ?>
	<?php if ( ! $ids ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'Nothing here yet', 'explore-katsina' ); ?></strong></div><?php endif; ?>
	<ul class="ek-attr-grid">
		<?php foreach ( $ids as $id ) : $a = Attractions::data( $id ); $photo = Gallery::ids( $id ); ?>
			<li class="ek-card ek-attr-card">
				<a href="<?php echo esc_url( get_permalink( $id ) ); ?>" class="ek-attr-img" tabindex="-1" aria-hidden="true">
					<?php if ( $photo ) : ?><?php echo wp_get_attachment_image( $photo[0], 'medium_large', false, array( 'alt' => '', 'loading' => 'lazy' ) ); ?><?php else : ?><span class="ek-attr-noimg"><?php echo esc_html( get_the_title( $id ) ); ?></span><?php endif; ?>
				</a>
				<div class="ek-stack" style="gap:4px">
					<span class="ek-small ek-muted" style="text-transform:uppercase;letter-spacing:.04em"><?php echo esc_html( trim( $a['category'] . ( $a['lga'] ? ' · ' . $a['lga'] : '' ), ' ·' ) ); ?></span>
					<h3 style="margin:0"><a href="<?php echo esc_url( get_permalink( $id ) ); ?>"><?php echo esc_html( get_the_title( $id ) ); ?></a></h3>
					<?php if ( has_excerpt( $id ) ) : ?><p class="ek-small" style="margin:0"><?php echo esc_html( get_the_excerpt( $id ) ); ?></p><?php endif; ?>
				</div>
			</li>
		<?php endforeach; ?>
	</ul>
</div>
