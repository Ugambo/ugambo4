<?php
/**
 * Dashboard layout.
 *
 * @var int    $uid
 * @var array  $b        Business profile.
 * @var string $section
 * @var array  $sections
 * @var array  $mine     Businesses owned by the user.
 * @var string $flashes
 * @var array  $form
 */
use EK\Business;
use EK\Dashboard;
use EK\Install;
use EK\Log;
use EK\Post_Types;

defined( 'ABSPATH' ) || exit;

$types   = Business::types();
$is_live = 'publish' === $b['status'];
?>
<div class="ek ek-app">
	<a class="ek-visually-hidden" href="#main"><?php esc_html_e( 'Skip to content', 'explore-katsina' ); ?></a>
	<header class="ek-app-top">
		<div class="ek-app-top-inner">
			<a class="ek-brand" href="<?php echo esc_url( Dashboard::url( 'overview', $b['id'] ) ); ?>">EXPLORE KATSINA <span><?php esc_html_e( 'Business', 'explore-katsina' ); ?></span></a>
			<div class="ek-top-actions">
				<?php if ( count( $mine ) > 1 ) : ?>
					<form class="ek-switch" method="get" action="<?php echo esc_url( Install::page_url( 'dashboard' ) ); ?>">
						<label class="ek-visually-hidden" for="ek-switch"><?php esc_html_e( 'Choose business', 'explore-katsina' ); ?></label>
						<select id="ek-switch" name="business" onchange="this.form.submit()">
							<?php foreach ( $mine as $m ) : ?>
								<option value="<?php echo (int) $m->ID; ?>" <?php selected( (int) $m->ID, (int) $b['id'] ); ?>><?php echo esc_html( $m->post_title ); ?></option>
							<?php endforeach; ?>
						</select>
						<noscript><button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'Go', 'explore-katsina' ); ?></button></noscript>
					</form>
				<?php endif; ?>
				<a href="<?php echo esc_url( wp_logout_url( home_url( '/' ) ) ); ?>"><?php esc_html_e( 'Log out', 'explore-katsina' ); ?></a>
			</div>
		</div>
	</header>

	<div class="ek-app-layout">
		<nav class="ek-app-tabs" aria-label="<?php esc_attr_e( 'Dashboard sections', 'explore-katsina' ); ?>">
			<ul>
				<?php foreach ( $sections as $key => $label ) : ?>
					<li><a href="<?php echo esc_url( Dashboard::url( $key, $b['id'] ) ); ?>"<?php echo $key === $section ? ' aria-current="page"' : ''; ?>><?php echo esc_html( $label ); ?></a></li>
				<?php endforeach; ?>
			</ul>
		</nav>

		<main class="ek-app-main" id="main" tabindex="-1">
			<div class="ek-page-head">
				<div>
					<p class="ek-eyebrow" style="margin:0 0 4px"><?php echo esc_html( $types[ $b['type'] ]['label'] ?? '' ); ?> · <?php echo esc_html( $b['lga'] ); ?></p>
					<h1><?php echo esc_html( $b['name'] ); ?></h1>
				</div>
				<div class="ek-status-bar">
					<span class="ek-pill ek-pill--<?php echo esc_attr( $b['status'] ); ?>"><?php echo esc_html( Business::status_label( $b['status'] ) ); ?></span>
					<?php if ( $b['verified'] ) : ?><span class="ek-badge ek-badge--verified">✓ <?php esc_html_e( 'Verified', 'explore-katsina' ); ?></span><?php endif; ?>
					<?php if ( $is_live ) : ?><a class="ek-btn ek-btn--ghost ek-btn--sm" href="<?php echo esc_url( $b['url'] ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'View my listing', 'explore-katsina' ); ?></a><?php endif; ?>
				</div>
			</div>

			<div class="ek-stack">
				<?php echo $flashes; // phpcs:ignore WordPress.Security.EscapeOutput ?>

				<?php if ( 'pending' === $b['status'] ) : ?>
					<div class="ek-notice ek-notice--warn"><?php esc_html_e( 'Your business is waiting for approval. Visitors cannot see it yet. You can keep improving your profile and photos in the meantime.', 'explore-katsina' ); ?></div>
				<?php elseif ( Post_Types::STATUS_REJECTED === $b['status'] ) : ?>
					<?php
					$last   = Log::for_object( 'business', $b['id'], 20 );
					$reason = '';
					foreach ( $last as $l ) {
						if ( 'business_rejected' === $l->action ) {
							$reason = $l->reason;
							break;
						}
					}
					?>
					<div class="ek-notice ek-notice--error">
						<strong><?php esc_html_e( 'Your listing was not approved yet.', 'explore-katsina' ); ?></strong>
						<?php if ( $reason ) : ?><br><?php echo esc_html__( 'Reason:', 'explore-katsina' ) . ' ' . esc_html( $reason ); ?><?php endif; ?>
						<form method="post" style="margin-top:10px">
							<?php echo Dashboard::nonce_fields( 'dash_resubmit', $b['id'] ); // phpcs:ignore ?>
							<button class="ek-btn ek-btn--sm" type="submit"><?php esc_html_e( 'I have fixed it: resubmit for approval', 'explore-katsina' ); ?></button>
						</form>
					</div>
				<?php elseif ( Post_Types::STATUS_PAUSED === $b['status'] ) : ?>
					<div class="ek-notice ek-notice--warn"><?php esc_html_e( 'Your listing is paused and hidden from visitors. Check your invoices or contact us.', 'explore-katsina' ); ?></div>
				<?php endif; ?>

				<?php
				$file = EK_DIR . 'templates/dashboard/section-' . $section . '.php';
				if ( is_readable( $file ) ) {
					include $file;
				}
				?>
			</div>
		</main>
	</div>
	<footer class="ek-app-foot">© <?php echo esc_html( gmdate( 'Y' ) ); ?> Explore Katsina · <?php esc_html_e( 'Need help?', 'explore-katsina' ); ?> info@explorekatsina.com.ng <span class="ek-muted">(<?php esc_html_e( 'placeholder', 'explore-katsina' ); ?>)</span></footer>
</div>
