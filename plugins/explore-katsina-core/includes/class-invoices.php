<?php
/**
 * Monthly commission invoices.
 *
 * When a guest books online but pays the business directly ("Pay at hotel", cash food orders),
 * Explore Katsina's commission was never collected. On the 1st of each month every such booking
 * that was completed (checked out / completed) up to the end of the previous month, and not yet
 * invoiced, is added to that business's invoice. If commission was only partly collected online
 * (e.g. a deposit smaller than the commission), the rest is invoiced too.
 *
 * The business pays online (Paystack/Flutterwave), from its earnings balance, or by bank transfer
 * (the admin marks it paid). A reminder is sent 7 days before the due date. If an invoice is still
 * unpaid 30 days after it was issued, the listing is paused automatically, and switched back on
 * automatically when every overdue invoice is paid.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Invoices {

	const META_PAUSED = '_ek_paused_reason';

	public static function due_days() {
		return max( 7, (int) Settings::get( 'invoice_due_days' ) );
	}

	public static function get( $id ) {
		global $wpdb;
		return $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_invoices WHERE id = %d", $id ) );
	}

	public static function lines( $invoice_id ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT l.*, b.code, b.customer_name, b.start_date, b.end_date, b.total_kobo, b.commission_rate_bp FROM {$wpdb->prefix}ek_invoice_lines l LEFT JOIN {$wpdb->prefix}ek_bookings b ON b.id = l.booking_id WHERE l.invoice_id = %d ORDER BY b.start_date", $invoice_id ) );
	}

	public static function unpaid( $business_id = 0 ) {
		global $wpdb;
		$where = $business_id ? $wpdb->prepare( 'AND business_id = %d', $business_id ) : '';
		return $wpdb->get_results( "SELECT * FROM {$wpdb->prefix}ek_invoices WHERE status = 'unpaid' {$where} ORDER BY due_at ASC" ); // phpcs:ignore
	}

	public static function recent( $limit = 100 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_invoices WHERE status <> 'unpaid' ORDER BY id DESC LIMIT %d", $limit ) );
	}

	/**
	 * Completed bookings whose commission is still owed and not yet invoiced.
	 *
	 * @param string $upto Last date (Y-m-d, by check-out / visit date) to include.
	 */
	public static function owed( $upto, $business_id = 0 ) {
		global $wpdb;
		$p   = $wpdb->prefix;
		$biz = $business_id ? $wpdb->prepare( 'AND b.business_id = %d', $business_id ) : '';
		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT b.id, b.business_id, b.code, b.kind, b.commission_kobo,
				        b.commission_kobo + COALESCE((SELECT SUM(l.amount_kobo) FROM {$p}ek_ledger l WHERE l.booking_id = b.id AND l.entry_type = 'commission'), 0) AS owed
				 FROM {$p}ek_bookings b
				 WHERE b.status IN ('checked_out','completed') AND b.commission_kobo > 0
				   AND COALESCE(b.end_date, b.start_date) <= %s
				   AND NOT EXISTS (SELECT 1 FROM {$p}ek_invoice_lines il WHERE il.booking_id = b.id)
				   {$biz}
				 HAVING owed > 0
				 ORDER BY b.business_id, b.start_date",
				$upto
			)
		); // phpcs:ignore
	}

	/**
	 * Create the invoices for a month ("2026-10"). Safe to run twice.
	 *
	 * @return int[] New invoice ids.
	 */
	public static function generate( $month, $now = null ) {
		global $wpdb;
		$tz    = Availability::tz();
		$start = \DateTimeImmutable::createFromFormat( '!Y-m-d', $month . '-01', $tz );
		if ( ! $start ) {
			return array();
		}
		$end  = $start->modify( 'last day of this month' )->format( 'Y-m-d' );
		$now  = $now ?? time();
		$made = array();
		if ( ! $wpdb->get_var( "SELECT GET_LOCK('ek_invoices', 10)" ) ) {
			return array();
		}
		try {
			$by_biz = array();
			foreach ( self::owed( $end ) as $row ) {
				$by_biz[ (int) $row->business_id ][] = $row;
			}
			foreach ( $by_biz as $biz => $rows ) {
				$number = sprintf( 'INV-%s-%05d', str_replace( '-', '', $month ), $biz );
				if ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}ek_invoices WHERE number = %s", $number ) ) ) {
					continue; // Already invoiced this month; anything new goes on next month's invoice.
				}
				$total = array_sum( array_map( static fn( $r ) => (int) $r->owed, $rows ) );
				$wpdb->insert(
					$wpdb->prefix . 'ek_invoices',
					array(
						'number'       => $number,
						'business_id'  => $biz,
						'period_start' => $start->format( 'Y-m-d' ),
						'period_end'   => $end,
						'amount_kobo'  => $total,
						'status'       => 'unpaid',
						'due_at'       => gmdate( 'Y-m-d H:i:s', $now + self::due_days() * DAY_IN_SECONDS ),
						'created_at'   => gmdate( 'Y-m-d H:i:s', $now ),
					)
				);
				$id = (int) $wpdb->insert_id;
				foreach ( $rows as $r ) {
					$wpdb->insert(
						$wpdb->prefix . 'ek_invoice_lines',
						array(
							'invoice_id'  => $id,
							'booking_id'  => (int) $r->id,
							'amount_kobo' => (int) $r->owed,
							/* translators: %s: booking code */
							'description' => sprintf( __( 'Commission on booking %s', 'explore-katsina' ), $r->code ),
						)
					);
				}
				Log::add( 'invoice_issued', 'business', $biz, $number, array( 'invoice_id' => $id, 'amount_kobo' => $total ) );
				Emails_Money::invoice_issued( self::get( $id ) );
				$made[] = $id;
			}
		} finally {
			$wpdb->query( "SELECT RELEASE_LOCK('ek_invoices')" );
		}
		return $made;
	}

	/** On or after the 1st: invoice last month once. */
	public static function run_monthly( $now = null ) {
		$now  = $now ?? time();
		$prev = ( new \DateTimeImmutable( '@' . $now ) )->setTimezone( Availability::tz() )->modify( 'first day of last month' )->format( 'Y-m' );
		if ( get_option( 'ek_invoiced_month' ) === $prev ) {
			return array();
		}
		$made = self::generate( $prev, $now );
		update_option( 'ek_invoiced_month', $prev, false );
		return $made;
	}

	/** Reminders 7 days before the due date; pause listings with overdue invoices. */
	public static function enforce( $now = null ) {
		global $wpdb;
		$now = $now ?? time();
		foreach ( self::unpaid() as $inv ) {
			$due = strtotime( $inv->due_at . ' UTC' );
			if ( $due <= $now ) {
				self::pause_for( $inv );
			} elseif ( ! (int) $inv->reminded && $due - 7 * DAY_IN_SECONDS <= $now ) {
				$wpdb->update( $wpdb->prefix . 'ek_invoices', array( 'reminded' => 1 ), array( 'id' => $inv->id ) );
				Emails_Money::invoice_reminder( $inv );
			}
		}
	}

	private static function pause_for( $inv ) {
		$biz = (int) $inv->business_id;
		if ( 'publish' !== get_post_status( $biz ) ) {
			return; // Already paused (by us or the admin), or not live.
		}
		wp_update_post( array( 'ID' => $biz, 'post_status' => Post_Types::STATUS_PAUSED ) );
		update_post_meta( $biz, self::META_PAUSED, 'invoice' );
		/* translators: %s: invoice number */
		Log::add( 'business_paused', 'business', $biz, sprintf( __( 'Automatic: invoice %s unpaid for 30 days', 'explore-katsina' ), $inv->number ) );
		Emails_Money::invoice_paused( $inv );
	}

	/** Switch the listing back on if we paused it and nothing is overdue any more. */
	public static function maybe_resume( $business_id, $now = null ) {
		global $wpdb;
		$now = $now ?? time();
		if ( Post_Types::STATUS_PAUSED !== get_post_status( $business_id ) || 'invoice' !== get_post_meta( $business_id, self::META_PAUSED, true ) ) {
			return false;
		}
		$overdue = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}ek_invoices WHERE business_id = %d AND status = 'unpaid' AND due_at <= %s", $business_id, gmdate( 'Y-m-d H:i:s', $now ) ) );
		if ( $overdue ) {
			return false;
		}
		wp_update_post( array( 'ID' => $business_id, 'post_status' => 'publish' ) );
		delete_post_meta( $business_id, self::META_PAUSED );
		Log::add( 'business_resumed', 'business', $business_id, __( 'Automatic: overdue invoices paid', 'explore-katsina' ) );
		Emails::business_decision( $business_id, 'resumed', __( 'Thank you for paying your invoice.', 'explore-katsina' ) );
		return true;
	}

	/** @return bool True if this call marked it paid. */
	public static function mark_paid( $id, $method, $reference, $user_id = 0 ) {
		global $wpdb;
		$n = $wpdb->query(
			$wpdb->prepare(
				"UPDATE {$wpdb->prefix}ek_invoices SET status = 'paid', paid_at = %s, method = %s, reference = %s WHERE id = %d AND status = 'unpaid'",
				current_time( 'mysql', true ),
				sanitize_key( $method ),
				mb_substr( (string) $reference, 0, 100 ),
				$id
			)
		);
		if ( ! $n ) {
			return false;
		}
		$inv = self::get( $id );
		Log::add( 'invoice_paid', 'business', $inv->business_id, $inv->number . ' · ' . $method . ' ' . $reference, array( 'invoice_id' => (int) $id, 'by' => (int) $user_id ) );
		Emails_Money::invoice_paid( $inv );
		self::maybe_resume( (int) $inv->business_id );
		return true;
	}

	/** Admin writes off an invoice (e.g. a goodwill gesture). Its bookings are not invoiced again. */
	public static function void( $id, $reason, $user_id ) {
		global $wpdb;
		$n = $wpdb->update( $wpdb->prefix . 'ek_invoices', array( 'status' => 'void', 'reference' => mb_substr( $reason, 0, 100 ) ), array( 'id' => (int) $id, 'status' => 'unpaid' ) );
		if ( $n ) {
			$inv = self::get( $id );
			Log::add( 'invoice_void', 'business', $inv->business_id, $inv->number . ' · ' . $reason, array( 'by' => (int) $user_id ) );
			self::maybe_resume( (int) $inv->business_id );
		}
		return (bool) $n;
	}

	/**
	 * Pay from the business's available earnings. Shares the payout lock so the same money
	 * can't be both paid out and used for an invoice.
	 *
	 * @return true|\WP_Error
	 */
	public static function pay_from_balance( $id, $business_id, $user_id ) {
		global $wpdb;
		$inv = self::get( $id );
		if ( ! $inv || (int) $inv->business_id !== (int) $business_id ) {
			return new \WP_Error( 'forbidden', __( 'Invoice not found.', 'explore-katsina' ) );
		}
		if ( 'unpaid' !== $inv->status ) {
			return new \WP_Error( 'paid', __( 'This invoice is already paid.', 'explore-katsina' ) );
		}
		$lock = 'ek_payout_' . (int) $business_id;
		if ( ! $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK(%s, 5)', $lock ) ) ) {
			return new \WP_Error( 'busy', __( 'Please try again in a moment.', 'explore-katsina' ) );
		}
		try {
			$s = Money::summary( $business_id );
			if ( $s['requestable'] < (int) $inv->amount_kobo ) {
				/* translators: %s: amount */
				return new \WP_Error( 'balance', sprintf( __( 'Your available balance (%s) is not enough. Pay online instead.', 'explore-katsina' ), Money::format( $s['requestable'] ) ) );
			}
			/* translators: %s: invoice number */
			Ledger::add_line( $business_id, 'invoice', -(int) $inv->amount_kobo, 'available', sprintf( __( 'Invoice %s paid from balance', 'explore-katsina' ), $inv->number ) );
			self::mark_paid( $id, 'balance', 'BAL-' . $inv->number, $user_id );
		} finally {
			$wpdb->get_var( $wpdb->prepare( 'SELECT RELEASE_LOCK(%s)', $lock ) );
		}
		return true;
	}

	/**
	 * Where to pay online. @return string|\WP_Error URL, or true if paid at once (local test mode).
	 */
	public static function pay_online( $id, $business_id ) {
		$inv = self::get( $id );
		if ( ! $inv || (int) $inv->business_id !== (int) $business_id || 'unpaid' !== $inv->status ) {
			return new \WP_Error( 'invoice', __( 'This invoice cannot be paid now.', 'explore-katsina' ) );
		}
		switch ( Payments::provider() ) {
			case 'woocommerce':
				return Payments_Woo::invoice_checkout_url( $inv );
			case 'test':
				self::mark_paid( $id, 'test', 'TEST-' . strtoupper( wp_generate_password( 8, false ) ) );
				return true;
		}
		return new \WP_Error( 'no_gateway', __( 'Online payment is not available right now. Please pay by bank transfer and tell us the reference.', 'explore-katsina' ) );
	}
}
