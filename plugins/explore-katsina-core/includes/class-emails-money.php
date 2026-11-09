<?php
/**
 * Phase 7 emails: money released, payouts, commission invoices, complaints.
 * All go through Emails::send (branded template + optional WhatsApp/SMS hook).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Emails_Money {

	private static function biz( $business_id, $subject, $heading, array $lines, array $cta, $event ) {
		$to = Emails::business_recipients( $business_id );
		if ( $to ) {
			Emails::send( $to, $subject, $heading, $lines, $cta, array( 'event' => $event, 'audience' => 'business', 'phone' => Emails::business_phone( $business_id ) ) );
		}
	}

	public static function funds_released( $business_id, $amount ) {
		self::biz(
			$business_id,
			/* translators: %s: amount */
			sprintf( __( '%s is now available for payout', 'explore-katsina' ), Money::format( $amount ) ),
			__( 'Money released', 'explore-katsina' ),
			/* translators: %s: amount */
			array( sprintf( __( '%s from your completed bookings has passed its 3-day hold and is now available. You can request a payout from your dashboard.', 'explore-katsina' ), Money::format( $amount ) ) ),
			array( 'label' => __( 'Request a payout', 'explore-katsina' ), 'url' => Dashboard::url( 'payouts', $business_id ) ),
			'funds_released'
		);
	}

	public static function payout_update( $p ) {
		$amount = Money::format( $p->amount_kobo );
		switch ( $p->status ) {
			case 'approved':
				/* translators: %s: amount */
				$subject = sprintf( __( 'Payout of %s approved', 'explore-katsina' ), $amount );
				$lines   = array( __( 'Your payout request has been approved. We will send the bank transfer shortly and tell you the reference.', 'explore-katsina' ) );
				break;
			case 'paid':
				/* translators: %s: amount */
				$subject = sprintf( __( 'Payout of %s sent', 'explore-katsina' ), $amount );
				/* translators: 1: amount, 2: bank, 3: reference */
				$lines = array( sprintf( __( 'We have transferred %1$s to your %2$s account. Transfer reference: %3$s. It may take a few hours to show in your account.', 'explore-katsina' ), $amount, $p->bank_name, $p->reference ) );
				break;
			default:
				/* translators: %s: amount */
				$subject = sprintf( __( 'About your payout request of %s', 'explore-katsina' ), $amount );
				/* translators: %s: reason */
				$lines = array( sprintf( __( 'We could not process this payout: %s', 'explore-katsina' ), $p->note ), __( 'The money is still in your available balance. Please fix the issue and request again.', 'explore-katsina' ) );
		}
		self::biz( $p->business_id, $subject, $subject, $lines, array( 'label' => __( 'Open payouts', 'explore-katsina' ), 'url' => Dashboard::url( 'payouts', (int) $p->business_id ) ), 'payout_' . $p->status );
	}

	private static function invoice_lines( $inv ) {
		return array(
			/* translators: %s: invoice number */
			sprintf( __( 'Invoice: %s', 'explore-katsina' ), $inv->number ),
			/* translators: %s: month */
			sprintf( __( 'Period: up to the end of %s', 'explore-katsina' ), wp_date( 'F Y', strtotime( $inv->period_start . ' 12:00 UTC' ) ) ),
			/* translators: %s: amount */
			sprintf( __( 'Amount: %s', 'explore-katsina' ), Money::format( $inv->amount_kobo ) ),
			/* translators: %s: date */
			sprintf( __( 'Due by: %s', 'explore-katsina' ), View::date( $inv->due_at ) ),
		);
	}

	public static function invoice_issued( $inv ) {
		self::biz(
			$inv->business_id,
			/* translators: %s: invoice number */
			sprintf( __( 'Your commission invoice %s', 'explore-katsina' ), $inv->number ),
			__( 'Your monthly commission invoice', 'explore-katsina' ),
			array_merge(
				array( __( 'This invoice covers our commission on bookings made through Explore Katsina where the guest paid you directly at your venue.', 'explore-katsina' ) ),
				self::invoice_lines( $inv ),
				array( __( 'Pay online with Paystack, or from your earnings balance, in your dashboard. Invoices unpaid for 30 days pause your listing until paid.', 'explore-katsina' ) )
			),
			array( 'label' => __( 'View and pay', 'explore-katsina' ), 'url' => Dashboard::url( 'invoices', (int) $inv->business_id ) ),
			'invoice_issued'
		);
	}

	public static function invoice_reminder( $inv ) {
		self::biz(
			$inv->business_id,
			/* translators: %s: invoice number */
			sprintf( __( 'Reminder: invoice %s is due in 7 days', 'explore-katsina' ), $inv->number ),
			__( 'Your invoice is due soon', 'explore-katsina' ),
			array_merge( self::invoice_lines( $inv ), array( __( 'If it is still unpaid on the due date, your listing will be paused until it is paid.', 'explore-katsina' ) ) ),
			array( 'label' => __( 'Pay now', 'explore-katsina' ), 'url' => Dashboard::url( 'invoices', (int) $inv->business_id ) ),
			'invoice_reminder'
		);
	}

	public static function invoice_paused( $inv ) {
		self::biz(
			$inv->business_id,
			__( 'Your listing has been paused (unpaid invoice)', 'explore-katsina' ),
			__( 'Listing paused', 'explore-katsina' ),
			array_merge( array( __( 'Your listing is hidden from visitors because this invoice is overdue. It comes back automatically as soon as the invoice is paid.', 'explore-katsina' ) ), self::invoice_lines( $inv ) ),
			array( 'label' => __( 'Pay now', 'explore-katsina' ), 'url' => Dashboard::url( 'invoices', (int) $inv->business_id ) ),
			'invoice_paused'
		);
		Emails::send(
			Emails::admin_email(),
			/* translators: 1: business, 2: invoice */
			sprintf( __( 'Listing paused for unpaid invoice: %1$s (%2$s)', 'explore-katsina' ), get_the_title( $inv->business_id ), $inv->number ),
			__( 'Listing paused automatically', 'explore-katsina' ),
			self::invoice_lines( $inv ),
			array( 'label' => __( 'Open invoices', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-invoices' ) ),
			array( 'event' => 'admin_invoice_paused' )
		);
	}

	public static function invoice_paid( $inv ) {
		self::biz(
			$inv->business_id,
			/* translators: %s: invoice number */
			sprintf( __( 'Receipt: invoice %s paid', 'explore-katsina' ), $inv->number ),
			__( 'Thank you, your invoice is paid', 'explore-katsina' ),
			/* translators: 1: amount, 2: invoice number, 3: reference */
			array( sprintf( __( 'We received %1$s for invoice %2$s. Reference: %3$s.', 'explore-katsina' ), Money::format( $inv->amount_kobo ), $inv->number, $inv->reference ) ),
			array( 'label' => __( 'Open invoices', 'explore-katsina' ), 'url' => Dashboard::url( 'invoices', (int) $inv->business_id ) ),
			'invoice_paid'
		);
	}

	public static function complaint_opened( $b, $message ) {
		$lines = array_merge( Emails::booking_lines( $b ), array( __( 'What the guest said:', 'explore-katsina' ) . ' ' . $message ) );
		Emails::send(
			$b->customer_email,
			/* translators: %s: booking code */
			sprintf( __( 'We received your report about %s', 'explore-katsina' ), $b->code ),
			__( 'Thank you for telling us', 'explore-katsina' ),
			array( __( 'Our team will look into it and contact you, usually within 2 working days. The business will not be paid for this booking until we have decided.', 'explore-katsina' ) ),
			array( 'label' => __( 'View booking', 'explore-katsina' ), 'url' => Booking::link( $b ) ),
			array( 'event' => 'complaint_received', 'phone' => $b->customer_phone )
		);
		self::biz(
			$b->business_id,
			/* translators: %s: booking code */
			sprintf( __( 'A guest reported a problem with booking %s', 'explore-katsina' ), $b->code ),
			__( 'A guest reported a problem', 'explore-katsina' ),
			array_merge( $lines, array( __( 'The payment for this booking is on hold while our team looks into it. We may contact you for your side.', 'explore-katsina' ) ) ),
			array( 'label' => __( 'Open bookings', 'explore-katsina' ), 'url' => Dashboard::url( 'bookings', (int) $b->business_id ) ),
			'complaint_business'
		);
		Emails::send(
			Emails::admin_email(),
			/* translators: 1: booking code, 2: business */
			sprintf( __( 'Complaint: %1$s at %2$s', 'explore-katsina' ), $b->code, get_the_title( $b->business_id ) ),
			__( 'New complaint to decide', 'explore-katsina' ),
			$lines,
			array( 'label' => __( 'Decide now', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-complaints' ) ),
			array( 'event' => 'admin_complaint' )
		);
	}

	public static function complaint_resolved( $b, $c ) {
		$refund = (int) $c->refund_kobo;
		$guest  = $refund
			/* translators: %s: amount */
			? sprintf( __( 'We have decided to refund you %s. You will receive a separate email when it is sent.', 'explore-katsina' ), Money::format( $refund ) )
			: __( 'After looking into it, we have decided not to give a refund for this booking.', 'explore-katsina' );
		$biz    = $refund
			/* translators: %s: amount */
			? sprintf( __( 'We refunded the guest %s. Your remaining earnings for this booking are now available.', 'explore-katsina' ), Money::format( $refund ) )
			: __( 'No refund was given. Your earnings for this booking are now available.', 'explore-katsina' );
		$note   = $c->resolution_note ? array( __( 'Note from our team:', 'explore-katsina' ) . ' ' . $c->resolution_note ) : array();
		Emails::send(
			$b->customer_email,
			/* translators: %s: booking code */
			sprintf( __( 'Update on your report about %s', 'explore-katsina' ), $b->code ),
			__( 'We have looked into your report', 'explore-katsina' ),
			array_merge( array( $guest ), $note ),
			array( 'label' => __( 'View booking', 'explore-katsina' ), 'url' => Booking::link( $b ) ),
			array( 'event' => 'complaint_resolved', 'phone' => $b->customer_phone )
		);
		self::biz(
			$b->business_id,
			/* translators: %s: booking code */
			sprintf( __( 'Complaint about booking %s resolved', 'explore-katsina' ), $b->code ),
			__( 'Complaint resolved', 'explore-katsina' ),
			array_merge( array( $biz ), $note ),
			array( 'label' => __( 'Open earnings', 'explore-katsina' ), 'url' => Dashboard::url( 'earnings', (int) $b->business_id ) ),
			'complaint_resolved_business'
		);
	}
}
