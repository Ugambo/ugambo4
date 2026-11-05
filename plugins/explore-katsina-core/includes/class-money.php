<?php
/**
 * Money helpers for dashboards: balances from the ledger, payouts, invoices.
 * The full commission / hold / release engine is Phase 7; this phase shows the
 * figures and lets businesses request payouts from their available balance.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Money {

	/** ₦12,500 from 1250000 kobo. */
	public static function format( $kobo ) {
		$naira = (int) $kobo / 100;
		$dec   = ( 0 === ( (int) $kobo % 100 ) ) ? 0 : 2;
		return '₦' . number_format( $naira, $dec );
	}

	/** "5,000" or "5000.50" → kobo. */
	public static function to_kobo( $naira ) {
		$clean = preg_replace( '/[^\d.]/', '', (string) $naira );
		return '' === $clean ? 0 : (int) round( (float) $clean * 100 );
	}

	/**
	 * Earnings summary for one business.
	 *
	 * @return array{gross:int, commission:int, on_hold:int, available:int, paid_out:int, pending_payouts:int, requestable:int}
	 */
	public static function summary( $business_id ) {
		global $wpdb;
		$t    = $wpdb->prefix . 'ek_ledger';
		$rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT entry_type, status, SUM(amount_kobo) AS total FROM {$t} WHERE business_id = %d GROUP BY entry_type, status", $business_id )
		);
		$s = array(
			'gross'           => 0,
			'commission'      => 0,
			'on_hold'         => 0,
			'available'       => 0,
			'paid_out'        => 0,
			'pending_payouts' => 0,
			'requestable'     => 0,
		);
		foreach ( $rows as $r ) {
			$amt = (int) $r->total;
			if ( 'earning' === $r->entry_type ) {
				$s['gross'] += $amt;
			}
			if ( 'commission' === $r->entry_type ) {
				$s['commission'] += -$amt; // Commission lines are negative.
			}
			if ( in_array( $r->status, array( 'on_hold', 'frozen' ), true ) ) {
				$s['on_hold'] += $amt;
			} elseif ( 'available' === $r->status ) {
				$s['available'] += $amt;
			} elseif ( 'paid_out' === $r->status ) {
				$s['paid_out'] += $amt;
			}
		}
		$s['pending_payouts'] = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$wpdb->prefix}ek_payouts WHERE business_id = %d AND status IN ('requested','approved')", $business_id )
		);
		$s['requestable'] = max( 0, $s['available'] - $s['pending_payouts'] );
		return $s;
	}

	public static function payouts( $business_id, $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT id, amount_kobo, status, reference, note, requested_at, processed_at FROM {$wpdb->prefix}ek_payouts WHERE business_id = %d ORDER BY id DESC LIMIT %d", $business_id, $limit )
		);
	}

	public static function invoices( $business_id, $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_invoices WHERE business_id = %d ORDER BY id DESC LIMIT %d", $business_id, $limit )
		);
	}

	/**
	 * Request a payout. Uses a database lock so two quick clicks can't request
	 * the same money twice.
	 *
	 * @return int|\WP_Error Payout id.
	 */
	public static function request_payout( $business_id, $amount_kobo, $user_id ) {
		global $wpdb;
		$min = (int) Settings::get( 'min_payout_kobo' );
		if ( $amount_kobo < $min ) {
			/* translators: %s: amount */
			return new \WP_Error( 'min', sprintf( __( 'The minimum payout is %s.', 'explore-katsina' ), self::format( $min ) ) );
		}
		$bank = Business::private_details( $business_id );
		if ( empty( $bank['account_last4'] ) ) {
			return new \WP_Error( 'bank', __( 'Add your bank details in your profile first.', 'explore-katsina' ) );
		}

		$lock = 'ek_payout_' . (int) $business_id;
		if ( ! $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $lock ) ) ) {
			return new \WP_Error( 'busy', __( 'Please try again in a moment.', 'explore-katsina' ) );
		}
		try {
			$summary = self::summary( $business_id );
			if ( $amount_kobo > $summary['requestable'] ) {
				/* translators: %s: amount */
				return new \WP_Error( 'balance', sprintf( __( 'You can request up to %s right now.', 'explore-katsina' ), self::format( $summary['requestable'] ) ) );
			}
			global $wpdb;
			$raw = $wpdb->get_row( $wpdb->prepare( "SELECT account_name_enc, account_number_enc FROM {$wpdb->prefix}ek_business_private WHERE business_id = %d", $business_id ) );
			$wpdb->insert(
				$wpdb->prefix . 'ek_payouts',
				array(
					'business_id'        => (int) $business_id,
					'amount_kobo'        => (int) $amount_kobo,
					'status'             => 'requested',
					'bank_name'          => $bank['bank_name'],
					'account_name_enc'   => $raw->account_name_enc,
					'account_number_enc' => $raw->account_number_enc,
					'requested_by'       => (int) $user_id,
					'requested_at'       => current_time( 'mysql', true ),
				)
			);
			$id = (int) $wpdb->insert_id;
		} finally {
			$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) );
		}
		Log::add( 'payout_requested', 'business', $business_id, '', array( 'payout_id' => $id, 'amount_kobo' => (int) $amount_kobo ) );
		Emails::payout_requested( $business_id, $amount_kobo );
		return $id;
	}

	public static function payout_status_label( $status ) {
		$l = array(
			'requested' => __( 'Requested', 'explore-katsina' ),
			'approved'  => __( 'Approved', 'explore-katsina' ),
			'paid'      => __( 'Paid', 'explore-katsina' ),
			'rejected'  => __( 'Rejected', 'explore-katsina' ),
		);
		return $l[ $status ] ?? $status;
	}
}
