<?php
/**
 * Event centre details: amenities, booking mode, deposit, cancellation policy.
 *
 * Booking modes:
 *  - "request": the guest asks for a date (the date is held); the centre confirms within
 *    48 hours; the guest then pays the deposit online within 72 hours to secure it.
 *  - "instant": the guest pays the deposit straight away (15-minute hold while paying).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Venue {

	const REPLY_HOURS  = 48; // Centre must answer a request within this time.
	const PAY_BY_HOURS = 72; // Guest must pay the deposit within this time after confirmation.
	const MAX_DAYS     = 7;

	public static function amenities() {
		return array(
			'parking'      => __( 'Parking', 'explore-katsina' ),
			'power'        => __( 'Generator / 24-hour power', 'explore-katsina' ),
			'ac'           => __( 'Air conditioning', 'explore-katsina' ),
			'chairs'       => __( 'Chairs and tables provided', 'explore-katsina' ),
			'sound'        => __( 'Sound system', 'explore-katsina' ),
			'catering'     => __( 'Outside catering allowed', 'explore-katsina' ),
			'decoration'   => __( 'Outside decorators allowed', 'explore-katsina' ),
			'changing'     => __( 'Changing rooms', 'explore-katsina' ),
			'security'     => __( 'Security', 'explore-katsina' ),
			'stage'        => __( 'Stage', 'explore-katsina' ),
			'projector'    => __( 'Projector / screen', 'explore-katsina' ),
			'accessible'   => __( 'Wheelchair accessible', 'explore-katsina' ),
		);
	}

	public static function event_types() {
		return array(
			'wedding'    => __( 'Wedding / Walima', 'explore-katsina' ),
			'naming'     => __( 'Naming ceremony', 'explore-katsina' ),
			'birthday'   => __( 'Birthday / party', 'explore-katsina' ),
			'conference' => __( 'Conference / meeting', 'explore-katsina' ),
			'religious'  => __( 'Religious gathering', 'explore-katsina' ),
			'graduation' => __( 'Graduation / award', 'explore-katsina' ),
			'other'      => __( 'Other', 'explore-katsina' ),
		);
	}

	public static function defaults() {
		return array(
			'amenities'    => array(),
			'booking_mode' => 'request',
			'deposit_pct'  => 30,
			'policy'       => 'moderate',
			'policy_note'  => '',
			'rules'        => '',
		);
	}

	public static function settings( $id ) {
		$saved = get_post_meta( (int) $id, '_ek_venue', true );
		$s     = array_merge( self::defaults(), is_array( $saved ) ? $saved : array() );
		$s['amenities'] = array_values( array_intersect( (array) $s['amenities'], array_keys( self::amenities() ) ) );
		if ( ! isset( Hotel::policies()[ $s['policy'] ] ) ) {
			$s['policy'] = 'moderate';
		}
		return $s;
	}

	/** @return array{0: array, 1: array} */
	public static function validate( array $in ) {
		$e = array();
		$d = array(
			'amenities'    => array_values( array_intersect( array_map( 'sanitize_key', (array) ( $in['amenities'] ?? array() ) ), array_keys( self::amenities() ) ) ),
			'booking_mode' => 'instant' === ( $in['booking_mode'] ?? '' ) ? 'instant' : 'request',
			'deposit_pct'  => absint( $in['deposit_pct'] ?? 30 ),
			'policy'       => sanitize_key( $in['policy'] ?? '' ),
			'policy_note'  => sanitize_textarea_field( $in['policy_note'] ?? '' ),
			'rules'        => sanitize_textarea_field( $in['rules'] ?? '' ),
		);
		if ( $d['deposit_pct'] < 10 || $d['deposit_pct'] > 100 ) {
			$e['deposit_pct'] = __( 'The deposit must be between 10% and 100%.', 'explore-katsina' );
		}
		if ( ! isset( Hotel::policies()[ $d['policy'] ] ) ) {
			$e['policy'] = __( 'Choose a cancellation policy.', 'explore-katsina' );
		}
		return array( $d, $e );
	}

	public static function save( $id, array $s ) {
		update_post_meta( (int) $id, '_ek_venue', $s );
	}

	/** Inclusive event days → calendar "nights" (one calendar row per day). */
	public static function days( $start, $end ) {
		return Availability::nights( $start, ( new \DateTimeImmutable( $end, Availability::tz() ) )->modify( '+1 day' )->format( 'Y-m-d' ) );
	}

	/**
	 * Price for a hall over the event days (per-day halls) or for the event (per-event halls).
	 *
	 * @return array{ok:bool, reason:string, total:int, days:array}
	 */
	public static function quote( array $hall, $start, $end ) {
		$q = Availability::quote( $hall, $start, ( new \DateTimeImmutable( $end, Availability::tz() ) )->modify( '+1 day' )->format( 'Y-m-d' ), 1 );
		if ( ! $q['ok'] ) {
			$q['reason'] = __( 'Already booked on one or more of these dates', 'explore-katsina' );
		}
		return array(
			'ok'     => $q['ok'],
			'reason' => $q['reason'],
			'total'  => $q['per_room'],
			'days'   => $q['nights'],
		);
	}
}
