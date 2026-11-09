<?php
/**
 * The hourly money job: release held money, issue last month's invoices on the 1st,
 * send invoice reminders and pause listings with overdue invoices. Every step is safe to
 * repeat, so a missed or doubled run does no harm.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Money_Jobs {

	const HOOK = 'ek_money_tick';

	public static function init() {
		add_action( 'init', array( __CLASS__, 'schedule' ) );
		add_action( self::HOOK, array( __CLASS__, 'run' ) );
	}

	public static function schedule() {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			wp_schedule_event( time() + 120, 'hourly', self::HOOK );
		}
	}

	/** @return array What happened (for the CLI and tests). */
	public static function run( $now = null ) {
		$now = $now ?? time();
		$out = array(
			'released' => Ledger::release_due( gmdate( 'Y-m-d H:i:s', $now ) ),
			'invoices' => Invoices::run_monthly( $now ),
		);
		Invoices::enforce( $now );
		update_option( 'ek_money_tick_last', gmdate( 'Y-m-d H:i:s', $now ), false );
		return $out;
	}
}
