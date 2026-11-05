<?php
/**
 * Encryption for sensitive values (bank account name/number) using libsodium.
 *
 * The key comes from the EK_ENCRYPTION_KEY constant in wp-config.php (base64 of
 * 32 random bytes). setup.sh creates it. KEEP A COPY OF THIS KEY SAFE: without it,
 * saved bank details cannot be read. If the constant is missing, a key derived
 * from WordPress's AUTH_KEY is used, and the admin sees a warning.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Crypto {

	const PREFIX = 'ek1:';

	public static function has_dedicated_key() {
		return defined( 'EK_ENCRYPTION_KEY' ) && 32 === strlen( (string) base64_decode( EK_ENCRYPTION_KEY, true ) );
	}

	private static function key() {
		if ( self::has_dedicated_key() ) {
			return base64_decode( EK_ENCRYPTION_KEY, true );
		}
		return hash( 'sha256', 'ek-fallback|' . wp_salt( 'auth' ), true );
	}

	public static function encrypt( $plain ) {
		$plain = (string) $plain;
		if ( '' === $plain ) {
			return '';
		}
		$nonce = random_bytes( SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$box   = sodium_crypto_secretbox( $plain, $nonce, self::key() );
		return self::PREFIX . base64_encode( $nonce . $box );
	}

	public static function decrypt( $stored ) {
		$stored = (string) $stored;
		if ( '' === $stored || 0 !== strpos( $stored, self::PREFIX ) ) {
			return '';
		}
		$raw = base64_decode( substr( $stored, strlen( self::PREFIX ) ), true );
		if ( false === $raw || strlen( $raw ) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES ) {
			return '';
		}
		$nonce = substr( $raw, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$box   = substr( $raw, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES );
		$plain = sodium_crypto_secretbox_open( $box, $nonce, self::key() );
		return false === $plain ? '' : $plain;
	}

	public static function mask_account( $last4 ) {
		return $last4 ? '••••••' . $last4 : '';
	}
}
