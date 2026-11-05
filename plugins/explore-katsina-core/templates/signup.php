<?php
/**
 * "List your business" form. Five steps with JavaScript; one long form without it.
 *
 * @var array  $errors
 * @var array  $v
 * @var string $token
 */
use EK\Install;
use EK\Settings;
use EK\View;

defined( 'ABSPATH' ) || exit;

$is_new     = true;
$logged_in  = is_user_logged_in();
$agreement  = Install::page_url( 'agreement' );
$max_photos = (int) Settings::get( 'max_photos_basic' );
$max_mb     = (int) Settings::get( 'max_photo_mb' );
$steps      = array(
	1 => __( 'Business', 'explore-katsina' ),
	2 => __( 'Location', 'explore-katsina' ),
	3 => __( 'Contact & hours', 'explore-katsina' ),
	4 => __( 'Photos & ID', 'explore-katsina' ),
	5 => __( 'Payouts & finish', 'explore-katsina' ),
);
// Which step holds the first error (so the form opens there).
$step_of   = array(
	'name' => 1, 'type' => 1, 'lga_id' => 1, 'description' => 1,
	'address' => 2, 'lat' => 2,
	'phone' => 3, 'whatsapp' => 3, 'email' => 3, 'website' => 3, 'hours' => 3,
	'photos' => 4, 'id_document' => 4, 'owner_name' => 4, 'cac_number' => 4,
);
$start = 1;
foreach ( array_keys( $errors ) as $k ) {
	if ( isset( $step_of[ $k ] ) ) {
		$start = $step_of[ $k ];
		break;
	}
	$start = 5;
}
?>
<div class="ek ek-signup">
	<div class="ek-signup-hero">
		<p class="ek-eyebrow"><?php esc_html_e( 'For hotels, restaurants, event centres and local businesses', 'explore-katsina' ); ?></p>
		<h1><?php esc_html_e( 'List your business on Explore Katsina', 'explore-katsina' ); ?></h1>
		<p><?php esc_html_e( 'Get found by visitors on the Katsina Map, take bookings and reservations online, and manage everything from your own dashboard. Basic listing is free.', 'explore-katsina' ); ?></p>
	</div>

	<?php if ( $errors ) : ?>
		<div class="ek-notice ek-notice--error" role="alert" tabindex="-1" data-ek-error-summary>
			<strong><?php esc_html_e( 'Please check the highlighted fields:', 'explore-katsina' ); ?></strong>
			<ul>
				<?php foreach ( $errors as $msg ) : ?>
					<li><?php echo esc_html( $msg ); ?></li>
				<?php endforeach; ?>
			</ul>
			<?php if ( isset( $errors['photos'] ) || isset( $errors['id_document'] ) || count( $errors ) ) : ?>
				<p class="ek-small" style="margin:.5em 0 0"><?php esc_html_e( 'For your security, photos and ID files must be selected again after a correction.', 'explore-katsina' ); ?></p>
			<?php endif; ?>
		</div>
	<?php endif; ?>

	<form class="ek-card" method="post" enctype="multipart/form-data" novalidate data-ek-steps-form data-start="<?php echo (int) $start; ?>">
		<input type="hidden" name="ek_action" value="signup">
		<input type="hidden" name="ek_t" value="<?php echo esc_attr( $token ); ?>">
		<?php wp_nonce_field( 'ek_signup', '_ek_nonce' ); ?>
		<div class="ek-hp" aria-hidden="true"><label>Company website <input type="text" name="ek_company_hp" tabindex="-1" autocomplete="off"></label></div>

		<ol class="ek-steps" data-ek-step-list aria-label="<?php esc_attr_e( 'Sign-up steps', 'explore-katsina' ); ?>">
			<?php foreach ( $steps as $n => $label ) : ?>
				<li data-step="<?php echo (int) $n; ?>"><?php echo (int) $n . '. ' . esc_html( $label ); ?></li>
			<?php endforeach; ?>
		</ol>

		<section class="ek-step" data-step="1" aria-labelledby="st1">
			<h2 id="st1"><?php esc_html_e( 'About your business', 'explore-katsina' ); ?></h2>
			<?php include EK_DIR . 'templates/partials/basic-fields.php'; ?>
		</section>

		<section class="ek-step" data-step="2" aria-labelledby="st2">
			<h2 id="st2"><?php esc_html_e( 'Where are you?', 'explore-katsina' ); ?></h2>
			<?php include EK_DIR . 'templates/partials/address-field.php'; ?>
			<?php include EK_DIR . 'templates/partials/map-field.php'; ?>
		</section>

		<section class="ek-step" data-step="3" aria-labelledby="st3">
			<h2 id="st3"><?php esc_html_e( 'Contact details & opening hours', 'explore-katsina' ); ?></h2>
			<?php include EK_DIR . 'templates/partials/contact-fields.php'; ?>
			<?php include EK_DIR . 'templates/partials/hours-field.php'; ?>
		</section>

		<section class="ek-step" data-step="4" aria-labelledby="st4">
			<h2 id="st4"><?php esc_html_e( 'Photos and identity', 'explore-katsina' ); ?></h2>
			<div class="<?php echo esc_attr( View::field_class( $errors, 'photos' ) ); ?>">
				<label for="ek-photos"><?php esc_html_e( 'Photos of your business', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
				<div class="ek-drop">
					<input type="file" id="ek-photos" name="photos[]" accept="image/jpeg,image/png,image/webp" multiple required data-ek-preview="ek-photo-previews" data-ek-max-files="<?php echo (int) $max_photos; ?>">
					<p class="ek-hint" style="margin:.5em 0 0">
						<?php
						/* translators: 1: number of photos, 2: MB */
						printf( esc_html__( 'Up to %1$d photos, JPG, PNG or WebP, maximum %2$d MB each. The first photo becomes your cover. Use your own photos only.', 'explore-katsina' ), (int) $max_photos, (int) $max_mb );
						?>
					</p>
					<div class="ek-previews" id="ek-photo-previews"></div>
				</div>
				<?php echo View::error( $errors, 'photos' ); // phpcs:ignore ?>
			</div>

			<div class="ek-grid ek-grid--2">
				<div class="<?php echo esc_attr( View::field_class( $errors, 'owner_name' ) ); ?>">
					<label for="ek-owner"><?php esc_html_e( "Owner's full name", 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
					<input type="text" id="ek-owner" name="owner_name" required autocomplete="name" value="<?php echo esc_attr( $v['owner_name'] ?? '' ); ?>"<?php echo View::aria( $errors, 'owner_name' ); // phpcs:ignore ?>>
					<?php echo View::error( $errors, 'owner_name' ); // phpcs:ignore ?>
				</div>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'cac_number' ) ); ?>">
					<label for="ek-cac"><?php esc_html_e( 'CAC registration number (optional)', 'explore-katsina' ); ?></label>
					<input type="text" id="ek-cac" name="cac_number" placeholder="RC 1234567 / BN 1234567" value="<?php echo esc_attr( $v['cac_number'] ?? '' ); ?>">
					<?php echo View::error( $errors, 'cac_number' ); // phpcs:ignore ?>
				</div>
			</div>

			<div class="<?php echo esc_attr( View::field_class( $errors, 'id_document' ) ); ?>">
				<label for="ek-id"><?php esc_html_e( "Owner's ID", 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
				<input type="file" id="ek-id" name="id_document" accept="image/jpeg,image/png,image/webp,application/pdf" required>
				<span class="ek-hint"><?php esc_html_e( "NIN slip, voter's card, driver's licence or international passport. Only the Explore Katsina team can see it. It is never shown on your listing.", 'explore-katsina' ); ?></span>
				<?php echo View::error( $errors, 'id_document' ); // phpcs:ignore ?>
			</div>
		</section>

		<section class="ek-step" data-step="5" aria-labelledby="st5">
			<h2 id="st5"><?php esc_html_e( 'Payout details & finish', 'explore-katsina' ); ?></h2>
			<p class="ek-muted ek-small"><?php esc_html_e( 'When guests pay online, we send your earnings to this account. The account number is stored encrypted.', 'explore-katsina' ); ?></p>
			<div class="ek-grid ek-grid--2">
				<div class="<?php echo esc_attr( View::field_class( $errors, 'bank_name' ) ); ?>">
					<label for="ek-bank"><?php esc_html_e( 'Bank name', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
					<input type="text" id="ek-bank" name="bank_name" list="ek-banks" required autocomplete="off" value="<?php echo esc_attr( $v['bank_name'] ?? '' ); ?>"<?php echo View::aria( $errors, 'bank_name' ); // phpcs:ignore ?>>
					<datalist id="ek-banks"><?php foreach ( View::banks() as $b ) : ?><option value="<?php echo esc_attr( $b ); ?>"></option><?php endforeach; ?></datalist>
					<?php echo View::error( $errors, 'bank_name' ); // phpcs:ignore ?>
				</div>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'account_number' ) ); ?>">
					<label for="ek-acct"><?php esc_html_e( 'Account number', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
					<input type="text" id="ek-acct" name="account_number" inputmode="numeric" pattern="\d{10}" maxlength="10" required autocomplete="off" value="<?php echo esc_attr( $v['account_number'] ?? '' ); ?>"<?php echo View::aria( $errors, 'account_number' ); // phpcs:ignore ?>>
					<span class="ek-hint"><?php esc_html_e( '10 digits (NUBAN).', 'explore-katsina' ); ?></span>
					<?php echo View::error( $errors, 'account_number' ); // phpcs:ignore ?>
				</div>
				<div class="<?php echo esc_attr( View::field_class( $errors, 'account_name' ) ); ?> ek-span-2">
					<label for="ek-acctname"><?php esc_html_e( 'Account name', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
					<input type="text" id="ek-acctname" name="account_name" required autocomplete="off" value="<?php echo esc_attr( $v['account_name'] ?? '' ); ?>"<?php echo View::aria( $errors, 'account_name' ); // phpcs:ignore ?>>
					<span class="ek-hint"><?php esc_html_e( 'Exactly as your bank shows it.', 'explore-katsina' ); ?></span>
					<?php echo View::error( $errors, 'account_name' ); // phpcs:ignore ?>
				</div>
			</div>

			<?php if ( ! $logged_in ) : ?>
				<div class="ek-card" style="background:var(--ek-sand);border:0">
					<h3><?php esc_html_e( 'Create your login', 'explore-katsina' ); ?></h3>
					<p class="ek-small ek-muted">
						<?php esc_html_e( 'You will use this to open your business dashboard.', 'explore-katsina' ); ?>
						<a href="<?php echo esc_url( wp_login_url( get_permalink() ) ); ?>"><?php esc_html_e( 'Already have an account? Log in', 'explore-katsina' ); ?></a>
					</p>
					<div class="ek-grid ek-grid--2">
						<div class="<?php echo esc_attr( View::field_class( $errors, 'account_email' ) ); ?>">
							<label for="ek-login-email"><?php esc_html_e( 'Login email', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
							<input type="email" id="ek-login-email" name="account_email" required autocomplete="username" value="<?php echo esc_attr( $v['account_email'] ?? '' ); ?>"<?php echo View::aria( $errors, 'account_email' ); // phpcs:ignore ?>>
							<?php echo View::error( $errors, 'account_email' ); // phpcs:ignore ?>
						</div>
						<div class="<?php echo esc_attr( View::field_class( $errors, 'account_password' ) ); ?>">
							<label for="ek-login-pass"><?php esc_html_e( 'Password', 'explore-katsina' ); ?> <span class="ek-req" aria-hidden="true">*</span></label>
							<input type="password" id="ek-login-pass" name="account_password" required minlength="8" autocomplete="new-password"<?php echo View::aria( $errors, 'account_password' ); // phpcs:ignore ?>>
							<span class="ek-hint"><?php esc_html_e( 'At least 8 characters.', 'explore-katsina' ); ?></span>
							<?php echo View::error( $errors, 'account_password' ); // phpcs:ignore ?>
						</div>
					</div>
				</div>
			<?php endif; ?>

			<div class="<?php echo esc_attr( View::field_class( $errors, 'agreement' ) ); ?>">
				<span class="ek-label"><?php esc_html_e( 'Listing & Partner Agreement', 'explore-katsina' ); ?></span>
				<div class="ek-agreement-box" tabindex="0" aria-label="<?php esc_attr_e( 'Agreement summary', 'explore-katsina' ); ?>">
					<p><strong><?php esc_html_e( 'Summary (the full agreement applies):', 'explore-katsina' ); ?></strong></p>
					<ul>
						<li><?php esc_html_e( 'Your details must be true and you must have the right to list this business.', 'explore-katsina' ); ?></li>
						<li><?php esc_html_e( 'Explore Katsina collects online payments and deducts the published commission before paying you.', 'explore-katsina' ); ?></li>
						<li><?php esc_html_e( 'Earnings are held until after the stay or event and released if there is no complaint.', 'explore-katsina' ); ?></li>
						<li><?php esc_html_e( 'For pay-at-venue bookings, commission is invoiced monthly; unpaid invoices can pause your listing.', 'explore-katsina' ); ?></li>
						<li><?php esc_html_e( 'Rankings come from verified reviews and activity. Paid plans never change your rank number.', 'explore-katsina' ); ?></li>
						<li><?php esc_html_e( 'You must honour confirmed bookings, your prices and your cancellation policy.', 'explore-katsina' ); ?></li>
					</ul>
				</div>
				<label class="ek-check">
					<input type="checkbox" name="agreement" value="1" required <?php checked( ! empty( $v['agreement'] ) ); ?><?php echo View::aria( $errors, 'agreement' ); // phpcs:ignore ?>>
					<span>
						<?php
						/* translators: %s: link to agreement */
						printf( wp_kses( __( 'I have read and accept the <a href="%s" target="_blank" rel="noopener">Listing & Partner Agreement</a>, and I confirm the details I have given are true.', 'explore-katsina' ), array( 'a' => array( 'href' => array(), 'target' => array(), 'rel' => array() ) ) ), esc_url( $agreement ) );
						?>
					</span>
				</label>
				<?php echo View::error( $errors, 'agreement' ); // phpcs:ignore ?>
			</div>
		</section>

		<div class="ek-step-nav">
			<button type="button" class="ek-btn ek-btn--ghost" data-ek-prev hidden><?php esc_html_e( 'Back', 'explore-katsina' ); ?></button>
			<button type="button" class="ek-btn" data-ek-next hidden><?php esc_html_e( 'Continue', 'explore-katsina' ); ?></button>
			<button type="submit" class="ek-btn" data-ek-submit><?php esc_html_e( 'Submit for approval', 'explore-katsina' ); ?></button>
		</div>
		<p class="ek-small ek-muted" style="margin:12px 0 0"><?php esc_html_e( 'We review every business before it goes live, usually within 2 working days.', 'explore-katsina' ); ?></p>
	</form>
</div>
