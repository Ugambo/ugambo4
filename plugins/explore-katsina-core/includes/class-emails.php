<?php
/**
 * Branded emails. Every message goes through send(), which also fires the
 * WhatsApp/SMS hook (switched OFF by default; see Settings).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Emails {

	public static function init() {
		add_filter( 'wp_mail_from_name', array( __CLASS__, 'from_name' ) );
	}

	public static function from_name( $name ) {
		return 'WordPress' === $name ? 'Explore Katsina' : $name;
	}

	public static function admin_email() {
		$e = Settings::get( 'notify_email' );
		return is_email( $e ) ? $e : get_option( 'admin_email' );
	}

	/**
	 * @param string $to       Recipient.
	 * @param string $subject  Subject.
	 * @param string $heading  Big heading in the email.
	 * @param array  $lines    Paragraphs (plain text, escaped here).
	 * @param array  $cta      Optional ['label' => '', 'url' => ''].
	 * @param array  $context  Passed to the messaging hook, e.g. ['event' => 'business_approved', 'phone' => '+234…'].
	 */
	public static function send( $to, $subject, $heading, array $lines, array $cta = array(), array $context = array() ) {
		$html = self::render( $heading, $lines, $cta );
		$sent = wp_mail( $to, $subject, $html, array( 'Content-Type: text/html; charset=UTF-8' ) );

		/**
		 * WhatsApp/SMS hook. Nothing is sent unless a provider is plugged in AND the
		 * setting is switched on (both OFF by default).
		 */
		if ( Settings::get( 'messaging_whatsapp' ) || Settings::get( 'messaging_sms' ) ) {
			do_action( 'ek_send_message', $context, wp_strip_all_tags( $heading . "\n" . implode( "\n", $lines ) ), $cta );
		}
		return $sent;
	}

	public static function render( $heading, array $lines, array $cta = array() ) {
		$body = '';
		foreach ( array_filter( $lines, 'strlen' ) as $line ) {
			$body .= '<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#1C1A22">' . nl2br( esc_html( $line ) ) . '</p>';
		}
		if ( ! empty( $cta['url'] ) ) {
			$body .= '<p style="margin:22px 0"><a href="' . esc_url( $cta['url'] ) . '" style="background:#8E1B2C;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px;display:inline-block">' . esc_html( $cta['label'] ) . '</a></p>';
		}
		$year = gmdate( 'Y' );
		return '<!doctype html><html><body style="margin:0;background:#FBF7EF;font-family:Arial,Helvetica,sans-serif">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FBF7EF"><tr><td align="center" style="padding:24px 12px">'
			. '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden">'
			. '<tr><td style="background:#141B3A;padding:18px 24px;color:#D2A03A;font-weight:bold;font-size:18px;letter-spacing:.04em">EXPLORE KATSINA</td></tr>'
			. '<tr><td style="padding:28px 24px"><h1 style="margin:0 0 16px;font-size:22px;color:#8E1B2C">' . esc_html( $heading ) . '</h1>' . $body . '</td></tr>'
			. '<tr><td style="padding:16px 24px;background:#F3EDE1;color:#5B5965;font-size:12px">© ' . $year . ' Explore Katsina · info@explorekatsina.com.ng (placeholder)</td></tr>'
			. '</table></td></tr></table></body></html>';
	}

	/* ---- Business account events ---- */

	public static function business_submitted( $business_id ) {
		$p     = Business::profile( $business_id );
		$owner = get_userdata( Business::owner_id( $business_id ) );
		if ( $owner ) {
			self::send(
				$owner->user_email,
				__( 'We received your listing', 'explore-katsina' ),
				__( 'Thank you for listing your business', 'explore-katsina' ),
				array(
					/* translators: %s: business name */
					sprintf( __( 'We received "%s". Our team will check the details and approve it, usually within 2 working days.', 'explore-katsina' ), $p['name'] ),
					__( 'You can already log in to your dashboard to finish your profile. Your listing becomes visible to visitors once it is approved.', 'explore-katsina' ),
				),
				array( 'label' => __( 'Open my dashboard', 'explore-katsina' ), 'url' => Install::page_url( 'dashboard' ) ),
				array( 'event' => 'business_submitted', 'phone' => $p['whatsapp'] ? $p['whatsapp'] : $p['phone'] )
			);
		}
		self::send(
			self::admin_email(),
			/* translators: %s: business name */
			sprintf( __( 'New business waiting for approval: %s', 'explore-katsina' ), $p['name'] ),
			__( 'A new business needs your approval', 'explore-katsina' ),
			array(
				/* translators: 1: name, 2: type, 3: LGA */
				sprintf( __( '%1$s (%2$s, %3$s LGA) has signed up.', 'explore-katsina' ), $p['name'], Business::types()[ $p['type'] ]['label'] ?? $p['type'], $p['lga'] ),
				__( 'Check their ID and details, then approve or reject them.', 'explore-katsina' ),
			),
			array( 'label' => __( 'Review now', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-approvals&business=' . (int) $business_id ) ),
			array( 'event' => 'admin_business_submitted' )
		);
	}

	public static function business_decision( $business_id, $decision, $reason = '' ) {
		$p     = Business::profile( $business_id );
		$owner = get_userdata( Business::owner_id( $business_id ) );
		if ( ! $owner ) {
			return;
		}
		$dash = array( 'label' => __( 'Open my dashboard', 'explore-katsina' ), 'url' => Install::page_url( 'dashboard' ) );
		$ctx  = array( 'event' => 'business_' . $decision, 'phone' => $p['whatsapp'] ? $p['whatsapp'] : $p['phone'] );

		switch ( $decision ) {
			case 'approved':
				self::send(
					$owner->user_email,
					__( 'Your business is now live on Explore Katsina', 'explore-katsina' ),
					__( 'Approved! Your listing is live', 'explore-katsina' ),
					array(
						/* translators: %s: business name */
						sprintf( __( '"%s" has been approved and visitors can now find it.', 'explore-katsina' ), $p['name'] ),
						__( 'Tip: listings with at least 5 good photos, full opening hours and a WhatsApp number get more enquiries.', 'explore-katsina' ),
					),
					array( 'label' => __( 'See my listing', 'explore-katsina' ), 'url' => $p['url'] ),
					$ctx
				);
				break;
			case 'rejected':
				self::send(
					$owner->user_email,
					__( 'About your Explore Katsina listing', 'explore-katsina' ),
					__( 'We could not approve your listing yet', 'explore-katsina' ),
					array_filter(
						array(
							/* translators: %s: business name */
							sprintf( __( 'We could not approve "%s" yet.', 'explore-katsina' ), $p['name'] ),
							$reason ? __( 'Reason:', 'explore-katsina' ) . ' ' . $reason : '',
							__( 'You can correct the details in your dashboard and resubmit.', 'explore-katsina' ),
						)
					),
					$dash,
					$ctx
				);
				break;
			case 'paused':
				self::send(
					$owner->user_email,
					__( 'Your Explore Katsina listing is paused', 'explore-katsina' ),
					__( 'Your listing is paused', 'explore-katsina' ),
					array_filter(
						array(
							/* translators: %s: business name */
							sprintf( __( '"%s" is temporarily hidden from visitors.', 'explore-katsina' ), $p['name'] ),
							$reason ? __( 'Reason:', 'explore-katsina' ) . ' ' . $reason : '',
							__( 'Please contact us if you have any questions.', 'explore-katsina' ),
						)
					),
					$dash,
					$ctx
				);
				break;
			case 'resumed':
				self::send(
					$owner->user_email,
					__( 'Your Explore Katsina listing is live again', 'explore-katsina' ),
					__( 'Your listing is live again', 'explore-katsina' ),
					/* translators: %s: business name */
					array( sprintf( __( '"%s" is visible to visitors again.', 'explore-katsina' ), $p['name'] ) ),
					array( 'label' => __( 'See my listing', 'explore-katsina' ), 'url' => $p['url'] ),
					$ctx
				);
				break;
		}
	}

	public static function payout_requested( $business_id, $amount_kobo ) {
		$p = Business::profile( $business_id );
		self::send(
			self::admin_email(),
			/* translators: %s: business name */
			sprintf( __( 'Payout request: %s', 'explore-katsina' ), $p['name'] ),
			__( 'A business has requested a payout', 'explore-katsina' ),
			/* translators: 1: business, 2: amount */
			array( sprintf( __( '%1$s requested a payout of %2$s.', 'explore-katsina' ), $p['name'], Money::format( $amount_kobo ) ) ),
			array( 'label' => __( 'Review payouts', 'explore-katsina' ), 'url' => admin_url( 'admin.php?page=ek-approvals' ) ),
			array( 'event' => 'admin_payout_requested' )
		);
	}

	/* ---- Bookings ---- */

	private static function business_recipients( $business_id ) {
		$to    = array();
		$p     = Business::profile( $business_id );
		$owner = get_userdata( Business::owner_id( $business_id ) );
		if ( ! empty( $p['email'] ) ) {
			$to[] = $p['email'];
		}
		if ( $owner ) {
			$to[] = $owner->user_email;
		}
		return array_values( array_unique( array_map( 'strtolower', $to ) ) );
	}

	/** Summary lines used by every booking email. */
	public static function booking_lines( $b ) {
		$d     = $b->details;
		$lines = array(
			/* translators: %s: booking code */
			sprintf( __( 'Booking code: %s', 'explore-katsina' ), $b->code ),
		);
		if ( 'restaurant' === $b->kind ) {
			/* translators: 1: restaurant, 2: e.g. Table for 4 */
			$lines[] = sprintf( __( '%1$s · %2$s', 'explore-katsina' ), $d['business'] ?? '', $d['title'] ?? '' );
			/* translators: 1: date, 2: time */
			$lines[] = sprintf( __( '%1$s at %2$s', 'explore-katsina' ), wp_date( 'l j F Y', strtotime( $b->start_date ) ), substr( (string) $b->start_time, 0, 5 ) );
			if ( (int) $b->deposit_kobo ) {
				/* translators: %s: amount */
				$lines[] = sprintf( __( 'Deposit: %s (deducted from your bill)', 'explore-katsina' ), Money::format( $b->deposit_kobo ) );
			}
			return $lines;
		}
		if ( 'event' === $b->kind ) {
			$days    = array_keys( (array) ( $d['days'] ?? array() ) );
			$lines[] = ( $d['business'] ?? '' ) . ' · ' . ( $d['hall'] ?? '' );
			$lines[] = count( $days ) > 1
				? wp_date( 'D j M Y', strtotime( $b->start_date ) ) . ' – ' . wp_date( 'D j M Y', strtotime( $b->end_date ) )
				: wp_date( 'l j F Y', strtotime( $b->start_date ) );
			/* translators: 1: guests, 2: seated/standing, 3: event type */
			$lines[] = sprintf( __( '%1$d guests (%2$s) · %3$s', 'explore-katsina' ), (int) $b->guests, 'standing' === ( $d['layout'] ?? '' ) ? __( 'standing', 'explore-katsina' ) : __( 'seated', 'explore-katsina' ), Venue::event_types()[ $d['event_type'] ?? 'other' ] ?? '' );
			/* translators: %s: total */
			$lines[] = sprintf( __( 'Hall price: %s', 'explore-katsina' ), Money::format( $b->total_kobo ) );
			/* translators: %s: deposit */
			$lines[] = sprintf( __( 'Deposit: %s', 'explore-katsina' ), Money::format( $b->deposit_kobo ) ) . ( (int) $b->paid_kobo ? ' ' . __( '(paid)', 'explore-katsina' ) : '' );
			/* translators: %s: balance */
			$lines[] = sprintf( __( 'Balance to pay the venue: %s', 'explore-katsina' ), Money::format( (int) $b->total_kobo - (int) $b->deposit_kobo ) );
			return $lines;
		}
		if ( 'order' === $b->kind ) {
			$lines[] = ( $d['business'] ?? '' ) . ' · ' . ( $d['title'] ?? '' );
			foreach ( (array) ( $d['items'] ?? array() ) as $i ) {
				$lines[] = sprintf( '%d × %s  %s', (int) $i['qty'], $i['name'], Money::format( $i['price'] * $i['qty'] ) );
			}
			if ( ! empty( $d['delivery_fee'] ) ) {
				/* translators: %s: amount */
				$lines[] = sprintf( __( 'Delivery: %s', 'explore-katsina' ), Money::format( $d['delivery_fee'] ) );
			}
			if ( 'delivery' === ( $d['fulfilment'] ?? '' ) ) {
				$lines[] = __( 'Deliver to:', 'explore-katsina' ) . ' ' . ( $d['address'] ?? '' );
			}
			/* translators: %s: total */
			$lines[] = sprintf( __( 'Total: %s', 'explore-katsina' ), Money::format( $b->total_kobo ) ) . ( 'cash' === $b->payment_mode ? ' ' . __( '(pay on pickup/delivery)', 'explore-katsina' ) : '' );
			return $lines;
		}
		$lines[] = sprintf( /* translators: 1: hotel, 2: room, 3: rooms */ __( '%1$s · %2$s × %3$d', 'explore-katsina' ), $d['hotel'] ?? '', $d['room'] ?? '', (int) $b->quantity );
		$lines[] = sprintf( /* translators: 1: check-in date, 2: time, 3: check-out date, 4: time */ __( 'Check-in %1$s (from %2$s) · Check-out %3$s (by %4$s)', 'explore-katsina' ), wp_date( 'D j M Y', strtotime( $b->start_date ) ), $d['checkin_at'] ?? '', wp_date( 'D j M Y', strtotime( $b->end_date ) ), $d['checkout_at'] ?? '' );
		$lines[] = sprintf( /* translators: 1: nights, 2: guests */ __( '%1$d night(s) · %2$d guest(s)', 'explore-katsina' ), count( $d['nights'] ?? array() ), (int) $b->guests );
		$lines[] = sprintf( /* translators: %s: total */ __( 'Total: %s', 'explore-katsina' ), Money::format( $b->total_kobo ) );
		if ( (int) $b->paid_kobo > 0 ) {
			$lines[] = sprintf( /* translators: %s: amount */ __( 'Paid online: %s', 'explore-katsina' ), Money::format( $b->paid_kobo ) );
		}
		$due = (int) $b->total_kobo - (int) $b->paid_kobo;
		if ( $due > 0 ) {
			$lines[] = sprintf( /* translators: %s: amount */ __( 'To pay at the hotel: %s', 'explore-katsina' ), Money::format( $due ) );
		}
		return $lines;
	}

	private static function noun( $b ) {
		return array(
			'hotel'      => array( __( 'booking', 'explore-katsina' ), __( 'hotel', 'explore-katsina' ) ),
			'restaurant' => array( __( 'reservation', 'explore-katsina' ), __( 'restaurant', 'explore-katsina' ) ),
			'order'      => array( __( 'order', 'explore-katsina' ), __( 'restaurant', 'explore-katsina' ) ),
			'event'      => array( __( 'booking', 'explore-katsina' ), __( 'venue', 'explore-katsina' ) ),
		)[ $b->kind ] ?? array( __( 'booking', 'explore-katsina' ), __( 'business', 'explore-katsina' ) );
	}

	/** A booking is placed (pay at hotel) or paid online. */
	public static function booking_created( $b ) {
		$ctx = array( 'event' => 'booking_created', 'booking' => $b->code );
		self::send(
			$b->customer_email,
			/* translators: %s: booking code */
			sprintf( __( 'Booking received: %s', 'explore-katsina' ), $b->code ),
			'event' === $b->kind && 'deposit_paid' === $b->status ? __( 'Deposit received: your date is secured', 'explore-katsina' )
				/* translators: %s: booking/reservation/order */
				: ( 'requested' === $b->status ? __( 'Your request has been sent to the venue', 'explore-katsina' ) : sprintf( __( 'Thank you, your %s is in', 'explore-katsina' ), self::noun( $b )[0] ) ),
			array_merge(
				array(
					'event' === $b->kind && 'deposit_paid' === $b->status ? __( 'Your deposit is paid and the hall is reserved for you. Pay the balance directly to the venue as agreed.', 'explore-katsina' )
					: ( 'requested' === $b->status
						? __( 'The venue will reply within 48 hours. If they accept, you will have 72 hours to pay the deposit online to secure the date.', 'explore-katsina' )
						/* translators: 1: hotel/restaurant, 2: booking/reservation/order */
						: sprintf( __( 'The %1$s will confirm your %2$s shortly. We will email you as soon as they do.', 'explore-katsina' ), self::noun( $b )[1], self::noun( $b )[0] ) ),
				),
				self::booking_lines( $b ),
				! empty( $b->policy['text'] ) ? array( __( 'Cancellation policy:', 'explore-katsina' ) . ' ' . $b->policy['text'] ) : array()
			),
			array( 'label' => __( 'View my booking', 'explore-katsina' ), 'url' => Booking::link( $b ) ),
			$ctx + array( 'phone' => $b->customer_phone )
		);
		foreach ( self::business_recipients( $b->business_id ) as $to ) {
			self::send(
				$to,
				/* translators: %s: booking code */
				/* translators: 1: booking/reservation/order, 2: code */
				sprintf( __( 'New %1$s %2$s: please confirm', 'explore-katsina' ), self::noun( $b )[0], $b->code ),
				/* translators: %s: booking/reservation/order */
				sprintf( __( 'You have a new %s', 'explore-katsina' ), self::noun( $b )[0] ),
				array_merge(
					self::booking_lines( $b ),
					array(
						/* translators: 1: name, 2: phone */
						sprintf( __( 'Guest: %1$s · %2$s', 'explore-katsina' ), $b->customer_name, Business::display_phone( $b->customer_phone ) ),
						$b->notes ? __( 'Special requests:', 'explore-katsina' ) . ' ' . $b->notes : '',
						__( 'Please confirm or decline it from your dashboard as soon as possible. Quick responses improve your ranking.', 'explore-katsina' ),
					)
				),
				array( 'label' => __( 'Open dashboard', 'explore-katsina' ), 'url' => Dashboard::url( 'order' === $b->kind ? 'orders' : 'bookings', $b->business_id ) ),
				$ctx + array( 'audience' => 'business' )
			);
		}
		self::send(
			self::admin_email(),
			/* translators: 1: code, 2: hotel */
			sprintf( __( '[Explore Katsina] New booking %1$s at %2$s', 'explore-katsina' ), $b->code, $b->details['hotel'] ?? ( $b->details['business'] ?? '' ) ),
			__( 'New booking', 'explore-katsina' ),
			array_merge( self::booking_lines( $b ), array( __( 'Payment option:', 'explore-katsina' ) . ' ' . $b->payment_mode ) ),
			array(),
			$ctx + array( 'audience' => 'admin' )
		);
	}

	public static function booking_status( $b ) {
		$n     = self::noun( $b );
		$heads = array(
			/* translators: %s: booking/reservation */
			'confirmed'        => sprintf( __( 'Your %s is confirmed', 'explore-katsina' ), $n[0] ),
			/* translators: 1: hotel/restaurant, 2: booking/reservation/order */
			'declined'         => sprintf( __( 'The %1$s could not accept your %2$s', 'explore-katsina' ), $n[1], $n[0] ),
			/* translators: %s: booking/reservation/order */
			'cancelled'        => sprintf( __( 'Your %s has been cancelled', 'explore-katsina' ), $n[0] ),
			'accepted'         => __( 'Your order was accepted', 'explore-katsina' ),
			'ready'            => __( 'Your order is ready for pickup', 'explore-katsina' ),
			'out_for_delivery' => __( 'Your order is on its way', 'explore-katsina' ),
		);
		if ( 'event' === $b->kind && 'confirmed' === $b->status ) {
			$heads['confirmed'] = __( 'The venue accepted your request: pay the deposit to secure your date', 'explore-katsina' );
		}
		$extra = array();
		if ( 'event' === $b->kind && 'confirmed' === $b->status ) {
			/* translators: %s: amount */
			$extra[] = sprintf( __( 'Pay the %s deposit within 72 hours using the button below, or the date will be released.', 'explore-katsina' ), Money::format( $b->deposit_kobo ) );
		}
		if ( in_array( $b->status, array( 'declined', 'cancelled' ), true ) && (int) $b->paid_kobo > 0 ) {
			$extra[] = __( 'You paid online for this booking. Our team will review your refund and contact you.', 'explore-katsina' );
		}
		self::send(
			$b->customer_email,
			/* translators: 1: heading, 2: code */
			sprintf( '%1$s (%2$s)', $heads[ $b->status ] ?? $b->status, $b->code ),
			$heads[ $b->status ] ?? $b->status,
			array_merge( self::booking_lines( $b ), $extra ),
			array( 'label' => __( 'View my booking', 'explore-katsina' ), 'url' => Booking::link( $b ) ),
			array( 'event' => 'booking_' . $b->status, 'booking' => $b->code, 'phone' => $b->customer_phone )
		);
		if ( in_array( $b->status, array( 'declined', 'cancelled' ), true ) ) {
			self::send(
				self::admin_email(),
				/* translators: 1: code, 2: status */
				sprintf( __( '[Explore Katsina] Booking %1$s is now %2$s', 'explore-katsina' ), $b->code, $b->status ),
				__( 'Booking status changed', 'explore-katsina' ),
				self::booking_lines( $b ),
				array(),
				array( 'event' => 'admin_booking_' . $b->status )
			);
		}
	}

	public static function payment_conflict( $b ) {
		self::send(
			self::admin_email(),
			/* translators: %s: code */
			sprintf( __( 'ACTION NEEDED: payment for %s arrived after the room was taken', 'explore-katsina' ), $b->code ),
			__( 'Payment needs a refund or a new room', 'explore-katsina' ),
			array_merge( array( __( 'The guest paid after their 15-minute hold ran out, and the room was booked by someone else in the meantime. Contact the guest and the hotel, then refund or rebook.', 'explore-katsina' ) ), self::booking_lines( $b ) ),
			array(),
			array( 'event' => 'admin_payment_conflict' )
		);
		self::send(
			$b->customer_email,
			/* translators: %s: code */
			sprintf( __( 'About your payment for %s', 'explore-katsina' ), $b->code ),
			__( 'We received your payment, but the room is no longer free', 'explore-katsina' ),
			array( __( 'Your payment arrived after the room was taken. Our team will contact you within 1 working day to arrange another room or a full refund.', 'explore-katsina' ) ),
			array(),
			array( 'event' => 'payment_conflict', 'phone' => $b->customer_phone )
		);
	}

	public static function refund_review( $b, $why ) {
		self::send(
			self::admin_email(),
			/* translators: 1: code, 2: reason */
			sprintf( __( 'Refund review needed: %1$s (%2$s)', 'explore-katsina' ), $b->code, $why ),
			__( 'A paid booking needs a refund decision', 'explore-katsina' ),
			self::booking_lines( $b ),
			array(),
			array( 'event' => 'admin_refund_review' )
		);
	}
}
