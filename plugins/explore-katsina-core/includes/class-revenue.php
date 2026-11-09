<?php
/**
 * Revenue dashboard: Explore Katsina's own income per month, from every source.
 *  - Commission on bookings (online, net of refunds) and commission invoices paid
 *  - Featured/Premium plans, Verified applications, listing setup, event promotion
 *  - Own tours and event tickets (100% ours, net of refunds)
 *  - Shop products and digital guides (WooCommerce)
 *  - Banner ads and partner commissions (recorded by hand when received)
 * Money that belongs to businesses (their share of bookings) is NOT income.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Revenue {

	public static function sources() {
		return array(
			'commission' => __( 'Booking commission', 'explore-katsina' ),
			'invoices'   => __( 'Commission invoices', 'explore-katsina' ),
			'plan'       => __( 'Featured / Premium plans', 'explore-katsina' ),
			'verified'   => __( 'Verified applications', 'explore-katsina' ),
			'setup'      => __( 'Listing setup service', 'explore-katsina' ),
			'promotion'  => __( 'Event promotion', 'explore-katsina' ),
			'tour'       => __( 'Own tours', 'explore-katsina' ),
			'ticket'     => __( 'Event tickets', 'explore-katsina' ),
			'shop'       => __( 'Shop (crafts)', 'explore-katsina' ),
			'guides'     => __( 'Digital guides', 'explore-katsina' ),
			'ads'        => __( 'Banner ads', 'explore-katsina' ),
			'partner'    => __( 'Partner commissions', 'explore-katsina' ),
			'other'      => __( 'Other', 'explore-katsina' ),
		);
	}

	/** Months (Y-m) from oldest to newest, ending this month. */
	public static function months( $n = 12 ) {
		$tz  = Availability::tz();
		$now = new \DateTimeImmutable( 'first day of this month', $tz );
		$out = array();
		for ( $i = $n - 1; $i >= 0; $i-- ) {
			$out[] = $now->modify( "-{$i} months" )->format( 'Y-m' );
		}
		return $out;
	}

	/** @return array<string, array<string,int>> month => source => kobo. */
	public static function by_month( $n = 12 ) {
		global $wpdb;
		$x      = $wpdb->prefix;
		$months = self::months( $n );
		$from   = $months[0] . '-01';
		$to     = ( new \DateTimeImmutable( end( $months ) . '-01' ) )->modify( 'last day of this month' )->format( 'Y-m-d' );
		$t      = array_fill_keys( $months, array_fill_keys( array_keys( self::sources() ), 0 ) );
		$add    = static function ( $m, $src, $amt ) use ( &$t ) {
			if ( isset( $t[ $m ][ $src ] ) ) {
				$t[ $m ][ $src ] += (int) $amt;
			}
		};
		// Lagos is UTC+1 all year; month buckets use Lagos time.
		$lagos = "DATE_FORMAT(DATE_ADD(%s, INTERVAL 1 HOUR), '%%%%Y-%%%%m')"; // sprintf → '%%Y-%%m' → prepare → '%Y-%m'.
		foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT ' . sprintf( $lagos, 'created_at' ) . " m, -SUM(amount_kobo) t FROM {$x}ek_ledger WHERE entry_type = 'commission' AND created_at >= %s GROUP BY m", $from ) ) as $r ) { // phpcs:ignore
			$add( $r->m, 'commission', $r->t );
		}
		foreach ( $wpdb->get_results( $wpdb->prepare( 'SELECT ' . sprintf( $lagos, 'paid_at' ) . " m, SUM(amount_kobo) t FROM {$x}ek_invoices WHERE status = 'paid' AND paid_at >= %s GROUP BY m", $from ) ) as $r ) { // phpcs:ignore
			$add( $r->m, 'invoices', $r->t );
		}
		foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT kind, paid_at, amount_kobo, details FROM {$x}ek_sales WHERE status IN ('paid','refunded') AND paid_at >= %s", $from ) ) as $r ) {
			$d   = json_decode( (string) $r->details, true );
			$net = (int) $r->amount_kobo - (int) ( $d['refund']['amount'] ?? 0 );
			$add( wp_date( 'Y-m', strtotime( $r->paid_at . ' UTC' ) ), $r->kind, $net );
		}
		foreach ( $wpdb->get_results( $wpdb->prepare( "SELECT source, DATE_FORMAT(received_on, '%%Y-%%m') m, SUM(amount_kobo) t FROM {$x}ek_income_manual WHERE received_on >= %s GROUP BY source, m", $from ) ) as $r ) {
			$add( $r->m, $r->source, $r->t );
		}
		foreach ( Shop::income( $from, $to ) as $m => $parts ) {
			foreach ( $parts as $src => $amt ) {
				$add( $m, $src, $amt );
			}
		}
		return $t;
	}

	/** @return int|\WP_Error */
	public static function record( $source, $amount_kobo, $date, $note, $ref_id = 0 ) {
		global $wpdb;
		if ( ! in_array( $source, array( 'ads', 'partner', 'other' ), true ) || (int) $amount_kobo <= 0 || ! Availability::valid_date( $date ) ) {
			return new \WP_Error( 'fields', __( 'Choose what it was for, the amount and the date received.', 'explore-katsina' ) );
		}
		$wpdb->insert( $wpdb->prefix . 'ek_income_manual', array( 'source' => $source, 'ref_id' => (int) $ref_id, 'amount_kobo' => (int) $amount_kobo, 'received_on' => $date, 'note' => mb_substr( sanitize_text_field( $note ), 0, 250 ), 'created_by' => get_current_user_id(), 'created_at' => current_time( 'mysql', true ) ) );
		Log::add( 'income_recorded', 'settings', 0, $source . ' ' . Money::format( $amount_kobo ) . ' ' . $note );
		return (int) $wpdb->insert_id;
	}

	public static function manual( $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_income_manual ORDER BY received_on DESC, id DESC LIMIT %d", $limit ) );
	}
}
