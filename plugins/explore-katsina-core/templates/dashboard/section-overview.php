<?php
/**
 * Overview.
 *
 * @var array $b
 * @var array $sections
 */
use EK\Analytics;
use EK\Dashboard;
use EK\Money;
use EK\Ranking;

defined( 'ABSPATH' ) || exit;

$a     = Analytics::summary( $b['id'], 30 );
$money = Money::summary( $b['id'] );
$tips  = Ranking::tips( $b['id'] );
$done  = count( array_filter( array_column( $tips, 'done' ) ) );
$pct   = (int) round( 100 * $done / max( 1, count( $tips ) ) );
$rank  = Ranking::current( $b['id'] );
?>
<section aria-labelledby="ov-stats">
	<h2 id="ov-stats" class="ek-visually-hidden"><?php esc_html_e( 'Last 30 days', 'explore-katsina' ); ?></h2>
	<div class="ek-stats">
		<div class="ek-stat"><small><?php esc_html_e( 'Page views (30 days)', 'explore-katsina' ); ?></small><b><?php echo esc_html( number_format_i18n( $a['view'] ) ); ?></b></div>
		<div class="ek-stat"><small><?php esc_html_e( 'WhatsApp & calls (30 days)', 'explore-katsina' ); ?></small><b><?php echo esc_html( number_format_i18n( $a['whatsapp'] + $a['call'] ) ); ?></b></div>
		<div class="ek-stat"><small><?php echo esc_html( $sections['bookings'] ); ?> <?php esc_html_e( '(30 days)', 'explore-katsina' ); ?></small><b><?php echo esc_html( number_format_i18n( $a['bookings'] ) ); ?></b></div>
		<div class="ek-stat ek-stat--accent"><small><?php esc_html_e( 'Available to pay out', 'explore-katsina' ); ?></small><b><?php echo esc_html( Money::format( $money['requestable'] ) ); ?></b></div>
	</div>
</section>

<div class="ek-grid ek-grid--2">
	<section class="ek-card" aria-labelledby="ov-strength">
		<div class="ek-row ek-row--between"><h2 id="ov-strength" style="margin:0"><?php esc_html_e( 'Profile strength', 'explore-katsina' ); ?></h2><strong class="ek-num"><?php echo (int) $pct; ?>%</strong></div>
		<div class="ek-meter" style="margin:10px 0 14px" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="<?php echo (int) $pct; ?>" aria-label="<?php esc_attr_e( 'Profile strength', 'explore-katsina' ); ?>"><span style="width:<?php echo (int) $pct; ?>%"></span></div>
		<ul class="ek-checklist">
			<?php foreach ( array_slice( $tips, 0, 4 ) as $t ) : ?>
				<li class="<?php echo $t['done'] ? 'is-done' : ''; ?>"><?php echo esc_html( $t['label'] ); ?></li>
			<?php endforeach; ?>
		</ul>
		<p style="margin:12px 0 0"><a href="<?php echo esc_url( Dashboard::url( 'ranking', $b['id'] ) ); ?>"><?php esc_html_e( 'See all tips', 'explore-katsina' ); ?></a></p>
	</section>
	<section class="ek-card" aria-labelledby="ov-rank">
		<h2 id="ov-rank"><?php esc_html_e( 'Your ranking', 'explore-katsina' ); ?></h2>
		<?php if ( $rank && $rank->rank_state ) : ?>
			<p class="ek-display" style="font-size:1.6rem;margin:0">#<?php echo (int) $rank->rank_state; ?> <span class="ek-muted" style="font-size:1rem"><?php /* translators: %d: total */ printf( esc_html__( 'of %d', 'explore-katsina' ), (int) $rank->total_state ); ?></span></p>
		<?php else : ?>
			<p><strong><?php esc_html_e( 'New: not yet ranked', 'explore-katsina' ); ?></strong></p>
			<p class="ek-muted ek-small"><?php esc_html_e( 'You receive a rank number once you have enough verified reviews from real guests. Paid plans never change rank numbers.', 'explore-katsina' ); ?></p>
		<?php endif; ?>
		<a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( Dashboard::url( 'ranking', $b['id'] ) ); ?>"><?php esc_html_e( 'How ranking works', 'explore-katsina' ); ?></a>
	</section>
</div>

<nav class="ek-tiles" aria-label="<?php esc_attr_e( 'Quick links', 'explore-katsina' ); ?>">
	<?php
	$desc = array(
		'profile'   => __( 'Name, contacts, hours, map pin', 'explore-katsina' ),
		'photos'    => __( 'Add, reorder, choose cover', 'explore-katsina' ),
		'bookings'  => __( 'See and manage requests', 'explore-katsina' ),
		'earnings'  => __( 'Earned, commission, on hold', 'explore-katsina' ),
		'payouts'   => __( 'Request a payout, bank details', 'explore-katsina' ),
		'invoices'  => __( 'Commission invoices', 'explore-katsina' ),
		'reviews'   => __( 'Read and reply', 'explore-katsina' ),
		'analytics' => __( 'Views, taps, bookings, revenue', 'explore-katsina' ),
	);
	foreach ( $desc as $key => $text ) :
		?>
		<a class="ek-tile" href="<?php echo esc_url( Dashboard::url( $key, $b['id'] ) ); ?>"><strong><?php echo esc_html( $sections[ $key ] ); ?></strong><span><?php echo esc_html( $text ); ?></span></a>
	<?php endforeach; ?>
</nav>
