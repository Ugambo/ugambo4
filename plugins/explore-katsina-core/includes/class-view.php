<?php
/**
 * Small template helpers shared by sign-up, dashboard and admin.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class View {

	public static function render( $template, array $vars = array() ) {
		$file = EK_DIR . 'templates/' . $template . '.php';
		if ( ! is_readable( $file ) ) {
			return '';
		}
		extract( $vars, EXTR_SKIP ); // phpcs:ignore WordPress.PHP.DontExtract
		ob_start();
		include $file;
		return ob_get_clean();
	}

	/** Error message under a field. */
	public static function error( array $errors, $key ) {
		if ( empty( $errors[ $key ] ) ) {
			return '';
		}
		return '<span class="ek-error" id="err-' . esc_attr( $key ) . '" role="alert">' . esc_html( $errors[ $key ] ) . '</span>';
	}

	public static function field_class( array $errors, $key ) {
		return 'ek-field' . ( empty( $errors[ $key ] ) ? '' : ' has-error' );
	}

	public static function aria( array $errors, $key ) {
		return empty( $errors[ $key ] ) ? '' : ' aria-invalid="true" aria-describedby="err-' . esc_attr( $key ) . '"';
	}

	/** Flash messages survive one redirect (Post/Redirect/Get). */
	public static function flash( $type, $message, $user_id = 0 ) {
		$key  = 'ek_flash_' . ( $user_id ? $user_id : self::visitor_key() );
		$list = (array) get_transient( $key );
		$list[] = array(
			'type' => $type,
			'msg'  => $message,
		);
		set_transient( $key, $list, 5 * MINUTE_IN_SECONDS );
	}

	public static function flashes( $user_id = 0 ) {
		$key  = 'ek_flash_' . ( $user_id ? $user_id : self::visitor_key() );
		$list = (array) get_transient( $key );
		delete_transient( $key );
		$out = '';
		foreach ( array_filter( $list ) as $f ) {
			$out .= '<div class="ek-notice ek-notice--' . esc_attr( $f['type'] ) . '" role="status">' . esc_html( $f['msg'] ) . '</div>';
		}
		return $out;
	}

	private static function visitor_key() {
		$ip = sanitize_text_field( wp_unslash( $_SERVER['REMOTE_ADDR'] ?? '' ) );
		return substr( hash( 'sha256', wp_salt( 'nonce' ) . $ip ), 0, 20 );
	}

	public static function lga_options( $selected = 0 ) {
		$terms = get_terms(
			array(
				'taxonomy'   => Post_Types::TAX_LGA,
				'hide_empty' => false,
				'orderby'    => 'name',
			)
		);
		$out = '<option value="">' . esc_html__( 'Choose LGA…', 'explore-katsina' ) . '</option>';
		foreach ( (array) $terms as $t ) {
			$out .= '<option value="' . (int) $t->term_id . '"' . selected( (int) $selected, (int) $t->term_id, false ) . '>' . esc_html( $t->name ) . '</option>';
		}
		return $out;
	}

	public static function banks() {
		// Suggestions only; owners can type any bank or microfinance bank name.
		return array(
			'Access Bank', 'Citibank Nigeria', 'Ecobank Nigeria', 'Fidelity Bank', 'First Bank of Nigeria',
			'First City Monument Bank (FCMB)', 'Globus Bank', 'Guaranty Trust Bank (GTBank)', 'Jaiz Bank', 'Keystone Bank',
			'Kuda Microfinance Bank', 'Lotus Bank', 'Moniepoint Microfinance Bank', 'OPay', 'Optimus Bank', 'PalmPay',
			'Parallex Bank', 'Polaris Bank', 'Premium Trust Bank', 'Providus Bank', 'Signature Bank', 'Stanbic IBTC Bank',
			'Standard Chartered Bank', 'Sterling Bank', 'SunTrust Bank', 'TajBank', 'Titan Trust Bank', 'Union Bank of Nigeria',
			'United Bank for Africa (UBA)', 'Unity Bank', 'Wema Bank', 'Zenith Bank',
		);
	}

	public static function stars( $rating ) {
		$r = max( 0, min( 5, (int) round( (float) $rating ) ) );
		/* translators: %d: stars out of 5 */
		return '<span class="ek-stars" aria-label="' . esc_attr( sprintf( __( '%d out of 5 stars', 'explore-katsina' ), $r ) ) . '">' . str_repeat( '★', $r ) . str_repeat( '☆', 5 - $r ) . '</span>';
	}

	/** Small inline SVG sparkline. */
	public static function sparkline( array $values ) {
		$values = array_values( $values );
		$n      = count( $values );
		if ( $n < 2 ) {
			return '';
		}
		$max = max( 1, max( $values ) );
		$w   = 120;
		$h   = 36;
		$pts = array();
		foreach ( $values as $i => $v ) {
			$pts[] = round( $i * $w / ( $n - 1 ), 1 ) . ',' . round( $h - 3 - ( $v / $max ) * ( $h - 6 ), 1 );
		}
		$line = implode( ' ', $pts );
		$area = '0,' . $h . ' ' . $line . ' ' . $w . ',' . $h;
		$last = end( $pts );
		list( $lx, $ly ) = explode( ',', $last );
		return '<svg class="ek-spark" viewBox="0 0 ' . $w . ' ' . $h . '" preserveAspectRatio="none" aria-hidden="true">'
			. '<polygon points="' . esc_attr( $area ) . '" fill="rgba(142,27,44,.10)"/>'
			. '<polyline points="' . esc_attr( $line ) . '" fill="none" stroke="#8E1B2C" stroke-width="1.6" vector-effect="non-scaling-stroke"/>'
			. '<circle cx="' . esc_attr( $lx ) . '" cy="' . esc_attr( $ly ) . '" r="2.4" fill="#8E1B2C"/></svg>';
	}

	/** A proper http(s) link typed by the admin (format only: no network lookup). */
	public static function valid_url( $url ) {
		$url = trim( (string) $url );
		return $url && filter_var( $url, FILTER_VALIDATE_URL ) && in_array( strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) ), array( 'http', 'https' ), true ) ? esc_url_raw( $url ) : '';
	}

	public static function date( $mysql_gmt, $with_time = false ) {
		if ( ! $mysql_gmt ) {
			return '';
		}
		$ts = strtotime( $mysql_gmt . ' UTC' );
		return wp_date( $with_time ? 'j M Y, g:i a' : 'j M Y', $ts, new \DateTimeZone( 'Africa/Lagos' ) );
	}

	/**
	 * Photo credits for a business page: every attached photo that carries licence details
	 * (author, licence, source), e.g. royalty-free sample photos from Wikimedia Commons.
	 */
	public static function photo_credits( $business_id ) {
		$atts = get_posts(
			array(
				'post_type'      => 'attachment',
				'post_parent'    => (int) $business_id,
				'posts_per_page' => 50,
				'meta_key'       => '_ek_credit', // phpcs:ignore
				'fields'         => 'ids',
			)
		);
		return self::credits_for( $atts, __( 'Illustrative photos from Wikimedia Commons, used under the licences shown.', 'explore-katsina' ) );
	}

	/** Photo credits for a list of attachments (only those that carry licence details). */
	public static function credits_for( array $ids, $note = '' ) {
		$items = array();
		foreach ( $ids as $id ) {
			$c = get_post_meta( (int) $id, '_ek_credit', true );
			if ( ! is_array( $c ) || empty( $c['license'] ) ) {
				continue;
			}
			$lic  = ! empty( $c['license_url'] ) ? '<a href="' . esc_url( $c['license_url'] ) . '" rel="license noopener" target="_blank">' . esc_html( $c['license'] ) . '</a>' : esc_html( $c['license'] );
			$src  = ! empty( $c['source'] ) ? ' · <a href="' . esc_url( $c['source'] ) . '" rel="noopener" target="_blank">' . esc_html__( 'source', 'explore-katsina' ) . '</a>' : '';
			$who  = ! empty( $c['author'] ) ? esc_html( $c['author'] ) : esc_html__( 'Unknown author', 'explore-katsina' );
			$items[ md5( $c['source'] ?? $id ) ] = '<li>' . $who . ' · ' . $lic . $src . '</li>';
		}
		if ( ! $items ) {
			return '';
		}
		return '<details class="ek-credits"><summary>' . esc_html__( 'Photo credits', 'explore-katsina' ) . '</summary><ul>' . implode( '', $items ) . '</ul><p class="ek-small ek-muted">' . esc_html( $note ? $note : __( 'Photos from Wikimedia Commons, used under the licences shown.', 'explore-katsina' ) ) . '</p></details>';
	}
}
