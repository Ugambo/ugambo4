<?php
/**
 * Phase 15 email catalogue: sends one of every email the site can send, using the SAMPLE data, so
 * tests/e2e/phase15-sweep.js can check each one (branding, no leftover %s placeholders, working links).
 * Nothing is changed in the data: the emails are built from existing records (copies with another status
 * where an email depends on the status).
 *
 * Run: wp eval-file ek-tests/e2e/fixture-phase15-emails.php   → JSON list of what was sent
 */
use EK\Booking;
use EK\Emails;
use EK\Emails_Money;
use EK\Emails_Sales;
use EK\Sales;

global $wpdb;
$x    = $wpdb->prefix . 'ek_';
$sent = array();
$err  = array();
$run  = static function ( $label, callable $fn ) use ( &$sent, &$err ) {
	try {
		$fn();
		$sent[] = $label;
	} catch ( \Throwable $e ) {
		$err[] = $label . ': ' . $e->getMessage();
	}
};
$sample = static fn( $kind ) => Booking::get( (int) $wpdb->get_var( $wpdb->prepare( "SELECT b.id FROM {$x}bookings b JOIN {$wpdb->postmeta} m ON m.post_id = b.business_id AND m.meta_key = '_ek_sample_set' WHERE b.kind = %s AND b.customer_email <> '' AND b.status IN ('confirmed','new','deposit_paid','completed','checked_out') ORDER BY b.id DESC LIMIT 1", $kind ) ) );
$as = static function ( $b, $status ) {
	$c         = clone $b;
	$c->status = $status;
	return $c;
};

$hotel = $sample( 'hotel' );
$rest  = $sample( 'restaurant' );
$event = $sample( 'event' );
$biz   = (int) $hotel->business_id;

// Business account.
$run( 'business_submitted', static fn() => Emails::business_submitted( $biz ) );
foreach ( array( 'approved', 'rejected', 'paused', 'resumed' ) as $d ) {
	$run( "business_{$d}", static fn() => Emails::business_decision( $biz, $d, 'SAMPLE reason for the email check.' ) );
}
$run( 'payout_requested', static fn() => Emails::payout_requested( $biz, 1500000 ) );

// Bookings, reservations and event bookings.
foreach ( array( 'hotel' => $hotel, 'restaurant' => $rest, 'event' => $event ) as $kind => $b ) {
	if ( ! $b ) {
		$err[] = "no SAMPLE {$kind} booking";
		continue;
	}
	$run( "{$kind}: booking_created", static fn() => Emails::booking_created( $b ) );
	$statuses = array(
		'hotel'      => array( 'confirmed', 'declined', 'cancelled', 'checked_out', 'no_show', 'expired' ),
		'restaurant' => array( 'confirmed', 'declined', 'cancelled', 'completed', 'no_show', 'expired' ),
		'event'      => array( 'requested', 'confirmed', 'deposit_paid', 'declined', 'cancelled', 'completed', 'expired' ),
	)[ $kind ];
	foreach ( $statuses as $st ) {
		$run( "{$kind}: booking_status {$st}", static fn() => Emails::booking_status( $as( $b, $st ) ) );
	}
	$run( "{$kind}: guest_cancelled", static fn() => Emails::guest_cancelled( $as( $b, 'cancelled' ), array( 'rule' => 'SAMPLE: cancelled more than 5 days before, full refund.', 'refund' => (int) $b->paid_kobo ) ) );
	$run( "{$kind}: review_invite", static fn() => Emails::review_invite( $as( $b, 'hotel' === $kind ? 'checked_out' : 'completed' ) ) );
}
$run( 'payment_conflict', static fn() => Emails::payment_conflict( $as( $hotel, 'payment_conflict' ) ) );
$run( 'refund_review', static fn() => Emails::refund_review( $hotel, 'SAMPLE reason' ) );
$run( 'refund_needed', static fn() => Emails::refund_needed( $hotel, 500000, 'SAMPLE reason' ) );
$run( 'refund_paid', static fn() => Emails::refund_paid( $hotel, 500000 ) );
$review = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$x}reviews WHERE business_id = %d AND status = 'published' LIMIT 1", $biz ) );
$run( 'review_received', static fn() => Emails::review_received( $review, $hotel ) );
$guest = get_user_by( 'login', 'sample_guest_account' );
if ( ! $guest ) {
	$guest = get_userdata( wp_insert_user( array( 'user_login' => 'sample_guest_account', 'user_email' => 'sample-guest-account@example.test', 'user_pass' => wp_generate_password( 20 ), 'role' => EK\Account::customer_role(), 'display_name' => 'SAMPLE Guest Account' ) ) );
}
$run( 'welcome', static fn() => Emails::welcome( $guest->ID ) );
$run( 'account_link', static fn() => EK\Account::send_link_email( $guest->ID ) );

