<?php
/**
 * Admin reports: bookings, commission earned, money held for businesses, what each business is
 * owed, unpaid invoices, and hotel no-show rates (unusually high rates are flagged: they can mean
 * a hotel marks real guests "no-show" to avoid commission on pay-at-hotel bookings).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Reports {

	/** A hotel is flagged when at least this many of its finished bookings are no-shows… */
	const NOSHOW_FLAG_RATE = 0.25;
	/** …out of at least this many finished bookings in the period. */
	const NOSHOW_MIN_BOOKINGS = 5;

	/** @return array{from:string,to:string} Lagos dates; defaults to this month so far. */
	public static function period( $from = '', $to = '' ) {
		$tz    = Availability::tz();
		$today = new \DateTimeImmutable( 'now', $tz );
		$from  = Availability::valid_date( $from ) ? $from : $today->modify( 'first day of this month' )->format( 'Y-m-d' );
		$to    = Availability::valid_date( $to ) ? $to : $today->format( 'Y-m-d' );
		if ( $to < $from ) {
			list( $from, $to ) = array( $to, $from );
		}
		return array( 'from' => $from, 'to' => $to );
	}

	/** UTC range for created_at columns. */
	private static function utc( $p ) {
		$tz = Availability::tz();
		$a  = ( new \DateTimeImmutable( $p['from'] . ' 00:00:00', $tz ) )->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		$b  = ( new \DateTimeImmutable( $p['to'] . ' 23:59:59', $tz ) )->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		return array( $a, $b );
	}

	public static function summary( $p ) {
		global $wpdb;
		$x = $wpdb->prefix;
		list( $a, $b ) = self::utc( $p );
		$by_kind = $wpdb->get_results( $wpdb->prepare( "SELECT kind, COUNT(*) n, SUM(status IN ('cancelled','declined','expired')) cancelled, SUM(total_kobo) value FROM {$x}ek_bookings WHERE created_at BETWEEN %s AND %s AND status <> 'pending_payment' GROUP BY kind", $a, $b ), OBJECT_K );
		$ledger  = $wpdb->get_results( $wpdb->prepare( "SELECT entry_type, SUM(amount_kobo) total FROM {$x}ek_ledger WHERE created_at BETWEEN %s AND %s GROUP BY entry_type", $a, $b ), OBJECT_K );
		$inv_paid = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$x}ek_invoices WHERE status = 'paid' AND paid_at BETWEEN %s AND %s", $a, $b ) );
		$now     = $wpdb->get_results( "SELECT status, SUM(amount_kobo) total FROM {$x}ek_ledger GROUP BY status", OBJECT_K );
		$pending = (int) $wpdb->get_var( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$x}ek_payouts WHERE status IN ('requested','approved')" );
		$unpaid  = $wpdb->get_row( "SELECT COUNT(*) n, COALESCE(SUM(amount_kobo),0) total FROM {$x}ek_invoices WHERE status = 'unpaid'" );
		$paid_out = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COALESCE(SUM(amount_kobo),0) FROM {$x}ek_payouts WHERE status = 'paid' AND processed_at BETWEEN %s AND %s", $a, $b ) );
		$commission_online = -1 * (int) ( $ledger['commission']->total ?? 0 );
		return array(
			'by_kind'           => $by_kind,
			'bookings'          => array_sum( array_map( static fn( $r ) => (int) $r->n, $by_kind ) ),
			'received_online'   => (int) ( $ledger['earning']->total ?? 0 ),
			'refunded'          => -1 * (int) ( $ledger['refund']->total ?? 0 ),
			'commission_online' => $commission_online,
			'commission_invoices' => $inv_paid,
			'commission_total'  => $commission_online + $inv_paid,
			'paid_out'          => $paid_out,
			'on_hold_now'       => (int) ( $now['on_hold']->total ?? 0 ) + (int) ( $now['frozen']->total ?? 0 ),
			'frozen_now'        => (int) ( $now['frozen']->total ?? 0 ),
			'available_now'     => (int) ( $now['available']->total ?? 0 ),
			'pending_payouts'   => $pending,
			'unpaid_invoices'   => (int) $unpaid->n,
			'unpaid_total'      => (int) $unpaid->total,
		);
	}

	/** What each business is owed right now (and owes us). */
	public static function per_business() {
		global $wpdb;
		$x    = $wpdb->prefix;
		$rows = $wpdb->get_results(
			"SELECT l.business_id,
			        SUM(CASE WHEN l.status IN ('on_hold','frozen') THEN l.amount_kobo ELSE 0 END) on_hold,
			        SUM(CASE WHEN l.status = 'available' THEN l.amount_kobo ELSE 0 END) available
			 FROM {$x}ek_ledger l GROUP BY l.business_id"
		);
		$out = array();
		foreach ( $rows as $r ) {
			$out[ (int) $r->business_id ] = array( 'on_hold' => (int) $r->on_hold, 'available' => (int) $r->available, 'requested' => 0, 'unpaid_invoices' => 0 );
		}
		foreach ( $wpdb->get_results( "SELECT business_id, SUM(amount_kobo) t FROM {$x}ek_payouts WHERE status IN ('requested','approved') GROUP BY business_id" ) as $r ) {
			$out[ (int) $r->business_id ]['requested'] = (int) $r->t;
		}
		foreach ( $wpdb->get_results( "SELECT business_id, SUM(amount_kobo) t FROM {$x}ek_invoices WHERE status = 'unpaid' GROUP BY business_id" ) as $r ) {
			$out[ (int) $r->business_id ]['unpaid_invoices'] = (int) $r->t;
		}
		foreach ( $out as $id => &$row ) {
			$row += array( 'on_hold' => 0, 'available' => 0, 'requested' => 0, 'unpaid_invoices' => 0 );
			$row['name'] = get_the_title( $id );
		}
		unset( $row );
		$out = array_filter( $out, static fn( $r ) => $r['on_hold'] || $r['available'] || $r['requested'] || $r['unpaid_invoices'] );
		uasort( $out, static fn( $a, $b ) => ( $b['available'] + $b['on_hold'] ) <=> ( $a['available'] + $a['on_hold'] ) );
		return $out;
	}

	/**
	 * No-show rate per hotel for stays that ended in the period.
	 * Rate = no-shows ÷ (no-shows + checked out). Flagged if ≥ 25% with at least 5 finished bookings,
	 * or more than twice the average of all hotels (with at least 5).
	 */
	public static function no_shows( $p ) {
		global $wpdb;
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT business_id, SUM(status = 'no_show') no_show, SUM(status IN ('checked_out','no_show')) finished,
				        SUM(status = 'no_show' AND payment_mode = 'venue') no_show_venue
				 FROM {$wpdb->prefix}ek_bookings WHERE kind = 'hotel' AND start_date BETWEEN %s AND %s
				 GROUP BY business_id HAVING finished > 0",
				$p['from'],
				$p['to']
			)
		);
		$all_ns  = array_sum( array_map( static fn( $r ) => (int) $r->no_show, $rows ) );
		$all_fin = array_sum( array_map( static fn( $r ) => (int) $r->finished, $rows ) );
		$avg     = $all_fin ? $all_ns / $all_fin : 0;
		$out     = array();
		foreach ( $rows as $r ) {
			$rate  = (int) $r->finished ? (int) $r->no_show / (int) $r->finished : 0;
			$flag  = (int) $r->finished >= self::NOSHOW_MIN_BOOKINGS && ( $rate >= self::NOSHOW_FLAG_RATE || ( $avg > 0 && $rate > 2 * $avg ) );
			$out[] = array(
				'business_id'   => (int) $r->business_id,
				'name'          => get_the_title( (int) $r->business_id ),
				'no_show'       => (int) $r->no_show,
				'no_show_venue' => (int) $r->no_show_venue,
				'finished'      => (int) $r->finished,
				'rate'          => $rate,
				'flag'          => $flag,
			);
		}
		usort( $out, static fn( $a, $b ) => $b['rate'] <=> $a['rate'] );
		return array( 'rows' => $out, 'average' => $avg );
	}

	/** CSV of bookings created in the period (for the accountant). */
	public static function csv( $p ) {
		global $wpdb;
		list( $a, $b ) = self::utc( $p );
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT code, kind, business_id, status, payment_mode, start_date, end_date, total_kobo, paid_kobo, commission_rate_bp, commission_kobo, created_at FROM {$wpdb->prefix}ek_bookings WHERE created_at BETWEEN %s AND %s ORDER BY created_at", $a, $b ), ARRAY_A );
		$fh   = fopen( 'php://temp', 'w+' );
		fputcsv( $fh, array( 'Code', 'Type', 'Business', 'Status', 'Payment', 'Start', 'End', 'Total (NGN)', 'Paid online (NGN)', 'Commission %', 'Commission (NGN)', 'Created (UTC)' ) );
		foreach ( $rows as $r ) {
			fputcsv(
				$fh,
				array( $r['code'], $r['kind'], self::csv_safe( get_the_title( (int) $r['business_id'] ) ), $r['status'], $r['payment_mode'], $r['start_date'], $r['end_date'], $r['total_kobo'] / 100, $r['paid_kobo'] / 100, $r['commission_rate_bp'] / 100, $r['commission_kobo'] / 100, $r['created_at'] )
			);
		}
		rewind( $fh );
		$csv = stream_get_contents( $fh );
		fclose( $fh );
		return $csv;
	}

	/** Stop spreadsheet formulas sneaking in through business names. */
	private static function csv_safe( $s ) {
		return preg_match( '/^[=+\-@\t\r]/', (string) $s ) ? "'" . $s : (string) $s;
	}
}
