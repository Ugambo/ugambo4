<?php
/**
 * Restaurant part of the public business page: details, reservation widget, full menu,
 * and (only when switched on) online ordering.
 *
 * @var array $b
 */
use EK\Availability;
use EK\Install;
use EK\Menu;
use EK\Money;
use EK\Restaurant;
use EK\Slots;

defined( 'ABSPATH' ) || exit;

$s      = Restaurant::settings( $b['id'] );
$cuis   = Restaurant::cuisines();
$levels = Restaurant::price_levels();
$menu   = Menu::full( $b['id'] );
$order  = Restaurant::ordering_open( $b['id'] );
$tz     = Availability::tz();
$today  = Availability::today();
$date   = isset( $_GET['date'] ) && Availability::valid_date( sanitize_text_field( wp_unslash( $_GET['date'] ) ) ) ? sanitize_text_field( wp_unslash( $_GET['date'] ) ) : $today; // phpcs:ignore
$party  = max( 1, min( 200, absint( $_GET['party'] ?? 2 ) ) ); // phpcs:ignore
$slots  = $s['res_enabled'] ? Slots::for_day( $b['id'], $date ) : array();
$units  = Slots::units( $b['id'], $party );
$dep    = Restaurant::deposit_for( $b['id'], $party );
$last   = ( new DateTimeImmutable( 'now', $tz ) )->modify( '+' . (int) $s['days_ahead'] . ' days' )->format( 'Y-m-d' );
?>
<div class="ek-row" style="gap:6px">
	<span class="ek-price-level" title="<?php echo esc_attr( $levels[ $s['price_level'] ][1] ); ?>"><?php echo esc_html( $levels[ $s['price_level'] ][0] ); ?></span>
	<?php foreach ( $s['cuisines'] as $c ) : ?><span class="ek-pill"><?php echo esc_html( $cuis[ $c ] ); ?></span><?php endforeach; ?>
	<?php if ( $s['halal'] ) : ?><span class="ek-pill ek-pill--ok"><?php esc_html_e( 'Halal', 'explore-katsina' ); ?></span><?php endif; ?>
	<?php if ( $s['dine_in'] ) : ?><span class="ek-pill"><?php esc_html_e( 'Dine-in', 'explore-katsina' ); ?></span><?php endif; ?>
	<?php if ( $s['takeaway'] ) : ?><span class="ek-pill"><?php esc_html_e( 'Takeaway', 'explore-katsina' ); ?></span><?php endif; ?>
	<?php if ( $s['delivery'] ) : ?><span class="ek-pill"><?php esc_html_e( 'Delivers', 'explore-katsina' ); ?></span><?php endif; ?>
</div>

<?php if ( $s['res_enabled'] ) : ?>
<section class="ek-card ek-stack" id="reserve" aria-labelledby="res-h">
	<h2 id="res-h" style="margin:0"><?php esc_html_e( 'Reserve a table', 'explore-katsina' ); ?></h2>
	<form class="ek-dates ek-dates--res" method="get" action="<?php echo esc_url( get_permalink( $b['id'] ) . '#reserve' ); ?>">
		<div class="ek-field"><label for="rs-date"><?php esc_html_e( 'Date', 'explore-katsina' ); ?></label><input type="date" id="rs-date" name="date" min="<?php echo esc_attr( $today ); ?>" max="<?php echo esc_attr( $last ); ?>" value="<?php echo esc_attr( $date ); ?>" required></div>
		<div class="ek-field"><label for="rs-party"><?php esc_html_e( 'People', 'explore-katsina' ); ?></label><input type="number" id="rs-party" name="party" min="1" max="200" value="<?php echo (int) $party; ?>"></div>
		<button class="ek-btn" type="submit"><?php esc_html_e( 'Find a time', 'explore-katsina' ); ?></button>
	</form>
	<?php if ( $party > $s['max_party'] ) : ?>
		<p class="ek-notice ek-notice--warn" style="margin:0"><?php /* translators: %d: max */ printf( esc_html__( 'Online reservations are for up to %d people. For a bigger group, please call or WhatsApp the restaurant.', 'explore-katsina' ), (int) $s['max_party'] ); ?></p>
	<?php elseif ( ! $slots ) : ?>
		<p class="ek-muted" style="margin:0"><?php esc_html_e( 'No reservation times on this date. Please choose another date.', 'explore-katsina' ); ?></p>
	<?php else : ?>
		<p class="ek-small" style="margin:0"><?php /* translators: 1: date, 2: people */ printf( esc_html__( 'Times on %1$s for %2$d:', 'explore-katsina' ), esc_html( wp_date( 'l j F', strtotime( $date ) ) ), (int) $party ); ?></p>
		<div class="ek-slotgrid">
			<?php foreach ( $slots as $sl ) : ?>
				<?php if ( $sl['available'] >= $units ) : ?>
					<a class="ek-slot" href="<?php echo esc_url( add_query_arg( array( 'reserve' => $b['id'], 'date' => $date, 'time' => $sl['time'], 'party' => $party ), Install::page_url( 'book' ) ) ); ?>"><?php echo esc_html( $sl['time'] ); ?></a>
				<?php else : ?>
					<span class="ek-slot is-full" aria-label="<?php echo esc_attr( $sl['time'] . ' ' . __( 'fully booked', 'explore-katsina' ) ); ?>"><?php echo esc_html( $sl['time'] ); ?><small><?php esc_html_e( 'Full', 'explore-katsina' ); ?></small></span>
				<?php endif; ?>
			<?php endforeach; ?>
		</div>
		<?php if ( $dep ) : ?><p class="ek-small" style="margin:0"><?php /* translators: %s: amount */ printf( esc_html__( 'Groups this size pay a deposit of %s online, deducted from the bill.', 'explore-katsina' ), esc_html( Money::format( $dep ) ) ); ?></p><?php endif; ?>
	<?php endif; ?>
