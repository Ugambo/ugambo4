<?php
/**
 * Menu builder: categories and dishes.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Menu;
use EK\Money;

defined( 'ABSPATH' ) || exit;

$menu = Menu::full( $b['id'] );
$nf   = static fn( $op, $id = 0 ) => Dashboard::nonce_fields( 'dash_menu', $b['id'] ) . '<input type="hidden" name="op" value="' . esc_attr( $op ) . '"><input type="hidden" name="id" value="' . (int) $id . '">';
$item_form = static function ( $cat_id, $item = null ) use ( $nf ) {
	ob_start();
	$uid = $item ? 'e' . (int) $item->id : 'n' . (int) $cat_id;
	?>
	<form method="post" enctype="multipart/form-data" class="ek-stack ek-itemform">
		<?php echo $nf( 'save_item', $item ? $item->id : 0 ); // phpcs:ignore ?>
		<input type="hidden" name="category_id" value="<?php echo (int) $cat_id; ?>">
		<div class="ek-grid ek-grid--2">
			<div class="ek-field"><label for="in-<?php echo esc_attr( $uid ); ?>"><?php esc_html_e( 'Dish name', 'explore-katsina' ); ?></label><input type="text" id="in-<?php echo esc_attr( $uid ); ?>" name="item_name" required maxlength="120" value="<?php echo esc_attr( $item->name ?? '' ); ?>"></div>
			<div class="ek-field"><label for="ip-<?php echo esc_attr( $uid ); ?>"><?php esc_html_e( 'Price (₦)', 'explore-katsina' ); ?></label><input type="text" id="ip-<?php echo esc_attr( $uid ); ?>" name="item_price" inputmode="numeric" required value="<?php echo $item ? esc_attr( number_format( $item->price_kobo / 100 ) ) : ''; ?>"></div>
		</div>
		<div class="ek-field"><label for="id-<?php echo esc_attr( $uid ); ?>"><?php esc_html_e( 'Description (optional)', 'explore-katsina' ); ?></label><input type="text" id="id-<?php echo esc_attr( $uid ); ?>" name="item_description" maxlength="500" value="<?php echo esc_attr( $item->description ?? '' ); ?>"></div>
		<div class="ek-field"><label for="iph-<?php echo esc_attr( $uid ); ?>"><?php echo $item && $item->photo_id ? esc_html__( 'Replace photo (optional)', 'explore-katsina' ) : esc_html__( 'Photo (optional)', 'explore-katsina' ); ?></label><input type="file" id="iph-<?php echo esc_attr( $uid ); ?>" name="item_photo" accept="image/jpeg,image/png,image/webp"></div>
		<label class="ek-check"><input type="checkbox" name="available" value="1" <?php checked( ! $item || $item->available ); ?>> <?php esc_html_e( 'Available today', 'explore-katsina' ); ?></label>
		<div><button class="ek-btn ek-btn--sm" type="submit"><?php echo $item ? esc_html__( 'Save dish', 'explore-katsina' ) : esc_html__( 'Add dish', 'explore-katsina' ); ?></button></div>
	</form>
	<?php
	return ob_get_clean();
};
?>
<section class="ek-card ek-stack" aria-labelledby="m-add">
	<h2 id="m-add" style="margin:0"><?php esc_html_e( 'Menu', 'explore-katsina' ); ?></h2>
	<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Group dishes into categories, e.g. Rice dishes, Soups & Swallow, Grills, Drinks. Tap "Sold out" when a dish runs out; it stays on your menu but can’t be ordered.', 'explore-katsina' ); ?></p>
	<form method="post" class="ek-row">
		<?php echo $nf( 'add_cat' ); // phpcs:ignore ?>
		<label class="ek-visually-hidden" for="m-cat"><?php esc_html_e( 'New category name', 'explore-katsina' ); ?></label>
		<input type="text" id="m-cat" name="cat_name" placeholder="<?php esc_attr_e( 'New category, e.g. Rice dishes', 'explore-katsina' ); ?>" maxlength="100" style="flex:1 1 220px;width:auto">
		<button class="ek-btn" type="submit">+ <?php esc_html_e( 'Add category', 'explore-katsina' ); ?></button>
	</form>
</section>

<?php if ( ! $menu ) : ?>
	<div class="ek-empty"><strong><?php esc_html_e( 'Your menu is empty', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Add your first category above, then add dishes to it.', 'explore-katsina' ); ?></div>
<?php endif; ?>

<?php foreach ( $menu as $ci => $cat ) : ?>
	<section class="ek-card ek-stack ek-menucat" id="cat-<?php echo (int) $cat->id; ?>" aria-labelledby="ch-<?php echo (int) $cat->id; ?>">
		<div class="ek-row ek-row--between">
			<h3 id="ch-<?php echo (int) $cat->id; ?>" style="margin:0"><?php echo esc_html( $cat->name ); ?> <span class="ek-small ek-muted">(<?php echo count( $cat->items ); ?>)</span></h3>
			<div class="ek-row" style="gap:6px">
				<form method="post"><?php echo $nf( 'cat_up', $cat->id ); // phpcs:ignore ?><button class="ek-iconbtn" type="submit" aria-label="<?php esc_attr_e( 'Move category up', 'explore-katsina' ); ?>" <?php disabled( 0 === $ci ); ?>>↑</button></form>
				<form method="post"><?php echo $nf( 'cat_down', $cat->id ); // phpcs:ignore ?><button class="ek-iconbtn" type="submit" aria-label="<?php esc_attr_e( 'Move category down', 'explore-katsina' ); ?>" <?php disabled( count( $menu ) - 1 === $ci ); ?>>↓</button></form>
				<details class="ek-pop-details"><summary class="ek-iconbtn" aria-label="<?php esc_attr_e( 'Rename category', 'explore-katsina' ); ?>">✎</summary>
					<form method="post" class="ek-row" style="margin-top:8px"><?php echo $nf( 'rename_cat', $cat->id ); // phpcs:ignore ?><input type="text" name="cat_name" value="<?php echo esc_attr( $cat->name ); ?>" aria-label="<?php esc_attr_e( 'Category name', 'explore-katsina' ); ?>" style="width:auto;flex:1"><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Rename', 'explore-katsina' ); ?></button></form>
					<?php if ( ! $cat->items ) : ?><form method="post" style="margin-top:8px"><?php echo $nf( 'delete_cat', $cat->id ); // phpcs:ignore ?><button class="ek-link-btn" type="submit" data-ek-confirm="<?php esc_attr_e( 'Tap again to delete', 'explore-katsina' ); ?>"><?php esc_html_e( 'Delete empty category', 'explore-katsina' ); ?></button></form><?php endif; ?>
				</details>
			</div>
		</div>
		<?php if ( $cat->items ) : ?>
			<ul class="ek-dishes">
				<?php foreach ( $cat->items as $ii => $it ) : ?>
					<li class="ek-dish<?php echo $it->available ? '' : ' is-soldout'; ?>">
						<div class="ek-dish-main">
							<?php echo $it->photo_id ? wp_get_attachment_image( (int) $it->photo_id, 'thumbnail', false, array( 'class' => 'ek-dish-img', 'alt' => '' ) ) : '<span class="ek-dish-img ek-dish-img--none" aria-hidden="true"></span>'; // phpcs:ignore ?>
							<div style="min-width:0">
								<strong><?php echo esc_html( $it->name ); ?></strong> <?php if ( ! $it->available ) : ?><span class="ek-pill ek-pill--bad"><?php esc_html_e( 'Sold out', 'explore-katsina' ); ?></span><?php endif; ?>
								<?php if ( $it->description ) : ?><br><span class="ek-small ek-muted"><?php echo esc_html( $it->description ); ?></span><?php endif; ?>
							</div>
							<span class="ek-num ek-dish-price"><?php echo esc_html( Money::format( $it->price_kobo ) ); ?></span>
						</div>
						<div class="ek-row" style="gap:6px">
							<form method="post"><?php echo $nf( 'toggle', $it->id ); // phpcs:ignore ?><button class="ek-btn ek-btn--sm <?php echo $it->available ? 'ek-btn--ghost' : ''; ?>" type="submit"><?php echo $it->available ? esc_html__( 'Sold out', 'explore-katsina' ) : esc_html__( 'Available again', 'explore-katsina' ); ?></button></form>
							<form method="post"><?php echo $nf( 'item_up', $it->id ); // phpcs:ignore ?><button class="ek-iconbtn" type="submit" aria-label="<?php esc_attr_e( 'Move dish up', 'explore-katsina' ); ?>" <?php disabled( 0 === $ii ); ?>>↑</button></form>
							<form method="post"><?php echo $nf( 'item_down', $it->id ); // phpcs:ignore ?><button class="ek-iconbtn" type="submit" aria-label="<?php esc_attr_e( 'Move dish down', 'explore-katsina' ); ?>" <?php disabled( count( $cat->items ) - 1 === $ii ); ?>>↓</button></form>
							<details class="ek-pop-details"><summary class="ek-btn ek-btn--sm ek-btn--ghost"><?php esc_html_e( 'Edit', 'explore-katsina' ); ?></summary><?php echo $item_form( $cat->id, $it ); // phpcs:ignore ?></details>
							<form method="post"><?php echo $nf( 'delete_item', $it->id ); // phpcs:ignore ?><button class="ek-link-btn" type="submit" data-ek-confirm="<?php esc_attr_e( 'Tap again', 'explore-katsina' ); ?>"><?php esc_html_e( 'Delete', 'explore-katsina' ); ?></button></form>
						</div>
					</li>
				<?php endforeach; ?>
			</ul>
		<?php endif; ?>
		<details class="ek-add-dish"<?php echo $cat->items ? '' : ' open'; ?>>
			<summary class="ek-btn ek-btn--sm"><?php /* translators: %s: category */ printf( esc_html__( '+ Add a dish to %s', 'explore-katsina' ), esc_html( $cat->name ) ); ?></summary>
			<?php echo $item_form( $cat->id ); // phpcs:ignore ?>
		</details>
	</section>
<?php endforeach; ?>
