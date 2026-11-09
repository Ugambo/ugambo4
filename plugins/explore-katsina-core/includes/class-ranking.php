<?php
/**
 * Honest rankings, calculated every night (and on demand from wp-admin).
 *
 * Score (0–100) for each approved business, compared only with businesses of the same type:
 *  - Weighted rating (default 70%): a Bayesian average. Every business starts as if it already had
 *    10 "pretend" reviews at the average rating for its type; real reviews gradually outweigh them.
 *    Recent reviews count more: a review counts half as much after 12 months.
 *  - Completed bookings (default 15%): on a sliding (logarithmic) scale over the last 12 months,
 *    so the 10th booking matters more than the 1,000th. 50 a year earns full marks.
 *  - Response rate (default 15%): share of bookings answered (confirmed/declined) within 48 hours,
 *    and share of reviews with an owner reply.
 * Only published (verified, not hidden) reviews count. Paid plans are never part of the score.
 * A rank number needs at least 3 verified reviews; ties go to the business with more reviews.
 * Badges: Top Rated (top 10% of its type), Rising (score up 5+ points in 90 days), Verified.
 * All the numbers are settings.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Ranking {

	const HOOK = 'ek_rank_daily';

	/** Business types that get rankings, with the plural noun used in "#3 of 42 hotels". */
	public static function ranked_types() {
		return array(
			'hotel'         => array( __( 'hotel', 'explore-katsina' ), __( 'hotels', 'explore-katsina' ) ),
			'restaurant'    => array( __( 'restaurant', 'explore-katsina' ), __( 'restaurants', 'explore-katsina' ) ),
			'event-centre'  => array( __( 'event centre', 'explore-katsina' ), __( 'event centres', 'explore-katsina' ) ),
			'tour-operator' => array( __( 'tour operator', 'explore-katsina' ), __( 'tour operators', 'explore-katsina' ) ),
		);
	}

	public static function init() {
		add_action( 'init', array( __CLASS__, 'schedule' ) );
		add_action( self::HOOK, array( __CLASS__, 'run' ) );
	}

	/** Every night at about 02:15 Lagos time. */
	public static function schedule() {
		if ( ! wp_next_scheduled( self::HOOK ) ) {
			$next = new \DateTimeImmutable( 'tomorrow 02:15', Availability::tz() );
			wp_schedule_event( $next->getTimestamp(), 'daily', self::HOOK );
		}
	}

	/** "#3 of 42 hotels in Katsina" / "#1 restaurant in Daura". */
	public static function label( $row, $type, $scope = 'state', $lga_name = '' ) {
		$n = self::ranked_types()[ $type ] ?? array( '', '' );
		if ( ! $row ) {
			return '';
		}
		if ( 'lga' === $scope ) {
			if ( ! $row->rank_lga ) {
				return '';
			}
			/* translators: 1: rank, 2: total, 3: plural type, 4: LGA */
			return 1 === (int) $row->rank_lga ? sprintf( __( '#1 %1$s in %2$s', 'explore-katsina' ), $n[0], $lga_name ) : sprintf( __( '#%1$d of %2$d %3$s in %4$s', 'explore-katsina' ), $row->rank_lga, $row->total_lga, $n[1], $lga_name );
		}
		if ( ! $row->rank_state ) {
			return '';
		}
		/* translators: 1: rank, 2: total, 3: plural type */
		return sprintf( __( '#%1$d of %2$d %3$s in Katsina', 'explore-katsina' ), $row->rank_state, $row->total_state, $n[1] );
	}

	public static function badge_labels() {
		return array(
			'top'      => __( 'Top Rated', 'explore-katsina' ),
			'rising'   => __( 'Rising', 'explore-katsina' ),
			'verified' => __( 'Verified', 'explore-katsina' ),
		);
	}

	public static function badges( $row ) {
		return $row && $row->badges ? array_values( array_filter( explode( ',', $row->badges ) ) ) : array();
	}

	/**
	 * Calculate today's rankings for every type. Safe to run any number of times a day.
	 *
	 * @return array<string,int> type => number of businesses scored.
	 */
	public static function run( $now = null ) {
		global $wpdb;
		$now   = $now ?? time();
		$tz    = Availability::tz();
		$today = ( new \DateTimeImmutable( '@' . $now ) )->setTimezone( $tz );
		$day   = $today->format( 'Y-m-d' );
		$s     = Settings::all();
		$m     = max( 0, (float) $s['rank_prior_reviews'] );
		$half  = max( 1, (float) $s['rank_half_life_months'] ) * 30.4375;
		$wr    = max( 0, (float) $s['rank_weight_rating'] );
		$wb    = max( 0, (float) $s['rank_weight_bookings'] );
		$wp    = max( 0, (float) $s['rank_weight_response'] );
		$wsum  = max( 1, $wr + $wb + $wp );
		$full  = max( 1, (int) $s['rank_bookings_full'] );
		$min   = max( 1, (int) $s['min_reviews_for_rank'] );
		$x     = $wpdb->prefix;
		$since = $today->modify( '-365 days' )->format( 'Y-m-d' );
		$reply_cutoff = gmdate( 'Y-m-d H:i:s', $now - 48 * HOUR_IN_SECONDS );
		$out   = array();

		foreach ( array_keys( self::ranked_types() ) as $type ) {
			$ids = get_posts( array( 'post_type' => Post_Types::BUSINESS, 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => -1, 'tax_query' => array( array( 'taxonomy' => Post_Types::TAX_TYPE, 'field' => 'slug', 'terms' => $type ) ) ) ); // phpcs:ignore
			if ( ! $ids ) {
				continue;
			}
			$in = implode( ',', array_map( 'intval', $ids ) );

			// Reviews (published only = verified and not hidden).
			$rows = $wpdb->get_results( "SELECT business_id, rating_overall, created_at, (owner_reply IS NOT NULL AND owner_reply <> '') replied FROM {$x}ek_reviews WHERE status = 'published' AND business_id IN ({$in})" ); // phpcs:ignore
			$prior = $rows ? array_sum( wp_list_pluck( $rows, 'rating_overall' ) ) / count( $rows ) : 4.0;
			$rev   = array();
			foreach ( $rows as $r ) {
				$age = max( 0, ( $now - strtotime( $r->created_at . ' UTC' ) ) / DAY_IN_SECONDS );
				$w   = pow( 0.5, $age / $half );
				$b   = (int) $r->business_id;
				$rev[ $b ]          = $rev[ $b ] ?? array( 'n' => 0, 'w' => 0.0, 'sum' => 0.0, 'replied' => 0 );
				$rev[ $b ]['n']    += 1;
				$rev[ $b ]['w']    += $w;
				$rev[ $b ]['sum']  += $w * (int) $r->rating_overall;
				$rev[ $b ]['replied'] += (int) $r->replied;
			}

			// Completed bookings in the last 12 months.
			$done = $wpdb->get_results( $wpdb->prepare( "SELECT business_id, COUNT(*) n FROM {$x}ek_bookings WHERE business_id IN ({$in}) AND status IN ('checked_out','completed') AND COALESCE(end_date, start_date) >= %s GROUP BY business_id", $since ), OBJECT_K ); // phpcs:ignore

			// Bookings that needed an answer (older than 48 hours) and those never answered in time.
			$need = $wpdb->get_results( $wpdb->prepare( "SELECT business_id, COUNT(*) n, SUM(status IN ('new','requested')) unanswered FROM {$x}ek_bookings WHERE business_id IN ({$in}) AND kind IN ('hotel','restaurant','event') AND created_at >= %s AND created_at < %s AND status <> 'pending_payment' AND NOT (status = 'expired' AND kind <> 'event') GROUP BY business_id", $since . ' 00:00:00', $reply_cutoff ), OBJECT_K ); // phpcs:ignore
			$lapsed = $wpdb->get_results( $wpdb->prepare( "SELECT b.business_id, COUNT(*) n FROM {$x}ek_log l JOIN {$x}ek_bookings b ON b.id = l.object_id WHERE l.object_type = 'booking' AND l.action = 'booking_expired' AND l.meta LIKE %s AND b.business_id IN ({$in}) AND b.created_at >= %s GROUP BY b.business_id", '%"from":"requested"%', $since . ' 00:00:00' ), OBJECT_K ); // phpcs:ignore

			$scored = array();
			foreach ( $ids as $id ) {
				$r       = $rev[ $id ] ?? array( 'n' => 0, 'w' => 0.0, 'sum' => 0.0, 'replied' => 0 );
				$wavg    = ( $r['sum'] + $m * $prior ) / max( 0.0001, $r['w'] + $m );
				$rating  = max( 0, min( 1, ( $wavg - 1 ) / 4 ) );
				$c       = (int) ( $done[ $id ]->n ?? 0 );
				$booking = min( 1, log( 1 + $c ) / log( 1 + $full ) );
				$parts   = array();
				if ( ! empty( $need[ $id ] ) && (int) $need[ $id ]->n > 0 ) {
					$miss    = (int) $need[ $id ]->unanswered + (int) ( $lapsed[ $id ]->n ?? 0 );
					$parts[] = max( 0, 1 - $miss / (int) $need[ $id ]->n );
				}
				if ( $r['n'] ) {
					$parts[] = $r['replied'] / $r['n'];
				}
				$response = $parts ? array_sum( $parts ) / count( $parts ) : 0.5; // No history yet: neutral.
				$scored[ $id ] = array(
					'score'    => round( 100 * ( $wr * $rating + $wb * $booking + $wp * $response ) / $wsum, 3 ),
					'wavg'     => round( $wavg, 4 ),
					'count'    => (int) $r['n'],
					'rating'   => round( $rating, 4 ),
					'booking'  => round( $booking, 4 ),
					'response' => round( $response, 4 ),
					'done'     => $c,
					'lga'      => (int) ( Business::lga_of( $id )->term_id ?? 0 ),
				);
			}

			// Rank numbers for businesses with enough verified reviews.
			$eligible = array_filter( $scored, static fn( $v ) => $v['count'] >= $min );
			uksort( $eligible, static fn( $a, $b ) => array( $eligible[ $b ]['score'], $eligible[ $b ]['count'], -$b ) <=> array( $eligible[ $a ]['score'], $eligible[ $a ]['count'], -$a ) );
			$total  = count( $eligible );
			$top_n  = $total ? max( 1, (int) ceil( $total * max( 1, (int) $s['rank_top_percent'] ) / 100 ) ) : 0;
			$by_lga = array();
			$pos    = 0;
			foreach ( $eligible as $id => $v ) {
				$scored[ $id ]['rank'] = ++$pos;
				$by_lga[ $v['lga'] ][] = $id;
			}
			foreach ( $by_lga as $lga => $list ) {
				foreach ( $list as $i => $id ) {
					$scored[ $id ]['rank_lga']  = $i + 1;
					$scored[ $id ]['total_lga'] = count( $list );
				}
			}

			$ago = $today->modify( '-90 days' )->format( 'Y-m-d' );
			foreach ( $scored as $id => $v ) {
				$badges = array();
				if ( ! empty( $v['rank'] ) && $v['rank'] <= $top_n ) {
					$badges[] = 'top';
				}
				if ( ! empty( $v['rank'] ) ) {
					$then = $wpdb->get_var( $wpdb->prepare( "SELECT score FROM {$x}ek_rankings WHERE business_id = %d AND day <= %s ORDER BY day DESC LIMIT 1", $id, $ago ) );
					if ( null !== $then && $v['score'] - (float) $then >= (float) $s['rank_rising_points'] ) {
						$badges[] = 'rising';
					}
				}
				if ( get_post_meta( $id, '_ek_verified', true ) ) {
					$badges[] = 'verified';
				}
				$wpdb->replace(
					$x . 'ek_rankings',
					array(
						'business_id'        => $id,
						'day'                => $day,
						'business_type'      => $type,
						'lga_id'             => $v['lga'],
						'score'              => $v['score'],
						'weighted_rating'    => $v['wavg'],
						'review_count'       => $v['count'],
						'rank_state'         => $v['rank'] ?? null,
						'total_state'        => $total,
						'rank_lga'           => $v['rank_lga'] ?? null,
						'total_lga'          => $v['total_lga'] ?? 0,
						'badges'             => implode( ',', $badges ),
						'rating_part'        => $v['rating'],
						'bookings_part'      => $v['booking'],
						'response_part'      => $v['response'],
						'completed_bookings' => $v['done'],
					)
				);
			}
			$out[ $type ] = count( $scored );
		}
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$x}ek_rankings WHERE day < %s", $today->modify( '-400 days' )->format( 'Y-m-d' ) ) );
		update_option( 'ek_rank_last', current_time( 'mysql', true ), false );
		Map_Index::rebuild();
		return $out;
	}

	/** Top N ranked businesses of a type (optionally in one LGA), from the latest calculation. */
	public static function top( $type, $lga_id = 0, $limit = 10 ) {
		global $wpdb;
		$x   = $wpdb->prefix;
		$day = $wpdb->get_var( $wpdb->prepare( "SELECT MAX(day) FROM {$x}ek_rankings WHERE business_type = %s", $type ) );
		if ( ! $day ) {
			return array();
		}
		$col = $lga_id ? 'rank_lga' : 'rank_state';
		$lga = $lga_id ? $wpdb->prepare( 'AND r.lga_id = %d', $lga_id ) : '';
		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT r.* FROM {$x}ek_rankings r JOIN {$wpdb->posts} p ON p.ID = r.business_id AND p.post_status = 'publish'
				 WHERE r.business_type = %s AND r.day = %s AND r.{$col} IS NOT NULL {$lga} ORDER BY r.{$col} ASC LIMIT %d",
				$type,
				$day,
				$limit
			)
		); // phpcs:ignore
	}

	/** Latest ranking row for a business, or null. */
	public static function current( $business_id ) {
		global $wpdb;
		return $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_rankings WHERE business_id = %d ORDER BY day DESC LIMIT 1", $business_id )
		);
	}

	/**
	 * Practical tips with done/not-done state.
	 *
	 * @return array<int, array{label:string, done:bool, why:string}>
	 */
	public static function tips( $business_id ) {
		$p       = Business::profile( $business_id );
		$reviews = Reviews::stats( $business_id );
		$desc    = mb_strlen( trim( wp_strip_all_tags( $p['description'] ?? '' ) ) );
		$min     = (int) Settings::get( 'min_reviews_for_rank' );

		return array(
			array(
				'label' => __( 'Add at least 5 good photos', 'explore-katsina' ),
				'done'  => count( $p['photos'] ) >= 5,
				'why'   => __( 'Listings with more photos get more clicks and bookings.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Write a full description (150+ characters)', 'explore-katsina' ),
				'done'  => $desc >= 150,
				'why'   => __( 'Tell visitors what you offer, prices and what is nearby.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Add a WhatsApp number', 'explore-katsina' ),
				'done'  => ! empty( $p['whatsapp'] ),
				'why'   => __( 'Most visitors prefer to message first.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Add a website or social media page', 'explore-katsina' ),
				'done'  => ! empty( $p['website'] ) || array_filter( $p['socials'] ),
				'why'   => __( 'It builds trust.', 'explore-katsina' ),
			),
			array(
				/* translators: %d: minimum reviews */
				'label' => sprintf( __( 'Get at least %d verified reviews', 'explore-katsina' ), $min ),
				'done'  => $reviews['count'] >= $min,
				'why'   => __( 'You need this to receive a rank number. Only guests with a completed booking can review.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Reply to every review', 'explore-katsina' ),
				'done'  => $reviews['count'] > 0 && $reviews['replied'] >= $reviews['count'],
				'why'   => __( 'Your response rate is part of your ranking score.', 'explore-katsina' ),
			),
			array(
				'label' => __( 'Get the Verified badge', 'explore-katsina' ),
				'done'  => ! empty( $p['verified'] ),
				'why'   => __( 'Verified businesses are checked by our team.', 'explore-katsina' ),
			),
		);
	}
}
