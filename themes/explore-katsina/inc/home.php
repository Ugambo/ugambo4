<?php
/**
 * Homepage sections. Each one reads live data from the explore-katsina-core plugin and hides itself
 * (or shows a short "coming soon" note) when there is nothing to show yet.
 *
 * @package ExploreKatsinaTheme
 */

defined( 'ABSPATH' ) || exit;

/** Section wrapper with heading, optional intro and "see all" link. */
function ekt_section_open( $id, $title, $intro = '', $more = array(), $class = '' ) {
	echo '<section class="ekt-sec ' . esc_attr( $class ) . '" id="' . esc_attr( $id ) . '" aria-labelledby="' . esc_attr( $id ) . '-h"><div class="ekt-wrap">';
	echo '<div class="ekt-sec-head"><div><h2 id="' . esc_attr( $id ) . '-h">' . esc_html( $title ) . '</h2>';
	if ( $intro ) {
		echo '<p class="ekt-sec-intro">' . esc_html( $intro ) . '</p>';
	}
	echo '</div>';
	if ( $more ) {
		echo '<a class="ekt-more" href="' . esc_url( $more[1] ) . '">' . esc_html( $more[0] ) . ' <span aria-hidden="true">→</span></a>';
	}
	echo '</div>';
}

function ekt_section_close() {
	echo '</div></section>';
}

/** The photo used in the hero (Gobarau Minaret, public domain), if the guide photos were imported. */
function ekt_hero_photo_id() {
	$id = 0;
	if ( class_exists( '\EK\Guide_Import' ) ) {
		$id = \EK\Guide_Import::media_id( 'gobarau-1' );
	}
	return (int) apply_filters( 'ekt_hero_photo_id', $id );
}

function ekt_lga_options( $name, $id ) {
	$terms = get_terms( array( 'taxonomy' => 'ek_lga', 'hide_empty' => false ) );
	echo '<label for="' . esc_attr( $id ) . '">' . esc_html__( 'Where', 'explore-katsina-theme' ) . '</label><select id="' . esc_attr( $id ) . '" name="' . esc_attr( $name ) . '"><option value="">' . esc_html__( 'All of Katsina State', 'explore-katsina-theme' ) . '</option>';
	foreach ( is_wp_error( $terms ) ? array() : $terms as $t ) {
		echo '<option value="' . (int) $t->term_id . '">' . esc_html( $t->name ) . '</option>';
	}
	echo '</select>';
}

/* ---------------- Hero with tabbed search ---------------- */

