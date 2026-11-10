<?php
/**
 * Featured / Premium plans (Basic is free), monthly or yearly, paid online.
 *  - Featured & Premium: top placement in search results (marked "Featured", max 3 at the top),
 *    a highlighted gold-ringed map pin, and more photos (20 / 40 instead of 8).
 *  - Premium also: a homepage spot ([ek_premium_spotlight]).
 *  - Plans never change rank numbers (see Ranking).
 *  - Plans end automatically; reminder emails 7 days and 1 day before.
 * Buying the same plan again extends it; buying a different plan replaces the current one from today.
 * Prices are settings (PLACEHOLDERS until launch).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Plans {

	const TOP_SLOTS = 3;
	/** When the visitor searches near a location, only Featured places this close get the top spots. */
	const TOP_MAX_KM = 25;

	public static function init() {
		add_action( 'ek_sale_paid', array( __CLASS__, 'fulfil' ) );
		add_filter( 'ek_max_photos', array( __CLASS__, 'max_photos' ), 10, 2 );
		add_shortcode( 'ek_premium_spotlight', array( __CLASS__, 'spotlight' ) );
	}

	public static function plans() {
		$s = Settings::all();
		return array(
			'featured' => array(
				'label'    => __( 'Featured', 'explore-katsina' ),
				'month'    => (int) $s['price_featured_month'],
				'year'     => (int) $s['price_featured_year'],
				'benefits' => array( __( 'Top placement in search results, marked "Featured"', 'explore-katsina' ), __( 'Highlighted pin on the Katsina Map', 'explore-katsina' ), sprintf( /* translators: %d: photos */ __( 'Up to %d photos', 'explore-katsina' ), (int) $s['max_photos_featured'] ) ),
			),
			'premium'  => array(
				'label'    => __( 'Premium', 'explore-katsina' ),
				'month'    => (int) $s['price_premium_month'],
				'year'     => (int) $s['price_premium_year'],
				'benefits' => array( __( 'Everything in Featured', 'explore-katsina' ), __( 'A spot on the homepage', 'explore-katsina' ), sprintf( /* translators: %d: photos */ __( 'Up to %d photos', 'explore-katsina' ), (int) $s['max_photos_premium'] ) ),
			),
		);
	}

	/** @return array{plan:string, until:int} plan is basic|featured|premium. */
	public static function current( $business_id ) {
		$plan  = (string) get_post_meta( $business_id, '_ek_plan', true );
		$until = (int) get_post_meta( $business_id, '_ek_plan_until', true );
		if ( ! isset( self::plans()[ $plan ] ) || $until <= time() ) {
			return array( 'plan' => 'basic', 'until' => 0 );
		}
		return array( 'plan' => $plan, 'until' => $until );
	}

	public static function max_photos( $max, $business_id ) {
		$c = self::current( $business_id )['plan'];
		return 'basic' === $c ? $max : max( $max, (int) Settings::get( 'max_photos_' . $c ) );
	}

	/** @return object|\WP_Error The sale to pay. */
	public static function buy( $business_id, $plan, $period, $uid ) {
		$plans = self::plans();
		if ( ! isset( $plans[ $plan ] ) || ! in_array( $period, array( 'month', 'year' ), true ) ) {
			return new \WP_Error( 'plan', __( 'Choose a plan.', 'explore-katsina' ) );
		}
		if ( 'publish' !== get_post_status( $business_id ) ) {
			return new \WP_Error( 'status', __( 'Your listing must be approved and live before you can buy a plan.', 'explore-katsina' ) );
		}
		$user = get_userdata( $uid );
		return Sales::create(
			array(
				'kind'        => 'plan',
				'object_id'   => $business_id,
				'amount_kobo' => $plans[ $plan ][ $period ],
				'name'        => $user ? $user->display_name : '',
				'email'       => $user ? $user->user_email : '',
				'customer_id' => $uid,
				'details'     => array(
					'plan'   => $plan,
					'period' => $period,
					/* translators: 1: plan, 2: business */
					'title'  => sprintf( __( '%1$s plan (%2$s) for %3$s', 'explore-katsina' ), $plans[ $plan ]['label'], 'year' === $period ? __( '1 year', 'explore-katsina' ) : __( '1 month', 'explore-katsina' ), get_the_title( $business_id ) ),
					'return' => Dashboard::url( 'plan', $business_id ),
				),
			)
		);
	}

	public static function fulfil( $s ) {
		if ( 'plan' !== $s->kind ) {
			return;
		}
		$biz   = (int) $s->object_id;
		$cur   = self::current( $biz );
		$plan  = $s->details['plan'];
		$start = ( $cur['plan'] === $plan && $cur['until'] > time() ) ? $cur['until'] : time();
		$until = ( new \DateTimeImmutable( '@' . $start ) )->modify( 'year' === $s->details['period'] ? '+1 year' : '+1 month' )->getTimestamp();
		update_post_meta( $biz, '_ek_plan', $plan );
		update_post_meta( $biz, '_ek_plan_until', $until );
		update_post_meta( $biz, '_ek_featured_until', $until );
		delete_post_meta( $biz, '_ek_plan_reminded' );
		Log::add( 'plan_started', 'business', $biz, $plan . ' until ' . gmdate( 'Y-m-d', $until ), array( 'sale' => $s->code ) );
	}

	/** Daily: end plans that ran out; reminders 7 days and 1 day before. */
	public static function tick( $now = null ) {
		$now = $now ?? time();
		$ids = get_posts( array( 'post_type' => Post_Types::BUSINESS, 'post_status' => 'any', 'fields' => 'ids', 'posts_per_page' => -1, 'meta_key' => '_ek_plan_until', 'meta_compare' => 'EXISTS' ) ); // phpcs:ignore
		$out = array( 'ended' => 0, 'reminded' => 0 );
		foreach ( $ids as $biz ) {
			$plan  = (string) get_post_meta( $biz, '_ek_plan', true );
			$until = (int) get_post_meta( $biz, '_ek_plan_until', true );
			if ( ! $plan || 'basic' === $plan ) {
				continue;
			}
			if ( $until <= $now ) {
				update_post_meta( $biz, '_ek_plan', 'basic' );
				delete_post_meta( $biz, '_ek_featured_until' );
				Log::add( 'plan_ended', 'business', $biz, $plan );
				self::email( $biz, $plan, $until, 'ended' );
				$out['ended']++;
				continue;
			}
			$days = ( $until - $now ) / DAY_IN_SECONDS;
			$sent = (string) get_post_meta( $biz, '_ek_plan_reminded', true );
			foreach ( array( 1, 7 ) as $d ) {
				$tag = $until . ':' . $d;
				if ( $days <= $d && false === strpos( $sent, $tag ) ) {
					update_post_meta( $biz, '_ek_plan_reminded', trim( $sent . ' ' . $tag ) );
					self::email( $biz, $plan, $until, $d );
					$out['reminded']++;
					break;
				}
			}
		}
		return $out;
	}

	private static function email( $biz, $plan, $until, $when ) {
		$label = self::plans()[ $plan ]['label'] ?? $plan;
		$date  = wp_date( 'j F Y', $until );
		if ( 'ended' === $when ) {
			/* translators: %s: plan */
			$subject = sprintf( __( 'Your %s plan has ended', 'explore-katsina' ), $label );
			$line    = __( 'Your listing is back on the free Basic plan. It stays live, but without top placement or the highlighted map pin. You can renew any time.', 'explore-katsina' );
		} else {
			/* translators: 1: plan, 2: days */
			$subject = 1 === $when ? sprintf( __( 'Your %s plan ends tomorrow', 'explore-katsina' ), $label ) : sprintf( __( 'Your %s plan ends in 7 days', 'explore-katsina' ), $label );
			/* translators: %s: date */
			$line = sprintf( __( 'It ends on %s. Renew now to keep your top placement and highlighted map pin without a break.', 'explore-katsina' ), $date );
		}
		$to = Emails::business_recipients( $biz );
		if ( $to ) {
			Emails::send( $to, $subject, $subject, array( $line ), array( 'label' => __( 'Renew my plan', 'explore-katsina' ), 'url' => Dashboard::url( 'plan', $biz ) ), array( 'event' => 'plan_' . $when, 'audience' => 'business', 'phone' => Emails::business_phone( $biz ) ) );
		}
	}

	/**
	 * Search results: up to 3 Featured/Premium places go to the top, marked "Featured" (when the visitor
	 * searched near a location, only those within 25 km). Their rank numbers are unchanged.
	 */
	public static function promote( array $items ) {
		$top  = array();
		$rest = array();
		foreach ( $items as $i ) {
			$i['featured'] = Map_Index::is_featured( (int) $i['id'] );
			$near_enough   = ! isset( $i['distance'] ) || null === $i['distance'] || (float) $i['distance'] <= self::TOP_MAX_KM;
			if ( $i['featured'] && $near_enough && count( $top ) < self::TOP_SLOTS ) {
				$top[] = $i;
			} else {
				$rest[] = $i;
			}
		}
		usort( $top, static fn( $a, $b ) => ( 'premium' === self::current( $b['id'] )['plan'] ) <=> ( 'premium' === self::current( $a['id'] )['plan'] ) );
		return array_merge( $top, $rest );
	}

	/** Premium businesses for the homepage (a different order each day). */
	public static function spotlight( $atts = array() ) {
		$atts = shortcode_atts( array( 'limit' => 6 ), $atts );
		$ids  = get_posts( array( 'post_type' => Post_Types::BUSINESS, 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => -1, 'meta_query' => array( array( 'key' => '_ek_plan', 'value' => 'premium' ), array( 'key' => '_ek_plan_until', 'value' => time(), 'compare' => '>', 'type' => 'NUMERIC' ) ) ) ); // phpcs:ignore
		if ( ! $ids ) {
			return '';
		}
		mt_srand( (int) wp_date( 'Ymd' ) );
		shuffle( $ids );
		mt_srand();
		wp_enqueue_style( 'ek' );
		return View::render( 'public/spotlight', array( 'ids' => array_slice( $ids, 0, (int) $atts['limit'] ) ) );
	}
}
