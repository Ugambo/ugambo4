<?php
/**
 * "Add to calendar": a downloadable .ics file (works with phone calendars, Outlook, Apple)
 * and a Google Calendar link for every booking, reservation and event.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Calendar {

	public static function init() {
		add_action( 'template_redirect', array( __CLASS__, 'serve_ics' ), 2 );
	}

	/** @return array{title:string, start:string, end:string, all_day:bool, location:string, details:string} */
	public static function event( $b ) {
		$p     = Business::profile( $b->business_id );
		$d     = $b->details;
		$tz    = Availability::tz();
		$title = ( $d['hotel'] ?? ( $d['business'] ?? '' ) );
		if ( 'hotel' === $b->kind ) {
			/* translators: %s: hotel */
			$title   = sprintf( __( 'Stay at %s', 'explore-katsina' ), $title );
			$all_day = true;
			$start   = $b->start_date;
			$end     = $b->end_date;
		} elseif ( 'event' === $b->kind ) {
			/* translators: 1: hall, 2: venue */
			$title   = sprintf( __( 'Event: %1$s, %2$s', 'explore-katsina' ), $d['hall'] ?? '', $title );
			$all_day = true;
			$start   = $b->start_date;
			$end     = ( new \DateTimeImmutable( $b->end_date, $tz ) )->modify( '+1 day' )->format( 'Y-m-d' );
		} else {
			/* translators: 1: restaurant, 2: people */
			$title   = sprintf( __( 'Table at %1$s (%2$d)', 'explore-katsina' ), $title, (int) $b->guests );
			$all_day = false;
			$mins    = (int) ( Restaurant::settings( $b->business_id )['slot_minutes'] ?? 60 );
			$s       = new \DateTimeImmutable( $b->start_date . ' ' . substr( (string) $b->start_time, 0, 5 ), $tz );
			$start   = $s->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Ymd\THis\Z' );
			$end     = $s->modify( "+{$mins} minutes" )->setTimezone( new \DateTimeZone( 'UTC' ) )->format( 'Ymd\THis\Z' );
		}
		return array(
			'title'    => $title,
			'start'    => $all_day ? str_replace( '-', '', $start ) : $start,
			'end'      => $all_day ? str_replace( '-', '', $end ) : $end,
			'all_day'  => $all_day,
			'location' => trim( $p['address'] . ( $p['lga'] ? ', ' . $p['lga'] : '' ) . ', Katsina State' ),
			/* translators: %s: booking code */
			'details'  => sprintf( __( 'Booking code %s. Manage it here: ', 'explore-katsina' ), $b->code ) . Booking::link( $b ),
		);
	}

	public static function google_url( $b ) {
		$e = self::event( $b );
		return add_query_arg(
			array(
				'action'   => 'TEMPLATE',
				'text'     => rawurlencode( $e['title'] ),
				'dates'    => $e['start'] . '/' . $e['end'],
				'details'  => rawurlencode( $e['details'] ),
				'location' => rawurlencode( $e['location'] ),
			),
			'https://calendar.google.com/calendar/render'
		);
	}

	public static function ics_url( $b ) {
		return add_query_arg( array( 'ek_ics' => $b->code, 'key' => $b->access_key ), home_url( '/' ) );
	}

	private static function esc( $s ) {
		return addcslashes( str_replace( array( "\r\n", "\n" ), '\n', (string) $s ), ',;\\' );
	}

	public static function ics( $b ) {
		$e     = self::event( $b );
		$dtfmt = $e['all_day'] ? ';VALUE=DATE:' : ':';
		$lines = array(
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//Explore Katsina//Bookings//EN',
			'CALSCALE:GREGORIAN',
			'METHOD:PUBLISH',
			'BEGIN:VEVENT',
			'UID:' . $b->code . '@' . wp_parse_url( home_url(), PHP_URL_HOST ),
			'DTSTAMP:' . gmdate( 'Ymd\THis\Z' ),
			'DTSTART' . $dtfmt . $e['start'],
			'DTEND' . $dtfmt . $e['end'],
			'SUMMARY:' . self::esc( $e['title'] ),
			'LOCATION:' . self::esc( $e['location'] ),
			'DESCRIPTION:' . self::esc( $e['details'] ),
			'END:VEVENT',
			'END:VCALENDAR',
		);
		return implode( "\r\n", array_map( array( __CLASS__, 'fold' ), $lines ) ) . "\r\n";
	}

	/** Calendar files must wrap lines longer than 75 bytes (RFC 5545), without splitting a letter. */
	private static function fold( $line ) {
		$out = '';
		$cur = '';
		foreach ( preg_split( '//u', $line, -1, PREG_SPLIT_NO_EMPTY ) as $ch ) {
			if ( strlen( $cur ) + strlen( $ch ) > ( '' === $out ? 75 : 74 ) ) {
				$out .= ( '' === $out ? '' : "\r\n " ) . $cur;
				$cur  = '';
			}
			$cur .= $ch;
		}
		return $out . ( '' === $out ? '' : "\r\n " ) . $cur;
	}

	public static function serve_ics() {
		if ( empty( $_GET['ek_ics'] ) ) { // phpcs:ignore WordPress.Security.NonceVerification
			return;
		}
		$b = Booking::by_code( sanitize_text_field( wp_unslash( $_GET['ek_ics'] ) ), sanitize_text_field( wp_unslash( $_GET['key'] ?? '' ) ) ); // phpcs:ignore
		if ( ! $b ) {
			status_header( 404 );
			exit;
		}
		nocache_headers();
		header( 'Content-Type: text/calendar; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="' . $b->code . '.ics"' );
		echo self::ics( $b ); // phpcs:ignore WordPress.Security.EscapeOutput
		exit;
	}
}