function ekt_home_hero() {
	$photo = ekt_hero_photo_id();
	$tabs  = array(
		'hotels'      => __( 'Hotels', 'explore-katsina-theme' ),
		'restaurants' => __( 'Restaurants', 'explore-katsina-theme' ),
		'venues'      => __( 'Event centres', 'explore-katsina-theme' ),
		'todo'        => __( 'Things to do', 'explore-katsina-theme' ),
	);
	$today = wp_date( 'Y-m-d' );
	?>
	<section class="ekt-hero" aria-labelledby="ekt-hero-h">
		<div class="ekt-wrap ekt-hero-grid">
			<div class="ekt-hero-text">
				<p class="ekt-eyebrow"><?php esc_html_e( 'Katsina State, Nigeria', 'explore-katsina-theme' ); ?></p>
				<h1 id="ekt-hero-h"><?php esc_html_e( 'Discover the ancient city of gates, minarets and Durbar horsemen', 'explore-katsina-theme' ); ?></h1>
				<p class="ekt-lede"><?php esc_html_e( 'Book hotels, restaurants and event centres, find festivals and things to do, with honest rankings from verified guests.', 'explore-katsina-theme' ); ?></p>

				<div class="ekt-search" data-ekt-tabs>
					<div class="ekt-tablist" role="tablist" aria-label="<?php esc_attr_e( 'What are you looking for?', 'explore-katsina-theme' ); ?>">
						<?php $i = 0; foreach ( $tabs as $k => $label ) : ?>
							<button type="button" role="tab" id="ekt-tab-<?php echo esc_attr( $k ); ?>" aria-controls="ekt-panel-<?php echo esc_attr( $k ); ?>" aria-selected="<?php echo 0 === $i ? 'true' : 'false'; ?>"<?php echo 0 === $i ? '' : ' tabindex="-1"'; ?>><?php echo esc_html( $label ); ?></button>
						<?php $i++; endforeach; ?>
					</div>
					<noscript><p class="ekt-noscript"><a href="<?php echo esc_url( ekt_page_url( 'restaurants' ) ); ?>"><?php esc_html_e( 'Restaurants', 'explore-katsina-theme' ); ?></a> · <a href="<?php echo esc_url( ekt_page_url( 'event_centres' ) ); ?>"><?php esc_html_e( 'Event centres', 'explore-katsina-theme' ); ?></a> · <a href="<?php echo esc_url( ekt_page_url( 'things_to_do' ) ); ?>"><?php esc_html_e( 'Things to do', 'explore-katsina-theme' ); ?></a></p></noscript>

					<form role="tabpanel" id="ekt-panel-hotels" aria-labelledby="ekt-tab-hotels" class="ekt-panel" method="get" action="<?php echo esc_url( ekt_page_url( 'hotels' ) ); ?>">
						<div class="ekt-field ekt-field--wide"><?php ekt_lga_options( 'lga', 'ekt-h-lga' ); ?></div>
						<div class="ekt-field"><label for="ekt-h-in"><?php esc_html_e( 'Check-in', 'explore-katsina-theme' ); ?></label><input type="date" id="ekt-h-in" name="checkin" min="<?php echo esc_attr( $today ); ?>"></div>
						<div class="ekt-field"><label for="ekt-h-out"><?php esc_html_e( 'Check-out', 'explore-katsina-theme' ); ?></label><input type="date" id="ekt-h-out" name="checkout" min="<?php echo esc_attr( $today ); ?>"></div>
						<div class="ekt-field ekt-field--sm"><label for="ekt-h-g"><?php esc_html_e( 'Guests', 'explore-katsina-theme' ); ?></label><input type="number" id="ekt-h-g" name="guests" min="1" max="40" value="2" inputmode="numeric"></div>
						<button class="ekt-go" type="submit"><?php esc_html_e( 'Search hotels', 'explore-katsina-theme' ); ?></button>
					</form>

					<form role="tabpanel" id="ekt-panel-restaurants" aria-labelledby="ekt-tab-restaurants" class="ekt-panel" method="get" action="<?php echo esc_url( ekt_page_url( 'restaurants' ) ); ?>" hidden>
						<div class="ekt-field ekt-field--wide"><?php ekt_lga_options( 'lga', 'ekt-r-lga' ); ?></div>
						<div class="ekt-field ekt-field--wide"><label for="ekt-r-c"><?php esc_html_e( 'Food', 'explore-katsina-theme' ); ?></label><select id="ekt-r-c" name="cuisine"><option value=""><?php esc_html_e( 'Any', 'explore-katsina-theme' ); ?></option>
							<?php foreach ( class_exists( '\EK\Restaurant' ) ? \EK\Restaurant::cuisines() : array() as $k => $c ) : ?><option value="<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $c ); ?></option><?php endforeach; ?>
						</select></div>
						<button class="ekt-go" type="submit"><?php esc_html_e( 'Find restaurants', 'explore-katsina-theme' ); ?></button>
					</form>

					<form role="tabpanel" id="ekt-panel-venues" aria-labelledby="ekt-tab-venues" class="ekt-panel" method="get" action="<?php echo esc_url( ekt_page_url( 'event_centres' ) ); ?>" hidden>
						<div class="ekt-field ekt-field--wide"><?php ekt_lga_options( 'lga', 'ekt-v-lga' ); ?></div>
						<div class="ekt-field"><label for="ekt-v-d"><?php esc_html_e( 'Event date', 'explore-katsina-theme' ); ?></label><input type="date" id="ekt-v-d" name="date" min="<?php echo esc_attr( $today ); ?>"></div>
						<div class="ekt-field ekt-field--sm"><label for="ekt-v-g"><?php esc_html_e( 'Guests', 'explore-katsina-theme' ); ?></label><input type="number" id="ekt-v-g" name="guests" min="1" inputmode="numeric" placeholder="200"></div>
						<button class="ekt-go" type="submit"><?php esc_html_e( 'Find event centres', 'explore-katsina-theme' ); ?></button>
					</form>

					<form role="tabpanel" id="ekt-panel-todo" aria-labelledby="ekt-tab-todo" class="ekt-panel" method="get" action="<?php echo esc_url( ekt_page_url( 'things_to_do' ) ); ?>" hidden>
						<div class="ekt-field ekt-field--wide"><label for="ekt-t-t"><?php esc_html_e( 'Type', 'explore-katsina-theme' ); ?></label><select id="ekt-t-t" name="type"><option value=""><?php esc_html_e( 'Everything', 'explore-katsina-theme' ); ?></option>
							<?php foreach ( class_exists( '\EK\Attractions' ) ? \EK\Attractions::default_categories() : array() as $k => $c ) : ?><option value="<?php echo esc_attr( $k ); ?>"><?php echo esc_html( $c ); ?></option><?php endforeach; ?>
						</select></div>
						<button class="ekt-go" type="submit"><?php esc_html_e( 'Show things to do', 'explore-katsina-theme' ); ?></button>
					</form>
				</div>
			</div>

			<?php if ( $photo ) : ?>
				<figure class="ekt-hero-photo">
					<div class="ekt-arch"><?php echo wp_get_attachment_image( $photo, 'large', false, array( 'alt' => __( 'The Gobarau Minaret, an earth tower in Katsina\'s old city', 'explore-katsina-theme' ), 'loading' => 'eager', 'fetchpriority' => 'high', 'sizes' => '(min-width: 900px) 420px, 1px' ) ); ?></div>
					<figcaption><?php esc_html_e( 'Gobarau Minaret, Katsina. Photo: Derric Evans, public domain.', 'explore-katsina-theme' ); ?></figcaption>
				</figure>
			<?php endif; ?>
		</div>
	</section>
	<?php
}