</section>
<?php endif; ?>

<section class="ek-stack" id="menu" aria-labelledby="menu-h">
	<h2 id="menu-h" style="margin:0"><?php esc_html_e( 'Menu', 'explore-katsina' ); ?></h2>
	<?php if ( ! $menu ) : ?>
		<p class="ek-muted"><?php esc_html_e( 'The menu has not been added yet.', 'explore-katsina' ); ?></p>
	<?php else : ?>
		<?php if ( count( $menu ) > 1 ) : ?>
			<nav class="ek-menu-nav" aria-label="<?php esc_attr_e( 'Menu categories', 'explore-katsina' ); ?>"><?php foreach ( $menu as $cat ) : ?><a href="#menu-<?php echo (int) $cat->id; ?>"><?php echo esc_html( $cat->name ); ?></a><?php endforeach; ?></nav>
		<?php endif; ?>
		<?php if ( $order ) : ?><form method="post" action="<?php echo esc_url( add_query_arg( 'order', $b['id'], Install::page_url( 'book' ) ) ); ?>" class="ek-stack" data-ek-order-form><input type="hidden" name="ek_action" value="order_start"><?php endif; ?>
		<?php foreach ( $menu as $cat ) : if ( ! $cat->items ) { continue; } ?>
			<div class="ek-menu-cat" id="menu-<?php echo (int) $cat->id; ?>">
				<h3><?php echo esc_html( $cat->name ); ?></h3>
				<ul class="ek-menu-items">
					<?php foreach ( $cat->items as $it ) : ?>
						<li class="ek-menu-item<?php echo $it->available ? '' : ' is-soldout'; ?>">
							<?php if ( $it->photo_id ) { echo wp_get_attachment_image( (int) $it->photo_id, 'thumbnail', false, array( 'class' => 'ek-menu-img', 'loading' => 'lazy', 'alt' => '' ) ); } // phpcs:ignore ?>
							<div class="ek-menu-text">
								<span class="ek-menu-name"><?php echo esc_html( $it->name ); ?></span>
								<?php if ( $it->description ) : ?><span class="ek-small ek-muted"><?php echo esc_html( $it->description ); ?></span><?php endif; ?>
							</div>
							<span class="ek-menu-price"><?php echo $it->available ? esc_html( Money::format( $it->price_kobo ) ) : '<span class="ek-pill ek-pill--bad">' . esc_html__( 'Sold out', 'explore-katsina' ) . '</span>'; ?></span>
							<?php if ( $order && $it->available ) : ?>
								<label class="ek-qty"><span class="ek-visually-hidden"><?php /* translators: %s: dish */ printf( esc_html__( 'Quantity of %s', 'explore-katsina' ), esc_html( $it->name ) ); ?></span><input type="number" name="items[<?php echo (int) $it->id; ?>]" min="0" max="50" value="0" data-price="<?php echo (int) $it->price_kobo; ?>"></label>
							<?php endif; ?>
						</li>
					<?php endforeach; ?>
				</ul>
			</div>
		<?php endforeach; ?>
		<?php if ( $order ) : ?>
			<div class="ek-order-bar"><span data-ek-order-total><?php esc_html_e( 'Choose quantities above', 'explore-katsina' ); ?></span><button class="ek-btn" type="submit"><?php esc_html_e( 'Continue to order', 'explore-katsina' ); ?></button></div>
			</form>
		<?php endif; ?>
		<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Prices are set by the restaurant and may change.', 'explore-katsina' ); ?></p>
	<?php endif; ?>
</section>
