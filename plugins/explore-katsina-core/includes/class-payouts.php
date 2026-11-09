<?php
/**
 * Admin side of payouts: a business requests a payout (Money::request_payout); the site admin
 * approves it, transfers the money from the bank, then marks it paid with the transfer reference
 * (or rejects it with a reason). Paying takes the amount off the business's available balance.
 *
 * The bank details used are the ones saved at the moment of the request (so a later change can't
 * redirect a payout already approved).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Payouts {

	public static function get( $id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_payouts WHERE id = %d", $id ) );
	}

	public static function waiting() {
		global $wpdb;
		return $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}ek_payouts WHERE status IN ('requested','approved') ORDER BY requested_at ASC" );
	}

	public static function recent( $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_payouts WHERE status IN ('paid','rejected') ORDER BY processed_at DESC LIMIT %d", $limit ) );
	}

	/** Decrypted account details saved with the request. Every view is logged. */
	public static function bank( $p, $log = true ) {
		if ( $log ) {
			Log::add( 'bank_viewed', 'business', $p->business_id, '', array( 'payout_id' => (int) $p->id ) );
		}
		return array(
			'bank_name'      => $p->bank_name,
			'account_name'   => Crypto::decrypt( $p->account_name_enc ),
			'account_number' => Crypto::decrypt( $p->account_number_enc ),
		);
	}

	/** @return true|\WP_Error */
	public static function approve( $id, $admin_id ) {
		global $wpdb;
		$p = self::get( $id );
		if ( ! $p || 'requested' !== $p->status ) {
			return new \WP_Error( 'status', __( 'Only new requests can be approved.', 'explore-katsina' ) );
		}
		$wpdb->update( $wpdb->prefix . 'ek_payouts', array( 'status' => 'approved', 'processed_by' => (int) $admin_id ), array( 'id' => (int) $id ) );
		Log::add( 'payout_approved', 'business', $p->business_id, '', array( 'payout_id' => (int) $id ) );
		Emails_Money::payout_update( self::get( $id ) );
		return true;
	}

	/** @return true|\WP_Error */
	public static function mark_paid( $id, $reference, $admin_id ) {
		global $wpdb;
		$reference = trim( sanitize_text_field( (string) $reference ) );
		if ( '' === $reference ) {
			return new \WP_Error( 'reference', __( 'Enter the bank transfer reference.', 'explore-katsina' ) );
		}
		$p = self::get( $id );
		if ( ! $p || ! in_array( $p->status, array( 'requested', 'approved' ), true ) ) {
			return new \WP_Error( 'status', __( 'This payout is already finished.', 'explore-katsina' ) );
		}
		$lock = 'ek_payout_' . (int) $p->business_id;
		if ( ! $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $lock ) ) ) {
			return new \WP_Error( 'busy', __( 'Please try again in a moment.', 'explore-katsina' ) );
		}
		try {
			$n = $wpdb->query(
				$wpdb->prepare(
					"UPDATE {$wpdb->prefix}ek_payouts SET status = 'paid', reference = %s, processed_by = %d, processed_at = %s WHERE id = %d AND status IN ('requested','approved')",
					mb_substr( $reference, 0, 100 ),
					$admin_id,
					current_time( 'mysql', true ),
					$id
				)
			);
			if ( $n ) {
				/* translators: %s: transfer reference */
				Ledger::add_line( $p->business_id, 'payout', -(int) $p->amount_kobo, 'available', sprintf( __( 'Bank transfer · ref %s', 'explore-katsina' ), $reference ) );
			}
		} finally {
			$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) );
		}
		if ( ! $n ) {
			return new \WP_Error( 'status', __( 'This payout is already finished.', 'explore-katsina' ) );
		}
		Log::add( 'payout_paid', 'business', $p->business_id, $reference, array( 'payout_id' => (int) $id, 'amount_kobo' => (int) $p->amount_kobo ) );
		Emails_Money::payout_update( self::get( $id ) );
		return true;
	}

	/** @return true|\WP_Error */
	public static function reject( $id, $reason, $admin_id ) {
		global $wpdb;
		$reason = trim( sanitize_textarea_field( (string) $reason ) );
		if ( '' === $reason ) {
			return new \WP_Error( 'reason', __( 'Give a reason so the business knows what to fix.', 'explore-katsina' ) );
		}
		$p = self::get( $id );
		if ( ! $p || ! in_array( $p->status, array( 'requested', 'approved' ), true ) ) {
			return new \WP_Error( 'status', __( 'This payout is already finished.', 'explore-katsina' ) );
		}
		$wpdb->update(
			$wpdb->prefix . 'ek_payouts',
			array(
				'status'       => 'rejected',
				'note'         => mb_substr( $reason, 0, 250 ),
				'processed_by' => (int) $admin_id,
				'processed_at' => current_time( 'mysql', true ),
			),
			array( 'id' => (int) $id )
		);
		Log::add( 'payout_rejected', 'business', $p->business_id, $reason, array( 'payout_id' => (int) $id ) );
		Emails_Money::payout_update( self::get( $id ) );
		return true;
	}
}
