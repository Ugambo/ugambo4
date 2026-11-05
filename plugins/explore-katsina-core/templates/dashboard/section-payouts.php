<?php
/**
 * Payouts + bank details.
 *
 * @var array $b
 * @var int   $uid
 */
use EK\Business;
use EK\Crypto;
use EK\Dashboard;
use EK\Money;
use EK\Settings;
use EK\View;

defined( 'ABSPATH' ) || exit;

$s       = Money::summary( $b['id'] );
$min     = (int) Settings::get( 'min_payout_kobo' );
$bank    = Business::private_details( $b['id'] );
$history = Money::payouts( $b['id'] );
$can     = $s['requestable'] >= $min;
?>
<div class="ek-grid ek-grid--2">
	<section class="ek-card ek-stack" aria-labelledby="po-h">
		<h2 id="po-h" style="margin:0"><?php esc_html_e( 'Request a payout', 'explore-katsina' ); ?></h2>
		<p class="ek-display ek-num" style="font-size:1.6rem;margin:0"><?php echo esc_html( Money::format( $s['requestable'] ) ); ?></p>
		<p class="ek-muted ek-small" style="margin:0">
			<?php
			/* translators: %s: minimum payout */
			printf( esc_html__( 'Available now. Minimum payout is %s. We pay by bank transfer after approval.', 'explore-katsina' ), esc_html( Money::format( $min ) ) );
			?>
		</p>
		<?php if ( $s['pending_payouts'] ) : ?>
			<p class="ek-small" style="margin:0"><?php /* translators: %s: amount */ printf( esc_html__( 'Already requested and being processed: %s', 'explore-katsina' ), esc_html( Money::format( $s['pending_payouts'] ) ) ); ?></p>
		<?php endif; ?>
		<form method="post" class="ek-stack">
			<?php echo Dashboard::nonce_fields( 'dash_payout', $b['id'] ); // phpcs:ignore ?>
			<div class="ek-field">
				<label for="ek-amount"><?php esc_html_e( 'Amount (₦)', 'explore-katsina' ); ?></label>
				<input type="text" id="ek-amount" name="amount" inputmode="decimal" placeholder="<?php echo esc_attr( number_format( $s['requestable'] / 100 ) ); ?>" <?php disabled( ! $can ); ?>>
			</div>
			<div><button class="ek-btn" type="submit" <?php disabled( ! $can ); ?>><?php esc_html_e( 'Request payout', 'explore-katsina' ); ?></button></div>
			<?php if ( ! $can ) : ?><p class="ek-small ek-muted" style="margin:0"><?php esc_html_e( 'You can request a payout once your available balance reaches the minimum.', 'explore-katsina' ); ?></p><?php endif; ?>
		</form>
	</section>

	<section class="ek-card ek-stack" aria-labelledby="bank-h">
		<h2 id="bank-h" style="margin:0"><?php esc_html_e( 'Payout bank account', 'explore-katsina' ); ?></h2>
		<?php if ( $bank ) : ?>
			<p style="margin:0"><strong><?php echo esc_html( $bank['bank_name'] ); ?></strong><br><span class="ek-num"><?php echo esc_html( Crypto::mask_account( $bank['account_last4'] ) ); ?></span></p>
		<?php endif; ?>
		<details>
			<summary class="ek-link-btn"><?php esc_html_e( 'Change bank details', 'explore-katsina' ); ?></summary>
			<form method="post" class="ek-stack" style="margin-top:12px" autocomplete="off">
				<?php echo Dashboard::nonce_fields( 'dash_bank', $b['id'] ); // phpcs:ignore ?>
				<div class="ek-field"><label for="ek-bank"><?php esc_html_e( 'Bank name', 'explore-katsina' ); ?></label><input type="text" id="ek-bank" name="bank_name" list="ek-banks" required><datalist id="ek-banks"><?php foreach ( View::banks() as $bn ) : ?><option value="<?php echo esc_attr( $bn ); ?>"></option><?php endforeach; ?></datalist></div>
				<div class="ek-field"><label for="ek-acctname"><?php esc_html_e( 'Account name', 'explore-katsina' ); ?></label><input type="text" id="ek-acctname" name="account_name" required></div>
				<div class="ek-field"><label for="ek-acct"><?php esc_html_e( 'Account number (10 digits)', 'explore-katsina' ); ?></label><input type="text" id="ek-acct" name="account_number" inputmode="numeric" maxlength="10" required></div>
				<div class="ek-field"><label for="ek-pass"><?php esc_html_e( 'Your password', 'explore-katsina' ); ?></label><input type="password" id="ek-pass" name="current_password" autocomplete="current-password" required><span class="ek-hint"><?php esc_html_e( 'For your safety, changing where your money goes needs your password. We also email you and our team.', 'explore-katsina' ); ?></span></div>
				<div><button class="ek-btn ek-btn--night" type="submit"><?php esc_html_e( 'Save bank details', 'explore-katsina' ); ?></button></div>
			</form>
		</details>
	</section>
</div>

<section class="ek-card" aria-labelledby="poh-h">
	<h2 id="poh-h"><?php esc_html_e( 'Payout history', 'explore-katsina' ); ?></h2>
	<?php if ( ! $history ) : ?>
		<div class="ek-empty"><strong><?php esc_html_e( 'No payouts yet', 'explore-katsina' ); ?></strong><?php esc_html_e( 'Your payout requests and transfers will appear here.', 'explore-katsina' ); ?></div>
	<?php else : ?>
		<div class="ek-table-wrap"><table class="ek-table ek-table--stack">
			<thead><tr><th><?php esc_html_e( 'Requested', 'explore-katsina' ); ?></th><th class="ek-num"><?php esc_html_e( 'Amount', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Status', 'explore-katsina' ); ?></th><th><?php esc_html_e( 'Transfer reference', 'explore-katsina' ); ?></th></tr></thead>
			<tbody>
			<?php foreach ( $history as $p ) : ?>
				<tr>
					<td data-label="<?php esc_attr_e( 'Requested', 'explore-katsina' ); ?>"><?php echo esc_html( View::date( $p->requested_at ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Amount', 'explore-katsina' ); ?>" class="ek-num"><?php echo esc_html( Money::format( $p->amount_kobo ) ); ?></td>
					<td data-label="<?php esc_attr_e( 'Status', 'explore-katsina' ); ?>"><span class="ek-pill"><?php echo esc_html( Money::payout_status_label( $p->status ) ); ?></span></td>
					<td data-label="<?php esc_attr_e( 'Transfer reference', 'explore-katsina' ); ?>"><?php echo esc_html( $p->reference ? $p->reference : '—' ); ?></td>
				</tr>
			<?php endforeach; ?>
			</tbody>
		</table></div>
	<?php endif; ?>
</section>
