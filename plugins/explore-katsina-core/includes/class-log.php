<?php
/**
 * Activity & moderation log: approvals, rejections, pauses, hidden reviews, ID views…
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Log {

	public static function add( $action, $object_type, $object_id, $reason = '', array $meta = array() ) {
		global $wpdb;
		$wpdb->insert(
			$wpdb->prefix . 'ek_log',
			array(
				'actor_id'    => get_current_user_id(),
				'object_type' => sanitize_key( $object_type ),
				'object_id'   => (int) $object_id,
				'action'      => sanitize_key( $action ),
				'reason'      => (string) $reason,
				'meta'        => $meta ? wp_json_encode( $meta ) : null,
				'created_at'  => current_time( 'mysql', true ),
			)
		);
		return (int) $wpdb->insert_id;
	}

	public static function for_object( $object_type, $object_id, $limit = 50 ) {
		global $wpdb;
		return $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}ek_log WHERE object_type = %s AND object_id = %d ORDER BY id DESC LIMIT %d",
				$object_type,
				$object_id,
				$limit
			)
		);
	}

	public static function recent( $limit = 100, $offset = 0 ) {
		global $wpdb;
		return $wpdb->get_results( $wpdb->prepare( "SELECT * FROM {$wpdb->prefix}ek_log ORDER BY id DESC LIMIT %d OFFSET %d", $limit, $offset ) );
	}

	public static function label( $action ) {
		$labels = array(
			'business_submitted' => __( 'Business submitted', 'explore-katsina' ),
			'business_approved'  => __( 'Business approved', 'explore-katsina' ),
			'business_rejected'  => __( 'Business rejected', 'explore-katsina' ),
			'business_paused'    => __( 'Business paused', 'explore-katsina' ),
			'business_resumed'   => __( 'Business resumed', 'explore-katsina' ),
			'business_verified'  => __( 'Verified badge given', 'explore-katsina' ),
			'business_unverified'=> __( 'Verified badge removed', 'explore-katsina' ),
			'profile_updated'    => __( 'Profile updated by owner', 'explore-katsina' ),
			'bank_updated'       => __( 'Bank details changed by owner', 'explore-katsina' ),
			'resubmitted'        => __( 'Resubmitted for approval', 'explore-katsina' ),
			'id_viewed'          => __( 'ID document viewed by admin', 'explore-katsina' ),
			'payout_requested'   => __( 'Payout requested', 'explore-katsina' ),
			'stars_verified'     => __( 'Star rating verified', 'explore-katsina' ),
			'stars_unverified'   => __( 'Star rating verification removed', 'explore-katsina' ),
			'refund_review'      => __( 'Paid booking needs a refund decision', 'explore-katsina' ),
			'refund_created'     => __( 'Refund due to guest', 'explore-katsina' ),
			'refund_paid'        => __( 'Refund paid', 'explore-katsina' ),
			'refund_gateway_failed' => __( 'Automatic refund failed (pay by hand)', 'explore-katsina' ),
			'review_posted'      => __( 'Verified review posted', 'explore-katsina' ),
			'complaint_opened'   => __( 'Guest reported a problem (money frozen)', 'explore-katsina' ),
			'complaint_resolved' => __( 'Complaint resolved', 'explore-katsina' ),
			'invoice_issued'     => __( 'Commission invoice issued', 'explore-katsina' ),
			'invoice_paid'       => __( 'Commission invoice paid', 'explore-katsina' ),
			'invoice_void'       => __( 'Commission invoice written off', 'explore-katsina' ),
			'payout_approved'    => __( 'Payout approved', 'explore-katsina' ),
			'payout_paid'        => __( 'Payout sent', 'explore-katsina' ),
			'payout_rejected'    => __( 'Payout rejected', 'explore-katsina' ),
			'bank_viewed'        => __( 'Bank details viewed by admin', 'explore-katsina' ),
			'commission_changed' => __( 'Commission rate changed', 'explore-katsina' ),
			'review_replied'     => __( 'Owner replied to a review', 'explore-katsina' ),
		);
		return $labels[ $action ] ?? $action;
	}
}
