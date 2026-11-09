<?php
/**
 * Restaurant details: cuisine, price range, halal, dine-in / takeaway / delivery.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Restaurant;
use EK\Restaurant_Dashboard;
use EK\View;

defined( 'ABSPATH' ) || exit;

$errors = 'details' === Restaurant_Dashboard::$group ? Restaurant_Dashboard::$errors : array();
$s      = $errors ? Restaurant::validate( 'details', Restaurant_Dashboard::$values, Restaurant::settings( $b['id'] ) )[0] : Restaurant::settings( $b['id'] );
?>
<form class="ek-stack" method="post" novalidate>
	<?php echo Dashboard::nonce_fields( 'dash_restaurant', $b['id'] ); // phpcs:ignore ?>
	<input type="hidden" name="group" value="details">
	<section class="ek-card ek-stack" aria-labelledby="r-cuis">
		<h2 id="r-cuis" style="margin:0"><?php esc_html_e( 'Type of food', 'explore-katsina' ); ?></h2>
		<div class="<?php echo esc_attr( View::field_class( $errors, 'cuisines' ) ); ?>">
			<div class="ek-checkgrid">
				<?php foreach ( Restaurant::cuisines() as $k => $label ) : ?>
					<label class="ek-check"><input type="checkbox" name="cuisines[]" value="<?php echo esc_attr( $k ); ?>" <?php checked( in_array( $k, $s['cuisines'], true ) ); ?>> <?php echo esc_html( $label ); ?></label>
				<?php endforeach; ?>
			</div>
			<?php echo View::error( $errors, 'cuisines' ); // phpcs:ignore ?>
		</div>
	</section>
	<section class="ek-card ek-stack" aria-labelledby="r-price">
		<h2 id="r-price" style="margin:0"><?php esc_html_e( 'Price range', 'explore-katsina' ); ?></h2>
		<div class="ek-choices">
			<?php foreach ( Restaurant::price_levels() as $lvl => $pl ) : ?>
				<label class="ek-choice"><input type="radio" name="price_level" value="<?php echo (int) $lvl; ?>" <?php checked( $s['price_level'], $lvl ); ?>><span><strong><?php echo esc_html( $pl[0] ); ?></strong> · <?php echo esc_html( $pl[1] ); ?></span></label>
			<?php endforeach; ?>
		</div>
	</section>
	<section class="ek-card ek-stack" aria-labelledby="r-serv">
		<h2 id="r-serv" style="margin:0"><?php esc_html_e( 'Service', 'explore-katsina' ); ?></h2>
		<label class="ek-check"><input type="checkbox" name="halal" value="1" <?php checked( $s['halal'] ); ?>> <?php esc_html_e( 'All food is halal', 'explore-katsina' ); ?></label>
		<label class="ek-check"><input type="checkbox" name="dine_in" value="1" <?php checked( $s['dine_in'] ); ?>> <?php esc_html_e( 'Dine-in', 'explore-katsina' ); ?></label>
		<label class="ek-check"><input type="checkbox" name="takeaway" value="1" <?php checked( $s['takeaway'] ); ?>> <?php esc_html_e( 'Takeaway', 'explore-katsina' ); ?></label>
		<label class="ek-check"><input type="checkbox" name="delivery" value="1" <?php checked( $s['delivery'] ); ?>> <?php esc_html_e( 'We deliver (by phone or WhatsApp)', 'explore-katsina' ); ?></label>
	</section>
	<div><button class="ek-btn" type="submit"><?php esc_html_e( 'Save restaurant details', 'explore-katsina' ); ?></button></div>
</form>