/* ---------------- Near you ---------------- */

function ekt_home_near() {
	ekt_section_open( 'ekt-near', __( 'Near you', 'explore-katsina-theme' ), __( 'Hotels, restaurants, event centres and sights within 15 km, closest first. Your location stays on your phone: we don\'t store it.', 'explore-katsina-theme' ), array( __( 'Open the Katsina Map', 'explore-katsina-theme' ), ekt_page_url( 'map' ) ) );
	?>
	<div class="ekt-near" data-ekt-near>
		<button type="button" class="ekt-btn ekt-btn--brass" data-ekt-near-go>
			<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm9 3h-2.07A7 7 0 0 0 13 5.07V3h-2v2.07A7 7 0 0 0 5.07 11H3v2h2.07A7 7 0 0 0 11 18.93V21h2v-2.07A7 7 0 0 0 18.93 13H21z"/></svg>
			<?php esc_html_e( 'Use my location', 'explore-katsina-theme' ); ?>
		</button>
		<p class="ekt-near-status" role="status" aria-live="polite" data-ekt-near-status></p>
		<ul class="ekt-cards ekt-cards--near" data-ekt-near-list></ul>
	</div>
	<?php
	ekt_section_close();
}

/* ---------------- Map preview ---------------- */

function ekt_home_map() {
	if ( ! class_exists( '\EK\Map_Index' ) ) {
		return;
	}
	$res  = \EK\Map_Index::query( array( 'bbox' => array( 11.0, 6.9, 13.4, 9.2 ), 'limit' => 300 ) );
	$pins = \EK\Map_Index::mini( $res['pins'] );
	$by   = array_count_values( wp_list_pluck( $res['pins'], 'type' ) );
	ekt_section_open( 'ekt-map', __( 'The Katsina Map', 'explore-katsina-theme' ), __( 'Every listed hotel, restaurant, event centre and attraction on one map, with filters, prices and "near me".', 'explore-katsina-theme' ), array(), 'ekt-sec--night' );
	?>
	<div class="ekt-map-grid">
		<div class="ekt-map-box" data-ekt-map data-pins="<?php echo esc_attr( wp_json_encode( $pins ) ); ?>" role="img" aria-label="<?php esc_attr_e( 'Preview of the Katsina Map', 'explore-katsina-theme' ); ?>"></div>
		<div class="ekt-map-side">
			<ul class="ekt-map-counts">
				<li><strong><?php echo (int) ( $by['hotel'] ?? 0 ); ?></strong> <?php esc_html_e( 'hotels', 'explore-katsina-theme' ); ?></li>
				<li><strong><?php echo (int) ( $by['restaurant'] ?? 0 ); ?></strong> <?php esc_html_e( 'restaurants', 'explore-katsina-theme' ); ?></li>
				<li><strong><?php echo (int) ( $by['event-centre'] ?? 0 ); ?></strong> <?php esc_html_e( 'event centres', 'explore-katsina-theme' ); ?></li>
				<li><strong><?php echo (int) ( $by['attraction'] ?? 0 ); ?></strong> <?php esc_html_e( 'attractions', 'explore-katsina-theme' ); ?></li>
			</ul>
			<a class="ekt-btn ekt-btn--brass" href="<?php echo esc_url( ekt_page_url( 'map' ) ); ?>"><?php esc_html_e( 'Open the Katsina Map', 'explore-katsina-theme' ); ?></a>
		</div>
	</div>
	<?php
	ekt_section_close();
}

