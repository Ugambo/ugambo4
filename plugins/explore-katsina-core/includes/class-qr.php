<?php
/**
 * Small QR code maker for emails (Phase 15): ticket emails carry each ticket's QR code, drawn as a plain
 * HTML table of black and white squares, so it shows in every email app even when pictures are blocked.
 *
 * Standard QR (ISO/IEC 18004): byte mode, error-correction level M, versions 1–6 (up to 106 characters,
 * plenty for ticket codes), all 8 masks tried and the most readable one chosen. Written for this plugin;
 * the browser test scans the emailed code with the check-in page's own scanner (jsQR) to prove it works.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Qr {

	/** Level M, versions 1–6: error-correction codewords per block, and number of blocks. */
	const ECC_PER_BLOCK = array( 1 => 10, 16, 26, 18, 24, 16 );
	const BLOCKS        = array( 1 => 1, 1, 1, 2, 2, 4 );

	/**
	 * @return bool[][]|null Square matrix (true = dark), or null if the text is too long.
	 */
	public static function matrix( $text ) {
		$data = array_values( unpack( 'C*', (string) $text ) ?: array() ); // phpcs:ignore
		for ( $ver = 1; $ver <= 6; $ver++ ) {
			$capacity = self::data_codewords( $ver );
			if ( count( $data ) + 2 <= $capacity ) { // 4 mode bits + 8 length bits + terminator fit in 2 bytes.
				return self::build( $ver, $data );
			}
		}
		return null;
	}

	/** The QR code as an email-safe HTML table (with the white quiet zone around it). */
	public static function html_table( $text, $cell = 4 ) {
		$m = self::matrix( $text );
		if ( ! $m ) {
			return '';
		}
		$n    = count( $m );
		$q    = 4; // Quiet zone.
		$cell = (int) $cell;
		$td   = static fn( $dark ) => '<td width="' . $cell . '" height="' . $cell . '" style="width:' . $cell . 'px;height:' . $cell . 'px;padding:0;font-size:0;line-height:0;background:' . ( $dark ? '#000000' : '#ffffff' ) . '" bgcolor="' . ( $dark ? '#000000' : '#ffffff' ) . '"></td>';
		$html = '<table role="img" aria-label="' . esc_attr( sprintf( /* translators: %s: code */ __( 'QR code for %s', 'explore-katsina' ), $text ) ) . '" class="ek-qr" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;border:0;margin:8px 0;background:#ffffff" bgcolor="#ffffff">';
		for ( $r = -$q; $r < $n + $q; $r++ ) {
			$html .= '<tr>';
			for ( $c = -$q; $c < $n + $q; $c++ ) {
				$html .= $td( $r >= 0 && $c >= 0 && $r < $n && $c < $n && $m[ $r ][ $c ] );
			}
			$html .= '</tr>';
		}
		return $html . '</table>';
	}

	/* ---------------- Building ---------------- */

	private static function size( $ver ) {
		return 4 * $ver + 17;
	}

	private static function raw_modules( $ver ) {
		$r = ( 16 * $ver + 128 ) * $ver + 64;
		if ( $ver >= 2 ) {
			$align = intdiv( $ver, 7 ) + 2;
			$r    -= ( 25 * $align - 10 ) * $align - 55;
		}
		return $r;
	}

	private static function data_codewords( $ver ) {
		return intdiv( self::raw_modules( $ver ), 8 ) - self::ECC_PER_BLOCK[ $ver ] * self::BLOCKS[ $ver ];
	}

	private static function build( $ver, array $data ) {
		// Bit stream: byte mode (0100), 8-bit length, the bytes, terminator, padding.
		$bits = array();
		$put  = static function ( $val, $len ) use ( &$bits ) {
			for ( $i = $len - 1; $i >= 0; $i-- ) {
				$bits[] = ( $val >> $i ) & 1;
			}
		};
		$put( 4, 4 );
		$put( count( $data ), 8 );
		foreach ( $data as $b ) {
			$put( $b, 8 );
		}
		$cap = self::data_codewords( $ver ) * 8;
		$put( 0, min( 4, $cap - count( $bits ) ) );
		$put( 0, ( 8 - count( $bits ) % 8 ) % 8 );
		for ( $pad = 0xEC; count( $bits ) < $cap; $pad ^= 0xEC ^ 0x11 ) {
			$put( $pad, 8 );
		}
		$words = array();
		foreach ( array_chunk( $bits, 8 ) as $byte ) {
			$words[] = bindec( implode( '', $byte ) );
		}
		$codewords = self::add_ecc( $ver, $words );

		$n      = self::size( $ver );
		$mods   = array_fill( 0, $n, array_fill( 0, $n, false ) );
		$isfunc = array_fill( 0, $n, array_fill( 0, $n, false ) );
		self::function_patterns( $ver, $mods, $isfunc );
		self::place( $codewords, $mods, $isfunc );

		$best = null;
		$best_score = PHP_INT_MAX;
		for ( $mask = 0; $mask < 8; $mask++ ) {
			$m = self::apply_mask( $mods, $isfunc, $mask );
			self::format_bits( $mask, $m, $isfunc );
			$score = self::penalty( $m );
			if ( $score < $best_score ) {
				$best_score = $score;
				$best       = $m;
			}
		}
		return $best;
	}

	private static function set( array &$mods, array &$isfunc, $x, $y, $dark ) {
		$mods[ $y ][ $x ]   = (bool) $dark;
		$isfunc[ $y ][ $x ] = true;
	}

	private static function function_patterns( $ver, array &$mods, array &$isfunc ) {
		$n = self::size( $ver );
		for ( $i = 0; $i < $n; $i++ ) { // Timing patterns.
			self::set( $mods, $isfunc, 6, $i, 0 === $i % 2 );
			self::set( $mods, $isfunc, $i, 6, 0 === $i % 2 );
		}
		foreach ( array( array( 3, 3 ), array( $n - 4, 3 ), array( 3, $n - 4 ) ) as $c ) { // Finder patterns + separators.
			for ( $dy = -4; $dy <= 4; $dy++ ) {
				for ( $dx = -4; $dx <= 4; $dx++ ) {
					$x = $c[0] + $dx;
					$y = $c[1] + $dy;
					if ( $x >= 0 && $x < $n && $y >= 0 && $y < $n ) {
						$d = max( abs( $dx ), abs( $dy ) );
						self::set( $mods, $isfunc, $x, $y, 2 !== $d && 4 !== $d );
					}
				}
			}
		}
		if ( $ver >= 2 ) { // One alignment pattern (versions 2–6).
			$p = $n - 7;
			for ( $dy = -2; $dy <= 2; $dy++ ) {
				for ( $dx = -2; $dx <= 2; $dx++ ) {
					self::set( $mods, $isfunc, $p + $dx, $p + $dy, 1 !== max( abs( $dx ), abs( $dy ) ) );
				}
			}
		}
		self::format_bits( 0, $mods, $isfunc ); // Reserve the format areas (real bits drawn per mask).
	}

	private static function format_bits( $mask, array &$m, array &$isfunc ) {
		$n    = count( $m );
		$data = ( 0 << 3 ) | $mask; // Level M = 00.
		$rem  = $data;
		for ( $i = 0; $i < 10; $i++ ) {
			$rem = ( $rem << 1 ) ^ ( ( $rem >> 9 ) * 0x537 );
		}
		$bits = ( ( $data << 10 ) | $rem ) ^ 0x5412;
		$bit  = static fn( $i ) => 1 === ( ( $bits >> $i ) & 1 );
		for ( $i = 0; $i <= 5; $i++ ) {
			self::set( $m, $isfunc, 8, $i, $bit( $i ) );
		}
		self::set( $m, $isfunc, 8, 7, $bit( 6 ) );
		self::set( $m, $isfunc, 8, 8, $bit( 7 ) );
		self::set( $m, $isfunc, 7, 8, $bit( 8 ) );
		for ( $i = 9; $i < 15; $i++ ) {
			self::set( $m, $isfunc, 14 - $i, 8, $bit( $i ) );
		}
		for ( $i = 0; $i < 8; $i++ ) {
			self::set( $m, $isfunc, $n - 1 - $i, 8, $bit( $i ) );
		}
		for ( $i = 8; $i < 15; $i++ ) {
			self::set( $m, $isfunc, 8, $n - 15 + $i, $bit( $i ) );
		}
		self::set( $m, $isfunc, 8, $n - 8, true ); // Always-dark module.
	}

	private static function place( array $codewords, array &$mods, array $isfunc ) {
		$n     = count( $mods );
		$total = count( $codewords ) * 8;
		$i     = 0;
		for ( $right = $n - 1; $right >= 1; $right -= 2 ) {
			if ( 6 === $right ) {
				$right = 5;
			}
			for ( $vert = 0; $vert < $n; $vert++ ) {
				for ( $j = 0; $j < 2; $j++ ) {
					$x      = $right - $j;
					$upward = 0 === ( ( $right + 1 ) & 2 );
					$y      = $upward ? $n - 1 - $vert : $vert;
					if ( ! $isfunc[ $y ][ $x ] && $i < $total ) {
						$mods[ $y ][ $x ] = 1 === ( ( $codewords[ $i >> 3 ] >> ( 7 - ( $i & 7 ) ) ) & 1 );
						$i++;
					}
				}
			}
		}
	}

	private static function apply_mask( array $mods, array $isfunc, $mask ) {
		$n = count( $mods );
		for ( $y = 0; $y < $n; $y++ ) {
			for ( $x = 0; $x < $n; $x++ ) {
				if ( $isfunc[ $y ][ $x ] ) {
					continue;
				}
				switch ( $mask ) {
					case 0: $inv = 0 === ( $x + $y ) % 2; break;
					case 1: $inv = 0 === $y % 2; break;
					case 2: $inv = 0 === $x % 3; break;
					case 3: $inv = 0 === ( $x + $y ) % 3; break;
					case 4: $inv = 0 === ( intdiv( $x, 3 ) + intdiv( $y, 2 ) ) % 2; break;
					case 5: $inv = 0 === $x * $y % 2 + $x * $y % 3; break;
					case 6: $inv = 0 === ( $x * $y % 2 + $x * $y % 3 ) % 2; break;
					default: $inv = 0 === ( ( $x + $y ) % 2 + $x * $y % 3 ) % 2;
				}
				if ( $inv ) {
					$mods[ $y ][ $x ] = ! $mods[ $y ][ $x ];
				}
			}
		}
		return $mods;
	}

	/** Readability score (lower is better): long runs, 2×2 blocks, finder look-alikes, dark/light balance. */
	private static function penalty( array $m ) {
		$n     = count( $m );
		$score = 0;
		$dark  = 0;
		foreach ( array( false, true ) as $cols ) {
			for ( $a = 0; $a < $n; $a++ ) {
				$line = array();
				for ( $b = 0; $b < $n; $b++ ) {
					$line[] = $cols ? $m[ $b ][ $a ] : $m[ $a ][ $b ];
				}
				$run = 1;
				for ( $b = 1; $b <= $n; $b++ ) {
					if ( $b < $n && $line[ $b ] === $line[ $b - 1 ] ) {
						$run++;
						continue;
					}
					if ( $run >= 5 ) {
						$score += 3 + $run - 5;
					}
					$run = 1;
				}
				$s = implode( '', array_map( 'intval', $line ) );
				$score += 40 * ( substr_count( $s, '10111010000' ) + substr_count( $s, '00001011101' ) );
			}
		}
		for ( $y = 0; $y < $n; $y++ ) {
			for ( $x = 0; $x < $n; $x++ ) {
				$dark += $m[ $y ][ $x ] ? 1 : 0;
				if ( $x < $n - 1 && $y < $n - 1 && $m[ $y ][ $x ] === $m[ $y ][ $x + 1 ] && $m[ $y ][ $x ] === $m[ $y + 1 ][ $x ] && $m[ $y ][ $x ] === $m[ $y + 1 ][ $x + 1 ] ) {
					$score += 3;
				}
			}
		}
		return $score + 10 * (int) floor( abs( $dark * 100 / ( $n * $n ) - 50 ) / 5 );
	}

	/* ---------------- Error correction (Reed–Solomon over GF(256)) ---------------- */

	private static function add_ecc( $ver, array $data ) {
		$nblocks  = self::BLOCKS[ $ver ];
		$ecclen   = self::ECC_PER_BLOCK[ $ver ];
		$raw      = intdiv( self::raw_modules( $ver ), 8 );
		$short    = $nblocks - $raw % $nblocks;
		$shortlen = intdiv( $raw, $nblocks );
		$div      = self::rs_divisor( $ecclen );
		$blocks   = array();
		$eccs     = array();
		for ( $i = 0, $k = 0; $i < $nblocks; $i++ ) {
			$len      = $shortlen - $ecclen + ( $i < $short ? 0 : 1 );
			$blk      = array_slice( $data, $k, $len );
			$k       += $len;
			$blocks[] = $blk;
			$eccs[]   = self::rs_remainder( $blk, $div );
		}
		$out = array();
		$max = max( array_map( 'count', $blocks ) );
		for ( $i = 0; $i < $max; $i++ ) {
			foreach ( $blocks as $blk ) {
				if ( isset( $blk[ $i ] ) ) {
					$out[] = $blk[ $i ];
				}
			}
		}
		for ( $i = 0; $i < $ecclen; $i++ ) {
			foreach ( $eccs as $e ) {
				$out[] = $e[ $i ];
			}
		}
		return $out;
	}

	private static function gf_mul( $x, $y ) {
		$z = 0;
		for ( $i = 7; $i >= 0; $i-- ) {
			$z  = ( $z << 1 ) ^ ( ( $z >> 7 ) * 0x11D );
			$z ^= ( ( $y >> $i ) & 1 ) * $x;
		}
		return $z & 0xFF;
	}

	private static function rs_divisor( $degree ) {
		$result = array_fill( 0, $degree, 0 );
		$result[ $degree - 1 ] = 1;
		$root = 1;
		for ( $i = 0; $i < $degree; $i++ ) {
			for ( $j = 0; $j < $degree; $j++ ) {
				$result[ $j ] = self::gf_mul( $result[ $j ], $root );
				if ( $j + 1 < $degree ) {
					$result[ $j ] ^= $result[ $j + 1 ];
				}
			}
			$root = self::gf_mul( $root, 0x02 );
		}
		return $result;
	}

	private static function rs_remainder( array $data, array $divisor ) {
		$result = array_fill( 0, count( $divisor ), 0 );
		foreach ( $data as $b ) {
			$factor = $b ^ array_shift( $result );
			$result[] = 0;
			foreach ( $divisor as $i => $coef ) {
				$result[ $i ] ^= self::gf_mul( $coef, $factor );
			}
		}
		return $result;
	}
}
