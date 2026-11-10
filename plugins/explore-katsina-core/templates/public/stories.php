<?php
/**
 * Stories list with topic filter.
 *
 * @var int[]  $ids
 * @var string $topic
 */
use EK\Stories;

defined( 'ABSPATH' ) || exit;
$base = get_permalink();
?>
<div class="ek ek-stories ek-stack">
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'History, culture, food, crafts and travel guides from Katsina State.', 'explore-katsina' ); ?></p>
	<nav class="ek-chips" aria-label="<?php esc_attr_e( 'Filter by topic', 'explore-katsina' ); ?>">
		<a class="ek-chip<?php echo '' === $topic ? ' is-active' : ''; ?>" href="<?php echo esc_url( $base ); ?>"><?php esc_html_e( 'All', 'explore-katsina' ); ?></a>
		<?php foreach ( Stories::categories() as $slug => $name ) : ?>
			<a class="ek-chip<?php echo $topic === $slug ? ' is-active' : ''; ?>" href="<?php echo esc_url( add_query_arg( 'topic', $slug, $base ) ); ?>"<?php echo $topic === $slug ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $name ); ?></a>
		<?php endforeach; ?>
	</nav>
	<?php if ( ! $ids ) : ?><div class="ek-empty"><strong><?php esc_html_e( 'No stories here yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Check back soon.', 'explore-katsina' ); ?></div><?php endif; ?>
	<ul class="ek-attr-grid">
		<?php foreach ( $ids as $id ) : $cats = get_the_category( $id ); ?>
			<li class="ek-card ek-attr-card">
				<a href="<?php echo esc_url( get_permalink( $id ) ); ?>" class="ek-attr-img" tabindex="-1" aria-hidden="true">
					<?php if ( has_post_thumbnail( $id ) ) : ?><?php echo get_the_post_thumbnail( $id, 'medium_large', array( 'alt' => '', 'loading' => 'lazy' ) ); ?><?php else : ?><span class="ek-attr-noimg"><?php echo esc_html( get_the_title( $id ) ); ?></span><?php endif; ?>
				</a>
				<div class="ek-stack" style="gap:4px">
					<span class="ek-small ek-muted" style="text-transform:uppercase;letter-spacing:.04em"><?php echo esc_html( $cats ? $cats[0]->name : '' ); ?> · <?php echo esc_html( get_the_date( '', $id ) ); ?></span>
					<h3 style="margin:0"><a href="<?php echo esc_url( get_permalink( $id ) ); ?>"><?php echo esc_html( get_the_title( $id ) ); ?></a></h3>
					<p class="ek-small" style="margin:0"><?php echo esc_html( get_the_excerpt( $id ) ); ?></p>
				</div>
			</li>
		<?php endforeach; ?>
	</ul>
</div>