/* ---------------- Featured attractions ---------------- */

function ekt_home_attractions() {
	if ( ! class_exists( '\EK\Attractions' ) ) {
		return;
	}
	$ids = \EK\Attractions::all();
	usort( $ids, static fn( $a, $b ) => (int) ! \EK\Gallery::ids( $a ) <=> (int) ! \EK\Gallery::ids( $b ) ); // Photos first.
	$ids = array_slice( $ids, 0, 6 );
	if ( ! $ids ) {
		return;
	}
	ekt_section_open( 'ekt-attr', __( 'Things to do', 'explore-katsina-theme' ), __( 'Palaces, minarets, city gates, dams and markets, every fact sourced.', 'explore-katsina-theme' ), array( __( 'See all things to do', 'explore-katsina-theme' ), ekt_page_url( 'things_to_do' ) ) );
	echo '<ul class="ekt-cards">';
	foreach ( $ids as $id ) {
		$a     = \EK\Attractions::data( $id );
		$photo = \EK\Gallery::ids( $id );
		echo '<li class="ekt-card"><a class="ekt-card-link" href="' . esc_url( get_permalink( $id ) ) . '">';
		echo '<span class="ekt-card-img">' . ( $photo ? wp_get_attachment_image( $photo[0], 'medium_large', false, array( 'alt' => '', 'loading' => 'lazy' ) ) : '<span class="ekt-noimg" aria-hidden="true"></span>' ) . '</span>';
		echo '<span class="ekt-card-body"><span class="ekt-card-kicker">' . esc_html( trim( $a['category'] . ( $a['lga'] ? ' · ' . $a['lga'] : '' ), ' ·' ) ) . '</span><span class="ekt-card-title">' . esc_html( get_the_title( $id ) ) . '</span></span>';
		echo '</a></li>';
	}
	echo '</ul>';
	ekt_section_close();
}

/* ---------------- Festivals and events ---------------- */

