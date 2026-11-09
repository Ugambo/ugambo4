<?php
/**
 * Top 10 list.
 *
 * @var string        $type
 * @var \WP_Term|null $lga
 * @var array         $rows Ranking rows.
 */
use EK\Business;
use EK\Install;
use EK\Map_Index;
use EK\Ranking;
use EK\Reviews;
use EK\Settings;
use EK\Top;
use EK\View;

defined( 'ABSPATH' ) || exit;
$col    = $lga ? 'rank_lga' : 'rank_state';
$labels = Ranking::badge_labels();
$lgas   = get_terms( array( 'taxonomy' => \EK\Post_Types::TAX_LGA, 'hide_empty' => false, 'orderby' => 'name' ) );
$others = array( 'hotel' => __( 'Top hotels', 'explore-katsina' ), 'restaurant' => __( 'Top restaurants', 'explore-katsina' ), 'event-centre' => __( 'Top event centres', 'explore-katsina' ) );
?>
<div class="ek ek-top">
	<h1 style="margin:0"><?php echo esc_html( ucfirst( Top::heading( $type, $lga ) ) ); ?></h1>
	<p class="ek-muted" style="margin:0"><?php esc_html_e( 'Ranked by verified reviews from real bookings, recent experiences, completed bookings and how quickly each place responds. Places cannot pay to move up.', 'explore-katsina' ); ?></p>
	<form class="ek-top-nav" method="get" onsubmit="if(this.lga.value){window.location=<?php echo esc_attr( wp_json_encode( trailingslashit( Top::url( $type ) ) ) ); ?>+this.lga.value+'/';return false}">
		<div class="ek-field" style="margin:0"><label for="top-lga"><?php esc_html_e( 'Choose an LGA', 'explore-katsina' ); ?></label>
			<select id="top-lga" name="lga"><option value=""><?php esc_html_e( 'All of Katsina State', 'explore-katsina' ); ?></option><?php foreach ( (array) $lgas as $t ) : ?><option value="<?php echo esc_attr( $t->slug ); ?>" <?php selected( $lga && $lga->term_id === $t->term_id ); ?>><?php echo esc_html( $t->name ); ?></option><?php endforeach; ?></select></div>
		<button class="ek-btn ek-btn--night" type="submit"><?php esc_html_e( 'Show', 'explore-katsina' ); ?></button>
		<?php if ( $lga ) : ?><a href="<?php echo esc_url( Top::url( $type ) ); ?>"><?php esc_html_e( 'Whole state', 'explore-katsina' ); ?></a><?php endif; ?>
	</form>
	<?php if ( ! $rows ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No ranked places yet', 'explore-katsina' ); ?></strong><?php /* translators: %d: reviews */ printf( esc_html__( 'A place gets a rank number after %d verified reviews. Check back soon, or browse everything on the Katsina Map.', 'explore-katsina' ), (int) Settings::get( 'min_reviews_for_rank' ) ); ?> <a href="<?php echo esc_url( add_query_arg( 'type', $type, Install::page_url( 'map' ) ) ); ?>"><?php esc_html_e( 'Open the map', 'explore-katsina' ); ?></a></div>
	<?php else : ?>
		<ol class="ek-top-list">
			<?php foreach ( $rows as $r ) : $p = Business::profile( (int) $r->business_id ); $st = Reviews::stats( (int) $r->business_id ); ?>
				<li class="ek-top-item">
					<span class="ek-top-num" aria-label="<?php esc_attr_e( 'Rank', 'explore-katsina' ); ?>">#<?php echo (int) $r->$col; ?></span>
					<a href="<?php echo esc_url( $p['url'] ); ?>" tabindex="-1" aria-hidden="true"><?php echo ! empty( $p['photos'][0] ) ? wp_get_attachment_image( (int) $p['photos'][0], 'medium', false, array( 'alt' => '', 'loading' => 'lazy' ) ) : '<span class="ek-top-ph"></span>'; // phpcs:ignore ?></a>
					<div class="ek-stack" style="gap:4px;min-width:0">
						<h3><a href="<?php echo esc_url( $p['url'] ); ?>"><?php echo esc_html( $p['name'] ); ?></a></h3>
						<p class="ek-small" style="margin:0"><?php echo View::stars( $st['overall'] ); // phpcs:ignore ?> <strong><?php echo esc_html( number_format_i18n( $st['overall'], 1 ) ); ?></strong> <span class="ek-muted">(<?php /* translators: %d: count */ printf( esc_html( _n( '%d verified review', '%d verified reviews', $st['count'], 'explore-katsina' ) ), (int) $st['count'] ); ?>) · <?php echo esc_html( $p['lga'] ); ?></span></p>
						<p class="ek-rankline">
							<?php if ( $lga ) : ?><span class="ek-rank"><?php echo esc_html( __( 'Statewide:', 'explore-katsina' ) . ' ' . Ranking::label( $r, $type ) ); ?></span><?php endif; ?>
							<?php foreach ( Ranking::badges( $r ) as $bd ) : ?><span class="ek-badge ek-badge--<?php echo esc_attr( $bd ); ?>"><?php echo esc_html( $labels[ $bd ] ?? $bd ); ?></span><?php endforeach; ?>
							<?php if ( Map_Index::is_featured( (int) $r->business_id ) ) : ?><span class="ek-badge ek-badge--featured"><?php esc_html_e( 'Featured', 'explore-katsina' ); ?></span><?php endif; ?>
						</p>
					</div>
				</li>
			<?php endforeach; ?>
		</ol>
	<?php endif; ?>
	<details class="ek-card">
		<summary><strong><?php esc_html_e( 'How we rank', 'explore-katsina' ); ?></strong></summary>
		<?php echo View::render( 'partials/ranking-explained' ); // phpcs:ignore ?>
	</details>
	<p class="ek-small"><?php foreach ( $others as $k => $label ) { if ( $k !== $type ) { echo '<a href="' . esc_url( Top::url( $k ) ) . '">' . esc_html( $label ) . '</a> · '; } } ?><a href="<?php echo esc_url( Install::page_url( 'map' ) ); ?>"><?php esc_html_e( 'Katsina Map', 'explore-katsina' ); ?></a></p>
</div>
