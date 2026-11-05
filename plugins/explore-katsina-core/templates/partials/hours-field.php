<?php
/**
 * Opening hours field.
 *
 * @var array $v
 * @var array $errors
 */
use EK\Business;
use EK\View;

defined( 'ABSPATH' ) || exit;
$h      = (array) ( $v['hours'] ?? array() );
$always = ! empty( $h['always'] );
?>
<fieldset class="<?php echo esc_attr( View::field_class( $errors, 'hours' ) ); ?>" data-ek-hours style="border:0;padding:0;margin:0">
	<legend class="ek-label"><?php esc_html_e( 'Opening hours', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></legend>
	<label class="ek-check"><input type="checkbox" name="hours[always]" value="1" data-ek-always <?php checked( $always ); ?>> <?php esc_html_e( 'Open 24 hours, every day', 'explore-katsina' ); ?></label>
	<div class="ek-hours" data-ek-hours-days <?php echo $always ? 'hidden' : ''; ?>>
		<?php
		foreach ( Business::day_labels() as $key => $label ) :
			$d      = (array) ( $h[ $key ] ?? array() );
			$closed = ! empty( $d['closed'] );
			$open   = $d['open'] ?? '08:00';
			$close  = $d['close'] ?? '22:00';
			?>
			<div class="ek-hours-row<?php echo $closed ? ' is-closed' : ''; ?>">
				<span class="ek-day"><?php echo esc_html( $label ); ?></span>
				<label><span class="ek-visually-hidden"><?php /* translators: %s: day */ printf( esc_html__( '%s opens', 'explore-katsina' ), esc_html( $label ) ); ?></span><input type="time" name="hours[<?php echo esc_attr( $key ); ?>][open]" value="<?php echo esc_attr( $open ); ?>"></label>
				<label><span class="ek-visually-hidden"><?php /* translators: %s: day */ printf( esc_html__( '%s closes', 'explore-katsina' ), esc_html( $label ) ); ?></span><input type="time" name="hours[<?php echo esc_attr( $key ); ?>][close]" value="<?php echo esc_attr( $close ); ?>"></label>
				<label class="ek-check"><input type="checkbox" name="hours[<?php echo esc_attr( $key ); ?>][closed]" value="1" data-ek-closed <?php checked( $closed ); ?>> <?php esc_html_e( 'Closed', 'explore-katsina' ); ?></label>
			</div>
		<?php endforeach; ?>
		<span class="ek-hint"><?php esc_html_e( 'If you close after midnight, set the closing time on the next morning (e.g. 18:00 – 02:00).', 'explore-katsina' ); ?></span>
	</div>
	<?php echo View::error( $errors, 'hours' ); // phpcs:ignore ?>
</fieldset>