function ekt_home_events() {
	if ( ! class_exists( '\EK\Events' ) ) {
		return;
	}
	$ids = \EK\Events::upcoming( 3 );
	ekt_section_open( 'ekt-events', __( 'Upcoming festivals and events', 'explore-katsina-theme' ), __( 'Durbars, cultural festivals and gatherings. Festival dates that follow the moon are confirmed close to the day.', 'explore-katsina-theme' ), array( __( 'All events', 'explore-katsina-theme' ), ekt_page_url( 'events' ) ), 'ekt-sec--sand' );
	if ( ! $ids ) {
		echo '<p class="ekt-empty">' . esc_html__( 'No upcoming events yet. Check back soon.', 'explore-katsina-theme' ) . '</p>';
	} else {
		echo '<ul class="ekt-events">';
		foreach ( $ids as $id ) {
			$d     = \EK\Events::data( $id );
			$photo = \EK\Gallery::ids( $id );
			echo '<li class="ekt-event"><a href="' . esc_url( get_permalink( $id ) ) . '">';
			echo '<span class="ekt-event-img">' . ( $photo ? wp_get_attachment_image( $photo[0], 'medium', false, array( 'alt' => '', 'loading' => 'lazy' ) ) : '<span class="ekt-noimg" aria-hidden="true"></span>' ) . '</span>';
			echo '<span class="ekt-event-body">';
			if ( \EK\Events::is_promoted( $id ) ) {
				echo '<span class="ekt-tag ekt-tag--brass">' . esc_html__( 'Promoted', 'explore-katsina-theme' ) . '</span>';
			}
			if ( $d['type'] ) {
				echo '<span class="ekt-card-kicker">' . esc_html( $d['type'] ) . '</span>';
			}
			echo '<span class="ekt-card-title">' . esc_html( get_the_title( $id ) ) . '</span><span class="ekt-event-when">' . esc_html( \EK\Events::when( $d ) ) . '</span>';
			echo '</span></a></li>';
		}
		echo '</ul>';
	}
	ekt_section_close();
}

/* ---------------- Top-ranked ---------------- */

function ekt_home_top() {
	if ( ! class_exists( '\EK\Ranking' ) ) {
		return;
	}
	$cols = array(
		'hotel'        => array( __( 'Top hotels', 'explore-katsina-theme' ), 'top_hotels' ),
		'restaurant'   => array( __( 'Top restaurants', 'explore-katsina-theme' ), 'top_restaurants' ),
		'event-centre' => array( __( 'Top event centres', 'explore-katsina-theme' ), 'top_event_centres' ),
	);
	ekt_section_open( 'ekt-top', __( 'Top-ranked in Katsina', 'explore-katsina-theme' ), __( 'Ranked every night from verified guest reviews, bookings and how quickly places reply. Paid plans never change a rank.', 'explore-katsina-theme' ) );
	echo '<div class="ekt-top-grid">';
	foreach ( $cols as $type => $c ) {
		$rows = \EK\Ranking::top( $type, 0, 3 );
		echo '<div class="ekt-top" data-ekt-top="' . esc_attr( $type ) . '"><h3>' . esc_html( $c[0] ) . '</h3>';
		if ( $rows ) {
			echo '<ol>';
			foreach ( $rows as $r ) {
				$st = \EK\Reviews::stats( (int) $r->business_id );
				echo '<li><span class="ekt-top-num">#' . (int) $r->rank_state . '</span><a href="' . esc_url( get_permalink( (int) $r->business_id ) ) . '">' . esc_html( get_the_title( (int) $r->business_id ) ) . '</a>';
				if ( ! empty( $st['count'] ) ) {
					/* translators: 1: rating, 2: number of reviews */
					echo '<span class="ekt-top-rate">★ ' . esc_html( number_format_i18n( (float) $st['overall'], 1 ) ) . ' <span>(' . esc_html( sprintf( _n( '%s review', '%s reviews', (int) $st['count'], 'explore-katsina-theme' ), number_format_i18n( (int) $st['count'] ) ) ) . ')</span></span>';
				}
				echo '</li>';
			}
			echo '</ol>';
		} else {
			echo '<p class="ekt-empty">' . esc_html__( 'Rankings appear once places have at least 3 verified reviews.', 'explore-katsina-theme' ) . '</p>';
		}
		echo '<a class="ekt-more" href="' . esc_url( ekt_page_url( $c[1] ) ) . '">' . esc_html__( 'See the top 10', 'explore-katsina-theme' ) . ' <span aria-hidden="true">→</span></a></div>';
	}
	echo '</div>';
	ekt_section_close();
}

