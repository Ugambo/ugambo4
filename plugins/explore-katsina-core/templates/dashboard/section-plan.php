<?php
/**
 * Plan & Verified badge: current plan, buy/renew Featured or Premium, apply for Verified.
 *
 * @var array $b
 */
use EK\Dashboard;
use EK\Money;
use EK\Plans;
use EK\Services;
use EK\Settings;
use EK\View;

defined( 'ABSPATH' ) || exit;
$cur   = Plans::current( $b['id'] );
$plans = Plans::plans();
$ver   = Services::verification( $b['id'] );
$live  = 'publish' === $b['status'];
$paid  = sanitize_text_field( wp_unslash( $_GET['paid'] ?? '' ) ); // phpcs:ignore
?>
<?php if ( $paid ) : ?><div class="ek-notice ek-notice--ok" role="status"><?php /* translators: %s: code */ printf( esc_html__( 'Payment received (%s). Thank you!', 'explore-katsina' ), esc_html( $paid ) ); ?></div><?php endif; ?>
<section class="ek-card ek-stack" aria-labelledby="pl-h">
	<h2 id="pl-h" style="margin:0"><?php esc_html_e( 'Your plan', 'explore-katsina' ); ?></h2>
	<p class="ek-display" style="font-size:1.4rem;margin:0"><?php echo esc_html( 'basic' === $cur['plan'] ? __( 'Basic (free)', 'explore-katsina' ) : $plans[ $cur['plan'] ]['label'] ); ?></p>
	<?php if ( $cur['until'] ) : ?><p style="margin:0"><?php /* translators: %s: date */ printf( esc_html__( 'Active until %s. We remind you 7 days and 1 day before it ends.', 'explore-katsina' ), '<strong>' . esc_html( wp_date( 'j F Y', $cur['until'] ) ) . '</strong>' ); // phpcs:ignore ?></p><?php endif; ?>
	<p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Plans give extra visibility. They never change your rank number: that comes only from verified reviews, bookings and how quickly you respond.', 'explore-katsina' ); ?></p>
</section>
<div class="ek-grid ek-grid--2">
	<?php foreach ( $plans as $key => $p ) : ?>
		<section class="ek-card ek-stack ek-plan<?php echo $cur['plan'] === $key ? ' is-current' : ''; ?>" aria-labelledby="plan-<?php echo esc_attr( $key ); ?>" style="margin:0">
			<h3 id="plan-<?php echo esc_attr( $key ); ?>" style="margin:0"><?php echo esc_html( $p['label'] ); ?> <?php if ( $cur['plan'] === $key ) : ?><span class="ek-pill ek-pill--ok"><?php esc_html_e( 'Your plan', 'explore-katsina' ); ?></span><?php endif; ?></h3>
			<ul class="ek-checklist" style="margin:0"><?php foreach ( $p['benefits'] as $ben ) : ?><li class="is-done"><?php echo esc_html( $ben ); ?></li><?php endforeach; ?></ul>
			<div class="ek-row">
				<?php foreach ( array( 'month' => __( '1 month', 'explore-katsina' ), 'year' => __( '1 year', 'explore-katsina' ) ) as $per => $plabel ) : ?>
					<form method="post">
						<?php echo Dashboard::nonce_fields( 'dash_plan_buy', $b['id'] ); // phpcs:ignore ?>
						<input type="hidden" name="plan" value="<?php echo esc_attr( $key ); ?>"><input type="hidden" name="period" value="<?php echo esc_attr( $per ); ?>">
						<button class="ek-btn<?php echo 'year' === $per ? ' ek-btn--ghost' : ''; ?>" type="submit" <?php disabled( ! $live ); ?>><?php echo esc_html( sprintf( /* translators: 1: period, 2: price */ __( '%1$s · %2$s', 'explore-katsina' ), $plabel, Money::format( $p[ $per ] ) ) ); ?></button>
					</form>
				<?php endforeach; ?>
			</div>
			<?php if ( 'basic' !== $cur['plan'] && $cur['plan'] !== $key ) : ?><p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'Switching plans starts the new plan today and replaces your current one.', 'explore-katsina' ); ?></p><?php endif; ?>
		</section>
	<?php endforeach; ?>
</div>
<?php if ( ! $live ) : ?><p class="ek-small ek-muted"><?php esc_html_e( 'Plans can be bought once your listing is approved and live.', 'explore-katsina' ); ?></p><?php endif; ?>
<section class="ek-card ek-stack" aria-labelledby="vf-h">
	<h2 id="vf-h" style="margin:0"><?php esc_html_e( 'Verified badge', 'explore-katsina' ); ?></h2>
	<?php if ( $b['verified'] ) : ?>
		<p style="margin:0"><span class="ek-badge ek-badge--verified">✓ <?php esc_html_e( 'Verified', 'explore-katsina' ); ?></span> <?php esc_html_e( 'Your business is Verified.', 'explore-katsina' ); ?></p>
	<?php elseif ( $ver && 'paid' === $ver->status && in_array( $ver->stage, array( '', 'submitted' ), true ) ) : ?>
		<p style="margin:0"><span class="ek-pill"><?php esc_html_e( 'Application being reviewed', 'explore-katsina' ); ?></span> <?php /* translators: %s: date */ printf( esc_html__( 'Paid on %s. We usually check within 5 working days and may call or visit you.', 'explore-katsina' ), esc_html( View::date( $ver->paid_at ) ) ); ?></p>
	<?php else : ?>
		<?php if ( $ver && 'rejected' === $ver->stage ) : ?><p class="ek-notice ek-notice--error" style="margin:0"><?php esc_html_e( 'Your last application was not approved:', 'explore-katsina' ); ?> <?php echo esc_html( $ver->details['stage_note'] ?? '' ); ?></p><?php endif; ?>
		<p style="margin:0"><?php esc_html_e( 'The Verified badge tells visitors our team has checked your ID, registration (CAC, if any) and that your business really is where your pin says. Verified businesses also get a small ranking badge.', 'explore-katsina' ); ?></p>
		<form method="post"><?php echo Dashboard::nonce_fields( 'dash_verify_apply', $b['id'] ); // phpcs:ignore ?><button class="ek-btn ek-btn--night" type="submit" <?php disabled( ! $live ); ?>><?php /* translators: %s: price */ printf( esc_html__( 'Apply for Verified · %s one-time', 'explore-katsina' ), esc_html( Money::format( (int) Settings::get( 'price_verified' ) ) ) ); ?></button></form>
	<?php endif; ?>
</section>