// Money.
$run( 'funds_released', static fn() => Emails_Money::funds_released( $biz, 2340000 ) );
foreach ( array( 'approved', 'paid', 'rejected' ) as $st ) {
	$p = (object) array( 'id' => 0, 'business_id' => $biz, 'amount_kobo' => 1500000, 'status' => $st, 'bank_name' => 'Test Bank', 'reference' => 'SAMPLE-TRF-EMAIL', 'note' => 'SAMPLE: the account name does not match.' );
	$run( "payout_{$st}", static fn() => Emails_Money::payout_update( $p ) );
}
$inv = $wpdb->get_row( "SELECT * FROM {$x}invoices ORDER BY id DESC LIMIT 1" );
if ( $inv ) {
	foreach ( array( 'invoice_issued', 'invoice_reminder', 'invoice_paused', 'invoice_paid' ) as $fn ) {
		$run( $fn, static fn() => Emails_Money::$fn( $inv ) );
	}
} else {
	$err[] = 'no invoice to show';
}
$run( 'complaint_opened', static fn() => Emails_Money::complaint_opened( $as( $hotel, 'checked_out' ), 'SAMPLE: no hot water.' ) );
foreach ( array( 0, 500000 ) as $refund ) {
	$c = (object) array( 'refund_kobo' => $refund, 'resolution_note' => 'SAMPLE note from the team.', 'resolution' => $refund ? 'refund' : 'no_refund' );
	$run( 'complaint_resolved ' . ( $refund ? 'refund' : 'no refund' ), static fn() => Emails_Money::complaint_resolved( $as( $hotel, 'checked_out' ), $c ) );
}

// Direct sales: one receipt per kind, plus cancellations, refunds and conflicts.
foreach ( array( 'plan', 'verified', 'setup', 'promotion', 'ticket', 'tour' ) as $kind ) {
	$id = (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$x}sales WHERE kind = %s AND status = 'paid' AND customer_email <> '' ORDER BY id DESC LIMIT 1", $kind ) );
	if ( ! $id ) {
		$err[] = "no paid {$kind} sale";
		continue;
	}
	$s = Sales::get( $id );
	$run( "sale receipt: {$kind}", static fn() => Emails_Sales::receipt( $s ) );
	if ( in_array( $kind, array( 'ticket', 'tour' ), true ) ) {
		$run( "sale cancelled: {$kind}", static fn() => Emails_Sales::cancelled( $s, (int) $s->amount_kobo ) );
		$run( "sale refund_needed: {$kind}", static fn() => Emails_Sales::refund_needed( $s, (int) $s->amount_kobo ) );
		$run( "sale conflict: {$kind}", static fn() => Emails_Sales::conflict( $s ) );
	}
}

// Plan reminders and end (private helper in Plans).
$plan_biz = (int) $wpdb->get_var( "SELECT post_id FROM {$wpdb->postmeta} WHERE meta_key = '_ek_plan' AND meta_value IN ('featured','premium') LIMIT 1" );
if ( $plan_biz ) {
	$m = new ReflectionMethod( EK\Plans::class, 'email' );
	$m->setAccessible( true );
	foreach ( array( 7, 1, 'ended' ) as $when ) {
		$run( "plan_{$when}", static fn() => $m->invoke( null, $plan_biz, 'featured', time() + DAY_IN_SECONDS, $when ) );
	}
}
echo wp_json_encode( array( 'sent' => $sent, 'errors' => $err ) );