/* ---------------- Premium spotlight, tours, stories ---------------- */

function ekt_home_spotlight() {
	$html = shortcode_exists( 'ek_premium_spotlight' ) ? do_shortcode( '[ek_premium_spotlight]' ) : '';
	if ( '' === trim( $html ) ) {
		return;
	}
	ekt_section_open( 'ekt-spot', __( 'In the spotlight', 'explore-katsina-theme' ), __( 'Premium partners. Sponsored placement: it does not affect rankings.', 'explore-katsina-theme' ) );
	echo $html; // phpcs:ignore WordPress.Security.EscapeOutput -- Rendered by the plugin template.
	ekt_section_close();
}

function ekt_home_tours() {
	if ( ! class_exists( '\EK\Tours' ) ) {
		return;
	}
	$ids = get_posts( array( 'post_type' => \EK\Tours::CPT, 'post_status' => 'publish', 'fields' => 'ids', 'posts_per_page' => 3, 'orderby' => 'menu_order title', 'order' => 'ASC' ) );
	if ( ! $ids ) {
		return;
	}
	ekt_section_open( 'ekt-tours', __( 'Our tours', 'explore-katsina-theme' ), __( 'Guided by Explore Katsina. Book a seat online.', 'explore-katsina-theme' ), array( __( 'All tours', 'explore-katsina-theme' ), ekt_page_url( 'tours' ) ) );
	echo '<ul class="ekt-cards">';
	foreach ( $ids as $id ) {
		$d = \EK\Tours::data( $id );
		echo '<li class="ekt-card"><a class="ekt-card-link" href="' . esc_url( get_permalink( $id ) ) . '"><span class="ekt-card-img">' . ( has_post_thumbnail( $id ) ? get_the_post_thumbnail( $id, 'medium_large', array( 'alt' => '', 'loading' => 'lazy' ) ) : '<span class="ekt-noimg" aria-hidden="true"></span>' ) . '</span>';
		echo '<span class="ekt-card-body"><span class="ekt-card-title">' . esc_html( get_the_title( $id ) ) . '</span><span class="ekt-card-meta">' . esc_html( \EK\Money::format( $d['price'] ) ) . ' ' . esc_html__( 'per person', 'explore-katsina-theme' ) . ( $d['duration'] ? ' · ' . esc_html( $d['duration'] ) : '' ) . '</span></span></a></li>';
	}
	echo '</ul>';
	ekt_section_close();
}

