<?php
/**
 * Imports the researched guide content in content/guide/ (attractions, festivals, "Plan your trip"
 * pages, draft stories) and their Wikimedia Commons photos with credits.
 *
 * Re-run safe: each item remembers its guide key (meta _ek_guide_key), so running again only adds
 * what is missing. Items you have edited in wp-admin are left alone unless you pass --update.
 * Photos are taken from a folder of Commons downloads (scripts/fetch_commons.py) with credits.json;
 * a missing photo is simply skipped and added on a later run.
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Guide_Import {

	const KEY = '_ek_guide_key';

	private $media;
	private $credits = array();
	private $update;
	private $out = array( 'created' => 0, 'updated' => 0, 'skipped' => 0, 'photos' => 0 );
	private $pending_links = array();

	public function __construct( $media_dir = '', $update = false ) {
		$this->media  = $media_dir ? trailingslashit( $media_dir ) : '';
		$this->update = (bool) $update;
		if ( $this->media && file_exists( $this->media . 'credits.json' ) ) {
			$this->credits = (array) json_decode( (string) file_get_contents( $this->media . 'credits.json' ), true );
		}
	}

	private static function load( $file ) {
		$path = EK_DIR . 'content/guide/' . $file . '.php';
		return file_exists( $path ) ? (array) include $path : array();
	}

	/** @return array counts */
	public function run() {
		require_once ABSPATH . 'wp-admin/includes/image.php';
		require_once ABSPATH . 'wp-admin/includes/file.php';
		require_once ABSPATH . 'wp-admin/includes/media.php';
		Install::add_terms();

		foreach ( self::load( 'attractions' ) as $a ) {
			$this->attraction( $a );
		}
		foreach ( self::load( 'events' ) as $e ) {
			$this->event( $e );
		}
		$parent = 0;
		foreach ( self::load( 'pages' ) as $i => $p ) {
			$id = $this->page( $p, $parent );
			if ( 0 === $i ) {
				$parent = $id;
				$ids    = (array) get_option( 'ek_pages', array() );
				$ids['plan_trip'] = $id;
				update_option( 'ek_pages', $ids );
			}
		}
		foreach ( self::load( 'stories' ) as $s ) {
			$this->story( $s );
		}
		$this->resolve_links();
		Map_Index::flush();
		return $this->out;
	}

	/** Find the post created for a guide key, or null. */
	public static function find( $type, $key ) {
		$ids = get_posts( array( 'post_type' => $type, 'post_status' => 'any', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => self::KEY, 'meta_value' => $key ) ); // phpcs:ignore
		return $ids ? (int) $ids[0] : null;
	}

	/** Create, update (with --update) or skip. Returns [id, is_new_or_updated]. */
	private function upsert( $type, $key, array $post ) {
		$id = self::find( $type, $key );
		if ( $id && ! $this->update ) {
			$this->out['skipped']++;
			return array( $id, false );
		}
		$post['post_type'] = $type;
		if ( $id ) {
			$post['ID'] = $id;
			unset( $post['post_status'] ); // Never re-publish or un-publish on update.
			wp_update_post( wp_slash( $post ) );
			$this->out['updated']++;
		} else {
			$id = wp_insert_post( wp_slash( $post ), true );
			if ( is_wp_error( $id ) ) {
				throw new \RuntimeException( $key . ': ' . $id->get_error_message() );
			}
			update_post_meta( $id, self::KEY, $key );
			$this->out['created']++;
		}
		$this->pending_links[] = $id;
		return array( (int) $id, true );
	}

	private function attraction( array $a ) {
		list( $id, $write ) = $this->upsert(
			Attractions::CPT,
			'attraction:' . $a['slug'],
			array( 'post_title' => $a['title'], 'post_name' => $a['slug'], 'post_status' => 'publish', 'post_content' => $a['content'], 'post_excerpt' => $a['excerpt'] )
		);
		if ( $write ) {
			wp_set_object_terms( $id, $a['categories'], Attractions::TAX );
			wp_set_object_terms( $id, array( $a['lga'] ), Post_Types::TAX_LGA );
			$meta = array(
				'_ek_history'    => $a['history'],
				'_ek_best_time'  => $a['best_time'],
				'_ek_directions' => $a['directions'],
				'_ek_sources'    => $a['sources'],
				'_ek_pin_note'   => $a['pin_note'],
				'_ek_entry_fee'  => '',
				'_ek_hours_text' => '',
				'_ek_unverified' => 1,
			);
			foreach ( $meta as $k => $v ) {
				update_post_meta( $id, $k, $v );
			}
			if ( is_numeric( $a['lat'] ) && is_numeric( $a['lng'] ) ) {
				update_post_meta( $id, '_ek_lat', (float) $a['lat'] );
				update_post_meta( $id, '_ek_lng', (float) $a['lng'] );
			}
		}
		$this->photos( $id, $a['photos'] ?? array(), $a['captions'] ?? array() );
		Map_Index::queue( $id );
	}

	private function event( array $e ) {
		list( $id, $write ) = $this->upsert(
			Events::CPT,
			'event:' . $e['slug'],
			array( 'post_title' => $e['title'], 'post_name' => $e['slug'], 'post_status' => 'publish', 'post_content' => $e['content'], 'post_excerpt' => $e['excerpt'] )
		);
		if ( $write ) {
			wp_set_object_terms( $id, $e['types'], Events::TAX );
			wp_set_object_terms( $id, array( $e['lga'] ), Post_Types::TAX_LGA );
			update_post_meta( $id, '_ek_date_tbc', 1 );
			update_post_meta( $id, '_ek_start', '' );
			update_post_meta( $id, '_ek_end', '' );
			update_post_meta( $id, '_ek_venue', $e['venue'] );
			update_post_meta( $id, '_ek_lat', (float) $e['lat'] );
			update_post_meta( $id, '_ek_lng', (float) $e['lng'] );
			update_post_meta( $id, '_ek_sources', $e['sources'] );
		}
		$this->photos( $id, $e['photos'] ?? array(), $e['captions'] ?? array() );
	}

	private function page( array $p, $parent ) {
		list( $id, $write ) = $this->upsert(
			'page',
			'page:' . $p['slug'],
			array( 'post_title' => $p['title'], 'post_name' => $p['slug'], 'post_status' => 'publish', 'post_content' => $p['content'], 'post_excerpt' => $p['excerpt'], 'post_parent' => (int) $parent )
		);
		return $id;
	}

	private function story( array $s ) {
		$cat = get_term_by( 'slug', $s['category'], 'category' );
		list( $id, $write ) = $this->upsert(
			'post',
			'story:' . $s['slug'],
			array( 'post_title' => $s['title'], 'post_name' => $s['slug'], 'post_status' => 'draft', 'post_content' => $s['content'], 'post_excerpt' => $s['excerpt'], 'post_category' => $cat ? array( (int) $cat->term_id ) : array() )
		);
		if ( $write ) {
			update_post_meta( $id, '_ek_sources', $s['sources'] );
		}
		$keys = $s['gallery'] ?? ( empty( $s['photo'] ) ? array() : array( $s['photo'] ) );
		$this->photos( $id, $keys, $s['captions'] ?? array() );
	}

	/**
	 * Attach Commons photos (once each, matched by _ek_media_key) and set the gallery, unless the
	 * admin has already chosen a different gallery for this item.
	 */
	private function photos( $post_id, array $keys, array $captions ) {
		if ( ! $keys ) {
			return;
		}
		$ids = array();
		foreach ( $keys as $k ) {
			$att = $this->attachment( $k, $post_id, $captions[ $k ] ?? '' );
			if ( $att ) {
				$ids[] = $att;
			}
		}
		if ( ! $ids ) {
			return;
		}
		$current = array_values( array_filter( array_map( 'intval', (array) get_post_meta( $post_id, Gallery::META, true ) ) ) );
		$ours    = array_map( static fn( $k ) => self::media_id( $k ), $keys );
		if ( ! $current || ! array_diff( $current, array_filter( $ours ) ) || $this->update ) {
			Gallery::set( $post_id, $ids );
			if ( ! has_post_thumbnail( $post_id ) || $this->update ) {
				set_post_thumbnail( $post_id, $ids[0] );
			}
		}
	}

	public static function media_id( $key ) {
		$ids = get_posts( array( 'post_type' => 'attachment', 'post_status' => 'inherit', 'posts_per_page' => 1, 'fields' => 'ids', 'meta_key' => '_ek_media_key', 'meta_value' => $key ) ); // phpcs:ignore
		return $ids ? (int) $ids[0] : 0;
	}

	private function attachment( $key, $parent, $caption ) {
		$existing = self::media_id( $key );
		if ( $existing ) {
			return $existing;
		}
		$file = $this->media . $key . '.jpg';
		if ( ! $this->media || empty( $this->credits[ $key ] ) || ! file_exists( $file ) ) {
			return 0;
		}
		$tmp = wp_tempnam( $key . '.jpg' );
		copy( $file, $tmp );
		$att = media_handle_sideload( array( 'name' => 'ek-' . $key . '.jpg', 'tmp_name' => $tmp ), $parent, $caption ? $caption : null );
		if ( is_wp_error( $att ) ) {
			@unlink( $tmp ); // phpcs:ignore
			return 0;
		}
		$c = $this->credits[ $key ];
		update_post_meta( $att, '_ek_media_key', $key );
		update_post_meta( $att, '_ek_credit', $c );
		update_post_meta( $att, '_wp_attachment_image_alt', $caption );
		wp_update_post( array( 'ID' => $att, 'post_excerpt' => $caption ) );
		$this->out['photos']++;
		return (int) $att;
	}

	/** Replace {{page:slug}}, {{attraction:slug}}, {{event:slug}} and {{site:key}} with real links. */
	private function resolve_links() {
		foreach ( array_unique( $this->pending_links ) as $id ) {
			$post = get_post( $id );
			$new  = self::links( $post->post_content );
			if ( $new !== $post->post_content ) {
				wp_update_post( wp_slash( array( 'ID' => $id, 'post_content' => $new ) ) );
			}
		}
	}

	public static function links( $html ) {
		return preg_replace_callback(
			'/\{\{(page|attraction|event|site):([a-z0-9_-]+)\}\}/',
			static function ( $m ) {
				$types = array( 'page' => 'page', 'attraction' => Attractions::CPT, 'event' => Events::CPT );
				if ( 'site' === $m[1] ) {
					if ( 'shop' === $m[2] ) {
						return function_exists( 'wc_get_page_permalink' ) ? esc_url( wc_get_page_permalink( 'shop' ) ) : esc_url( home_url( '/' ) );
					}
					return esc_url( Install::page_url( $m[2] ) );
				}
				$id = self::find( $types[ $m[1] ], $m[1] . ':' . $m[2] );
				return $id ? esc_url( get_permalink( $id ) ) : esc_url( home_url( '/' ) );
			},
			(string) $html
		);
	}
}