function ekt_home_stories() {
	$ids = get_posts( array( 'post_type' => 'post', 'post_status' => 'publish', 'posts_per_page' => 3, 'fields' => 'ids', 'lang' => '' ) );
	ekt_section_open( 'ekt-stories', __( 'Stories', 'explore-katsina-theme' ), __( 'History, culture, food, crafts and travel guides.', 'explore-katsina-theme' ), array( __( 'All stories', 'explore-katsina-theme' ), ekt_page_url( 'stories' ) ) );
	if ( ! $ids ) {
		echo '<p class="ekt-empty">' . esc_html__( 'Our first stories are being written. Meanwhile, read our Plan your trip guide.', 'explore-katsina-theme' ) . ' <a href="' . esc_url( ekt_page_url( 'plan_trip' ) ) . '">' . esc_html__( 'Plan your trip', 'explore-katsina-theme' ) . '</a></p>';
	} else {
		echo '<ul class="ekt-cards">';
		foreach ( $ids as $id ) {
			$cats = get_the_category( $id );
			echo '<li class="ekt-card"><a class="ekt-card-link" href="' . esc_url( get_permalink( $id ) ) . '"><span class="ekt-card-img">' . ( has_post_thumbnail( $id ) ? get_the_post_thumbnail( $id, 'medium_large', array( 'alt' => '', 'loading' => 'lazy' ) ) : '<span class="ekt-noimg" aria-hidden="true"></span>' ) . '</span>';
			echo '<span class="ekt-card-body"><span class="ekt-card-kicker">' . esc_html( $cats ? $cats[0]->name : '' ) . '</span><span class="ekt-card-title">' . esc_html( get_the_title( $id ) ) . '</span></span></a></li>';
		}
		echo '</ul>';
	}
	ekt_section_close();
}

/* ---------------- Banners ---------------- */

function ekt_home_banners() {
	?>
	<section class="ekt-sec" aria-label="<?php esc_attr_e( 'For businesses', 'explore-katsina-theme' ); ?>">
		<div class="ekt-wrap ekt-banners">
			<div class="ekt-banner ekt-banner--crimson">
				<h2><?php esc_html_e( 'List your business', 'explore-katsina-theme' ); ?></h2>
				<p><?php esc_html_e( 'Hotels, restaurants, event centres and more: get bookings from guests across Nigeria. Free to list; commission only on bookings.', 'explore-katsina-theme' ); ?></p>
				<a class="ekt-btn ekt-btn--light" href="<?php echo esc_url( ekt_page_url( 'list_business' ) ); ?>"><?php esc_html_e( 'List your business', 'explore-katsina-theme' ); ?></a>
			</div>
			<div class="ekt-banner ekt-banner--night">
				<h2><?php esc_html_e( 'Advertise with us', 'explore-katsina-theme' ); ?></h2>
				<p><?php esc_html_e( 'Reach visitors planning trips, events and nights out in Katsina State with banners, sponsored stories and featured listings.', 'explore-katsina-theme' ); ?></p>
				<a class="ekt-btn ekt-btn--brass" href="<?php echo esc_url( ekt_page_url( 'advertise' ) ); ?>"><?php esc_html_e( 'See packages', 'explore-katsina-theme' ); ?></a>
			</div>
		</div>
	</section>
	<?php
}

function ekt_home_ad() {
	$html = class_exists( '\EK\Ads' ) ? \EK\Ads::zone( 'home' ) : '';
	if ( $html ) {
		echo '<div class="ekt-wrap ekt-ad-slot">' . $html . '</div>'; // phpcs:ignore WordPress.Security.EscapeOutput -- Built and escaped by the plugin.
	}
}

/** Hausa homepage: say plainly that the text is still English (no machine translation). */
function ekt_home_translation_note() {
	if ( ! function_exists( 'pll_current_language' ) || 'ha' !== pll_current_language() ) {
		return;
	}
	echo '<div class="ekt-wrap"><p class="ekt-translation-note" lang="en" role="note">' . esc_html__( 'The Hausa version of Explore Katsina is being written by a Hausa writer. Until then, pages are shown in English.', 'explore-katsina-theme' ) . '</p></div>';
}

/** The order of the homepage. Filter `ekt_home_sections` to reorder or remove a section. */
function ekt_home_sections() {
	return apply_filters( 'ekt_home_sections', array( 'ekt_home_hero', 'ekt_home_translation_note', 'ekt_home_near', 'ekt_home_attractions', 'ekt_home_map', 'ekt_home_events', 'ekt_home_top', 'ekt_home_spotlight', 'ekt_home_ad', 'ekt_home_tours', 'ekt_home_stories', 'ekt_home_banners' ) );
}
