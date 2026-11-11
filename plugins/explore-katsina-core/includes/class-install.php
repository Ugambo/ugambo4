<?php
/**
 * Database tables, roles, fixed terms, pages and default settings.
 * Safe to run many times (re-runnable).
 *
 * @package ExploreKatsina
 */

namespace EK;

defined( 'ABSPATH' ) || exit;

final class Install {

	const ROLE_OWNER = 'ek_business_owner';

	public static function activate() {
		Post_Types::register();
		self::install();
		flush_rewrite_rules();
	}

	public static function maybe_upgrade() {
		if ( get_option( 'ek_db_version' ) !== EK_DB_VERSION ) {
			add_action( 'init', array( __CLASS__, 'install' ), 20 );
		}
	}

	public static function install() {
		self::create_tables();
		self::add_roles();
		Settings::ensure_defaults();
		Post_Types::register();
		Rooms::register();
		Halls::register();
		Attractions::register();
		Events::register();
		Tours::register();
		Tickets::add_role();
		self::add_terms();
		self::add_pages();
		Private_Files::protect_directory();
		Shop::setup();
		update_option( 'ek_db_version', EK_DB_VERSION );
		update_option( 'ek_flush_rewrite', 1 );
	}

	/**
	 * All private / transactional record books (see docs/ARCHITECTURE.md §5B).
	 * Money is stored in kobo (integers). Times are stored in UTC.
	 */
	public static function create_tables() {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';
		$c = $wpdb->get_charset_collate();
		$p = $wpdb->prefix . 'ek_';

		$sql = array();

		$sql[] = "CREATE TABLE {$p}business_private (
			business_id bigint(20) unsigned NOT NULL,
			owner_name varchar(190) NOT NULL DEFAULT '',
			cac_number varchar(40) NOT NULL DEFAULT '',
			id_doc_file varchar(255) NOT NULL DEFAULT '',
			id_doc_mime varchar(60) NOT NULL DEFAULT '',
			bank_name varchar(120) NOT NULL DEFAULT '',
			account_name_enc text NULL,
			account_number_enc text NULL,
			account_last4 varchar(4) NOT NULL DEFAULT '',
			agreement_version varchar(40) NOT NULL DEFAULT '',
			agreement_accepted_at datetime NULL,
			agreement_ip varchar(45) NOT NULL DEFAULT '',
			updated_at datetime NOT NULL,
			PRIMARY KEY  (business_id)
		) $c;";

		$sql[] = "CREATE TABLE {$p}log (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			actor_id bigint(20) unsigned NOT NULL DEFAULT 0,
			object_type varchar(30) NOT NULL,
			object_id bigint(20) unsigned NOT NULL DEFAULT 0,
			action varchar(50) NOT NULL,
			reason text NULL,
			meta longtext NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY object (object_type,object_id),
			KEY action (action)
		) $c;";

		$sql[] = "CREATE TABLE {$p}analytics_daily (
			business_id bigint(20) unsigned NOT NULL,
			day date NOT NULL,
			metric varchar(20) NOT NULL,
			count int(10) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (business_id,day,metric),
			KEY day (day)
		) $c;";

		$sql[] = "CREATE TABLE {$p}bookings (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			code varchar(12) NOT NULL,
			kind varchar(20) NOT NULL,
			business_id bigint(20) unsigned NOT NULL,
			item_id bigint(20) unsigned NOT NULL DEFAULT 0,
			customer_id bigint(20) unsigned NOT NULL DEFAULT 0,
			customer_name varchar(190) NOT NULL DEFAULT '',
			customer_email varchar(190) NOT NULL DEFAULT '',
			customer_phone varchar(30) NOT NULL DEFAULT '',
			start_date date NULL,
			end_date date NULL,
			start_time time NULL,
			guests smallint(5) unsigned NOT NULL DEFAULT 1,
			quantity smallint(5) unsigned NOT NULL DEFAULT 1,
			total_kobo bigint(20) NOT NULL DEFAULT 0,
			deposit_kobo bigint(20) NOT NULL DEFAULT 0,
			paid_kobo bigint(20) NOT NULL DEFAULT 0,
			commission_rate_bp int(10) unsigned NOT NULL DEFAULT 0,
			commission_kobo bigint(20) NOT NULL DEFAULT 0,
			payment_mode varchar(20) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL,
			order_id bigint(20) unsigned NOT NULL DEFAULT 0,
			access_key varchar(40) NOT NULL DEFAULT '',
			hold_expires datetime NULL,
			details longtext NULL,
			policy_snapshot text NULL,
			notes text NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY code (code),
			KEY item_dates (item_id,start_date),
			KEY hold (status,hold_expires),
			KEY business_status (business_id,status),
			KEY customer (customer_id),
			KEY dates (start_date,end_date)
		) $c;";

		$sql[] = "CREATE TABLE {$p}ledger (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			business_id bigint(20) unsigned NOT NULL,
			booking_id bigint(20) unsigned NOT NULL DEFAULT 0,
			entry_type varchar(20) NOT NULL,
			amount_kobo bigint(20) NOT NULL,
			status varchar(20) NOT NULL,
			release_at datetime NULL,
			note varchar(255) NOT NULL DEFAULT '',
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY business_status (business_id,status),
			KEY booking (booking_id),
			KEY release_at (release_at)
		) $c;";

		$sql[] = "CREATE TABLE {$p}payouts (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			business_id bigint(20) unsigned NOT NULL,
			amount_kobo bigint(20) NOT NULL,
			status varchar(20) NOT NULL,
			bank_name varchar(120) NOT NULL DEFAULT '',
			account_name_enc text NULL,
			account_number_enc text NULL,
			reference varchar(100) NOT NULL DEFAULT '',
			note varchar(255) NOT NULL DEFAULT '',
			requested_by bigint(20) unsigned NOT NULL DEFAULT 0,
			processed_by bigint(20) unsigned NOT NULL DEFAULT 0,
			requested_at datetime NOT NULL,
			processed_at datetime NULL,
			PRIMARY KEY  (id),
			KEY business_status (business_id,status)
		) $c;";

		$sql[] = "CREATE TABLE {$p}invoices (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			number varchar(30) NOT NULL,
			business_id bigint(20) unsigned NOT NULL,
			period_start date NOT NULL,
			period_end date NOT NULL,
			amount_kobo bigint(20) NOT NULL,
			status varchar(20) NOT NULL,
			due_at datetime NOT NULL,
			paid_at datetime NULL,
			order_id bigint(20) unsigned NOT NULL DEFAULT 0,
			method varchar(20) NOT NULL DEFAULT '',
			reference varchar(100) NOT NULL DEFAULT '',
			reminded tinyint(3) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY number (number),
			KEY business_status (business_id,status)
		) $c;";

		$sql[] = "CREATE TABLE {$p}reviews (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			business_id bigint(20) unsigned NOT NULL,
			booking_id bigint(20) unsigned NOT NULL,
			user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			author_name varchar(100) NOT NULL DEFAULT '',
			rating_overall tinyint(3) unsigned NOT NULL,
			rating_cleanliness tinyint(3) unsigned NULL,
			rating_service tinyint(3) unsigned NULL,
			rating_value tinyint(3) unsigned NULL,
			rating_location tinyint(3) unsigned NULL,
			title varchar(190) NOT NULL DEFAULT '',
			body text NULL,
			lang varchar(10) NOT NULL DEFAULT 'en',
			status varchar(20) NOT NULL DEFAULT 'published',
			owner_reply text NULL,
			owner_reply_at datetime NULL,
			hidden_reason varchar(255) NOT NULL DEFAULT '',
			hidden_at datetime NULL,
			hidden_by bigint(20) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY booking (booking_id),
			KEY business_status (business_id,status)
		) $c;";

		$sql[] = "CREATE TABLE {$p}rankings (
			business_id bigint(20) unsigned NOT NULL,
			day date NOT NULL,
			business_type varchar(30) NOT NULL,
			lga_id bigint(20) unsigned NOT NULL DEFAULT 0,
			score decimal(8,5) NOT NULL DEFAULT 0,
			weighted_rating decimal(6,4) NOT NULL DEFAULT 0,
			review_count int(10) unsigned NOT NULL DEFAULT 0,
			rank_state int(10) unsigned NULL,
			total_state int(10) unsigned NOT NULL DEFAULT 0,
			rank_lga int(10) unsigned NULL,
			total_lga int(10) unsigned NOT NULL DEFAULT 0,
			badges varchar(100) NOT NULL DEFAULT '',
			rating_part decimal(6,4) NOT NULL DEFAULT 0,
			bookings_part decimal(6,4) NOT NULL DEFAULT 0,
			response_part decimal(6,4) NOT NULL DEFAULT 0,
			completed_bookings int(10) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (business_id,day),
			KEY type_day (business_type,day)
		) $c;";

		/*
		 * Availability calendar: one row per room category (or hall) per night.
		 * "booked" includes unpaid 15-minute holds. Rows are locked during booking
		 * (SELECT … FOR UPDATE) so two guests can never take the last room.
		 */
		$sql[] = "CREATE TABLE {$p}nights (
			item_id bigint(20) unsigned NOT NULL,
			night date NOT NULL,
			closed tinyint(1) NOT NULL DEFAULT 0,
			blocked smallint(5) unsigned NOT NULL DEFAULT 0,
			booked smallint(5) unsigned NOT NULL DEFAULT 0,
			price_kobo bigint(20) NULL,
			PRIMARY KEY  (item_id,night)
		) $c;";

		/* Seasonal / peak price rules (e.g. Sallah, Durbar). */
		$sql[] = "CREATE TABLE {$p}rate_rules (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			item_id bigint(20) unsigned NOT NULL,
			label varchar(100) NOT NULL DEFAULT '',
			start_date date NOT NULL,
			end_date date NOT NULL,
			price_kobo bigint(20) NOT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY item_dates (item_id,start_date,end_date)
		) $c;";

		/* Restaurant menus. */
		$sql[] = "CREATE TABLE {$p}menu_categories (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			business_id bigint(20) unsigned NOT NULL,
			name varchar(100) NOT NULL,
			position int(10) NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			KEY business (business_id,position)
		) $c;";
		$sql[] = "CREATE TABLE {$p}menu_items (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			business_id bigint(20) unsigned NOT NULL,
			category_id bigint(20) unsigned NOT NULL,
			name varchar(120) NOT NULL,
			description varchar(500) NOT NULL DEFAULT '',
			price_kobo bigint(20) NOT NULL,
			photo_id bigint(20) unsigned NOT NULL DEFAULT 0,
			available tinyint(1) NOT NULL DEFAULT 1,
			position int(10) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY business_cat (business_id,category_id,position)
		) $c;";

		/*
		 * Restaurant table reservations: one row per restaurant per time slot (local time).
		 * "booked" = seats (or tables) taken. Locked during booking like hotel nights.
		 */
		$sql[] = "CREATE TABLE {$p}slots (
			business_id bigint(20) unsigned NOT NULL,
			slot_at datetime NOT NULL,
			booked smallint(5) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (business_id,slot_at)
		) $c;";

		/* Refunds: one row per refund owed to a guest (processed automatically or by the admin). */
		$sql[] = "CREATE TABLE {$p}refunds (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			booking_id bigint(20) unsigned NOT NULL,
			business_id bigint(20) unsigned NOT NULL,
			amount_kobo bigint(20) NOT NULL,
			reason varchar(255) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL,
			method varchar(20) NOT NULL DEFAULT '',
			reference varchar(120) NOT NULL DEFAULT '',
			created_at datetime NOT NULL,
			processed_at datetime NULL,
			processed_by bigint(20) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			KEY booking (booking_id),
			KEY status (status)
		) $c;";

		/* Customers' saved places. */
		$sql[] = "CREATE TABLE {$p}favourites (
			user_id bigint(20) unsigned NOT NULL,
			object_id bigint(20) unsigned NOT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (user_id,object_id)
		) $c;";

		/* Phase 7: which bookings each commission invoice covers (a booking is never invoiced twice). */
		$sql[] = "CREATE TABLE {$p}invoice_lines (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			invoice_id bigint(20) unsigned NOT NULL,
			booking_id bigint(20) unsigned NOT NULL,
			amount_kobo bigint(20) NOT NULL,
			description varchar(255) NOT NULL DEFAULT '',
			PRIMARY KEY  (id),
			UNIQUE KEY booking (booking_id),
			KEY invoice (invoice_id)
		) $c;";

		/* Phase 7: guest complaints raised while the business's money is still on hold. */
		$sql[] = "CREATE TABLE {$p}complaints (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			booking_id bigint(20) unsigned NOT NULL,
			business_id bigint(20) unsigned NOT NULL,
			message text NOT NULL,
			status varchar(20) NOT NULL,
			resolution varchar(20) NOT NULL DEFAULT '',
			resolution_note text NULL,
			refund_kobo bigint(20) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			resolved_at datetime NULL,
			resolved_by bigint(20) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			KEY booking (booking_id),
			KEY status (status)
		) $c;";

		/*
		 * Phase 8: map index. One row per pin (approved business or attraction) with what the map
		 * and its cards need, so the map can fetch only the pins inside the visible area quickly.
		 */
		$sql[] = "CREATE TABLE {$p}map_index (
			object_id bigint(20) unsigned NOT NULL,
			kind varchar(20) NOT NULL,
			type varchar(30) NOT NULL,
			lga_id bigint(20) unsigned NOT NULL DEFAULT 0,
			lat decimal(9,6) NOT NULL,
			lng decimal(9,6) NOT NULL,
			title varchar(190) NOT NULL DEFAULT '',
			photo_id bigint(20) unsigned NOT NULL DEFAULT 0,
			price_from bigint(20) NOT NULL DEFAULT 0,
			price_unit varchar(20) NOT NULL DEFAULT '',
			price_band tinyint(3) unsigned NOT NULL DEFAULT 0,
			price_text varchar(120) NOT NULL DEFAULT '',
			rating decimal(3,2) NOT NULL DEFAULT 0,
			reviews int(10) unsigned NOT NULL DEFAULT 0,
			rank_state int(10) unsigned NULL,
			total_state int(10) unsigned NOT NULL DEFAULT 0,
			rank_lga int(10) unsigned NULL,
			total_lga int(10) unsigned NOT NULL DEFAULT 0,
			badges varchar(100) NOT NULL DEFAULT '',
			featured tinyint(1) unsigned NOT NULL DEFAULT 0,
			verified tinyint(1) unsigned NOT NULL DEFAULT 0,
			amenities varchar(255) NOT NULL DEFAULT '',
			whatsapp varchar(30) NOT NULL DEFAULT '',
			updated_at datetime NOT NULL,
			PRIMARY KEY  (object_id),
			KEY latlng (lat,lng),
			KEY type_lga (type,lga_id)
		) $c;";

		/*
		 * Phase 9: everything Explore Katsina sells directly (plans, Verified applications, listing
		 * setup, event promotion, tour seats, event tickets). Shop products and guides use WooCommerce.
		 */
		$sql[] = "CREATE TABLE {$p}sales (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			code varchar(14) NOT NULL,
			access_key varchar(40) NOT NULL,
			kind varchar(20) NOT NULL,
			object_id bigint(20) unsigned NOT NULL DEFAULT 0,
			item_id bigint(20) unsigned NOT NULL DEFAULT 0,
			quantity int(10) unsigned NOT NULL DEFAULT 1,
			amount_kobo bigint(20) NOT NULL DEFAULT 0,
			status varchar(20) NOT NULL,
			stage varchar(20) NOT NULL DEFAULT '',
			customer_id bigint(20) unsigned NOT NULL DEFAULT 0,
			customer_name varchar(190) NOT NULL DEFAULT '',
			customer_email varchar(190) NOT NULL DEFAULT '',
			customer_phone varchar(30) NOT NULL DEFAULT '',
			details longtext NULL,
			order_id bigint(20) unsigned NOT NULL DEFAULT 0,
			reference varchar(100) NOT NULL DEFAULT '',
			hold_expires datetime NULL,
			created_at datetime NOT NULL,
			paid_at datetime NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY code (code),
			KEY kind_status (kind,status),
			KEY object (object_id),
			KEY customer (customer_id),
			KEY hold (status,hold_expires)
		) $c;";

		/* Tour dates with seats. */
		$sql[] = "CREATE TABLE {$p}tour_departures (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			tour_id bigint(20) unsigned NOT NULL,
			depart_date date NOT NULL,
			depart_time time NULL,
			seats int(10) unsigned NOT NULL DEFAULT 0,
			taken int(10) unsigned NOT NULL DEFAULT 0,
			price_kobo bigint(20) NOT NULL DEFAULT 0,
			status varchar(20) NOT NULL DEFAULT 'open',
			PRIMARY KEY  (id),
			KEY tour_date (tour_id,depart_date)
		) $c;";

		/* Event ticket types (Regular, VIP…) and the tickets sold. */
		$sql[] = "CREATE TABLE {$p}ticket_types (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			event_id bigint(20) unsigned NOT NULL,
			name varchar(100) NOT NULL,
			price_kobo bigint(20) NOT NULL DEFAULT 0,
			quantity int(10) unsigned NOT NULL DEFAULT 0,
			sold int(10) unsigned NOT NULL DEFAULT 0,
			sales_end datetime NULL,
			sort int(10) NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			KEY event (event_id)
		) $c;";
		$sql[] = "CREATE TABLE {$p}tickets (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			sale_id bigint(20) unsigned NOT NULL,
			event_id bigint(20) unsigned NOT NULL,
			type_id bigint(20) unsigned NOT NULL,
			code varchar(32) NOT NULL,
			holder varchar(190) NOT NULL DEFAULT '',
			status varchar(20) NOT NULL DEFAULT 'valid',
			checked_in_at datetime NULL,
			checked_in_by bigint(20) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (id),
			UNIQUE KEY code (code),
			KEY sale (sale_id),
			KEY event (event_id)
		) $c;";

		/* Banner ads and their daily counts. */
		$sql[] = "CREATE TABLE {$p}ads (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			title varchar(190) NOT NULL,
			advertiser varchar(190) NOT NULL DEFAULT '',
			zone varchar(30) NOT NULL,
			image_id bigint(20) unsigned NOT NULL DEFAULT 0,
			link_url varchar(500) NOT NULL DEFAULT '',
			alt_text varchar(190) NOT NULL DEFAULT '',
			starts_on date NULL,
			ends_on date NULL,
			active tinyint(1) unsigned NOT NULL DEFAULT 1,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY zone (zone,active)
		) $c;";
		$sql[] = "CREATE TABLE {$p}ad_stats (
			ad_id bigint(20) unsigned NOT NULL,
			day date NOT NULL,
			views int(10) unsigned NOT NULL DEFAULT 0,
			clicks int(10) unsigned NOT NULL DEFAULT 0,
			PRIMARY KEY  (ad_id,day)
		) $c;";

		/* Partner referral links and clicks. */
		$sql[] = "CREATE TABLE {$p}partners (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			slug varchar(60) NOT NULL,
			name varchar(190) NOT NULL,
			category varchar(40) NOT NULL DEFAULT '',
			url varchar(500) NOT NULL,
			commission_note varchar(255) NOT NULL DEFAULT '',
			active tinyint(1) unsigned NOT NULL DEFAULT 1,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY slug (slug)
		) $c;";
		$sql[] = "CREATE TABLE {$p}partner_clicks (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			partner_id bigint(20) unsigned NOT NULL,
			source_url varchar(255) NOT NULL DEFAULT '',
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY partner_date (partner_id,created_at)
		) $c;";

		/* "Advertise with us" enquiries. */
		$sql[] = "CREATE TABLE {$p}enquiries (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			name varchar(190) NOT NULL,
			company varchar(190) NOT NULL DEFAULT '',
			email varchar(190) NOT NULL,
			phone varchar(30) NOT NULL DEFAULT '',
			interest varchar(60) NOT NULL DEFAULT '',
			message text NULL,
			status varchar(20) NOT NULL DEFAULT 'new',
			created_at datetime NOT NULL,
			PRIMARY KEY  (id)
		) $c;";

		/* Money received outside the website (banner ads sold directly, partner commissions…). */
		$sql[] = "CREATE TABLE {$p}income_manual (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			source varchar(30) NOT NULL,
			ref_id bigint(20) unsigned NOT NULL DEFAULT 0,
			amount_kobo bigint(20) NOT NULL,
			received_on date NOT NULL,
			note varchar(255) NOT NULL DEFAULT '',
			created_by bigint(20) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			KEY source_date (source,received_on)
		) $c;";

		foreach ( $sql as $statement ) {
			dbDelta( $statement );
		}
	}

	public static function add_roles() {
		if ( ! get_role( self::ROLE_OWNER ) ) {
			add_role(
				self::ROLE_OWNER,
				__( 'Business Owner', 'explore-katsina' ),
				array( 'read' => true )
			);
		}
	}

	public static function add_terms() {
		foreach ( Business::types() as $slug => $type ) {
			if ( ! term_exists( $slug, Post_Types::TAX_TYPE ) ) {
				wp_insert_term( $type['label'], Post_Types::TAX_TYPE, array( 'slug' => $slug ) );
			}
		}
		foreach ( self::lgas() as $name ) {
			if ( ! term_exists( $name, Post_Types::TAX_LGA ) ) {
				wp_insert_term( $name, Post_Types::TAX_LGA );
			}
		}
		Attractions::add_categories();
		foreach ( Events::default_types() as $slug => $label ) {
			if ( ! term_exists( $slug, Events::TAX ) ) {
				wp_insert_term( $label, Events::TAX, array( 'slug' => $slug ) );
			}
		}
		Stories::add_categories();
	}

	/**
	 * The 34 Local Government Areas of Katsina State.
	 * Spellings follow common official usage; some LGAs have alternative spellings
	 * (e.g. Dutsin-Ma / Dutsinma, Mai'Adua / Maiadua, Dan Musa / Danmusa).
	 */
	public static function lgas() {
		return array(
			'Bakori', 'Batagarawa', 'Batsari', 'Baure', 'Bindawa', 'Charanchi', 'Dandume', 'Danja',
			'Dan Musa', 'Daura', 'Dutsi', 'Dutsin-Ma', 'Faskari', 'Funtua', 'Ingawa', 'Jibia',
			'Kafur', 'Kaita', 'Kankara', 'Kankia', 'Katsina', 'Kurfi', 'Kusada', "Mai'Adua",
			'Malumfashi', 'Mani', 'Mashi', 'Matazu', 'Musawa', 'Rimi', 'Sabuwa', 'Safana',
			'Sandamu', 'Zango',
		);
	}

	public static function add_pages() {
		$pages = array(
			'list_business' => array(
				'title'   => __( 'List Your Business', 'explore-katsina' ),
				'slug'    => 'list-your-business',
				'content' => '<!-- wp:shortcode -->[ek_list_business]<!-- /wp:shortcode -->',
			),
			'dashboard'     => array(
				'title'   => __( 'Business Dashboard', 'explore-katsina' ),
				'slug'    => 'business-dashboard',
				'content' => '<!-- wp:shortcode -->[ek_business_dashboard]<!-- /wp:shortcode -->',
			),
			'hotels'        => array(
				'title'   => __( 'Hotels', 'explore-katsina' ),
				'slug'    => 'hotels',
				'content' => '<!-- wp:shortcode -->[ek_hotel_search]<!-- /wp:shortcode -->',
			),
			'restaurants'   => array(
				'title'   => __( 'Restaurants', 'explore-katsina' ),
				'slug'    => 'restaurants',
				'content' => '<!-- wp:shortcode -->[ek_restaurant_search]<!-- /wp:shortcode -->',
			),
			'event_centres' => array(
				'title'   => __( 'Event Centres', 'explore-katsina' ),
				'slug'    => 'event-centres',
				'content' => '<!-- wp:shortcode -->[ek_venue_search]<!-- /wp:shortcode -->',
			),
			'map'               => array(
				'title'   => __( 'Katsina Map', 'explore-katsina' ),
				'slug'    => 'map',
				'content' => '<!-- wp:shortcode -->[ek_map]<!-- /wp:shortcode -->',
			),
			'top_hotels'        => array(
				'title'   => __( 'Top Hotels in Katsina', 'explore-katsina' ),
				'slug'    => 'top-hotels',
				'content' => '<!-- wp:shortcode -->[ek_top type="hotel"]<!-- /wp:shortcode -->',
			),
			'top_restaurants'   => array(
				'title'   => __( 'Top Restaurants in Katsina', 'explore-katsina' ),
				'slug'    => 'top-restaurants',
				'content' => '<!-- wp:shortcode -->[ek_top type="restaurant"]<!-- /wp:shortcode -->',
			),
			'top_event_centres' => array(
				'title'   => __( 'Top Event Centres in Katsina', 'explore-katsina' ),
				'slug'    => 'top-event-centres',
				'content' => '<!-- wp:shortcode -->[ek_top type="event-centre"]<!-- /wp:shortcode -->',
			),
			'explore'           => array(
				'title'   => __( 'Explore', 'explore-katsina' ),
				'slug'    => 'explore',
				'content' => '<!-- wp:shortcode -->[ek_explore]<!-- /wp:shortcode -->',
			),
			'things_to_do'      => array(
				'title'   => __( 'Things to do', 'explore-katsina' ),
				'slug'    => 'things-to-do',
				'content' => '<!-- wp:shortcode -->[ek_attractions]<!-- /wp:shortcode -->',
			),
			'stories'           => array(
				'title'   => __( 'Stories', 'explore-katsina' ),
				'slug'    => 'stories',
				'content' => '<!-- wp:shortcode -->[ek_stories]<!-- /wp:shortcode -->',
			),
			'contact'           => array(
				'title'   => __( 'Contact us', 'explore-katsina' ),
				'slug'    => 'contact',
				'content' => '<!-- wp:paragraph --><p>' . __( 'Questions about a booking, listing your business or advertising? Send us a message and we will reply within 2 working days. For a booking, please include your booking code.', 'explore-katsina' ) . '</p><!-- /wp:paragraph --><!-- wp:shortcode -->[ek_contact_form]<!-- /wp:shortcode --><!-- wp:paragraph --><p>' . __( 'Email: info@explorekatsina.com.ng · Phone/WhatsApp: +234 800 000 0000 (PLACEHOLDERS)', 'explore-katsina' ) . '</p><!-- /wp:paragraph -->',
			),
			'events'            => array(
				'title'   => __( 'Events', 'explore-katsina' ),
				'slug'    => 'events',
				'content' => '<!-- wp:shortcode -->[ek_events]<!-- /wp:shortcode -->',
			),
			'tours'             => array(
				'title'   => __( 'Tours', 'explore-katsina' ),
				'slug'    => 'tours',
				'content' => '<!-- wp:shortcode -->[ek_tours]<!-- /wp:shortcode -->',
			),
			'promote_event'     => array(
				'title'   => __( 'Promote your event', 'explore-katsina' ),
				'slug'    => 'promote-event',
				'content' => '<!-- wp:shortcode -->[ek_promote_event]<!-- /wp:shortcode -->',
			),
			'listing_setup'     => array(
				'title'   => __( 'Listing setup service', 'explore-katsina' ),
				'slug'    => 'listing-setup',
				'content' => '<!-- wp:shortcode -->[ek_setup_service]<!-- /wp:shortcode -->',
			),
			'advertise'         => array(
				'title'   => __( 'Advertise with us', 'explore-katsina' ),
				'slug'    => 'advertise',
				'content' => '<!-- wp:shortcode -->[ek_advertise]<!-- /wp:shortcode -->',
			),
			'checkin'           => array(
				'title'   => __( 'Ticket check-in', 'explore-katsina' ),
				'slug'    => 'check-in',
				'content' => '<!-- wp:shortcode -->[ek_checkin]<!-- /wp:shortcode -->',
			),
			'account'       => array(
				'title'   => __( 'My Account', 'explore-katsina' ),
				'slug'    => 'account',
				'content' => '<!-- wp:shortcode -->[ek_my_account]<!-- /wp:shortcode -->',
			),
			'book'          => array(
				'title'   => __( 'Book', 'explore-katsina' ),
				'slug'    => 'book',
				'content' => '<!-- wp:shortcode -->[ek_booking]<!-- /wp:shortcode -->',
			),
			'agreement'     => array(
				'title'   => __( 'Listing & Partner Agreement', 'explore-katsina' ),
				'slug'    => 'listing-partner-agreement',
				'content' => (string) file_get_contents( EK_DIR . 'content/listing-partner-agreement.html' ),
			),
		);

		$ids = (array) get_option( 'ek_pages', array() );
		foreach ( $pages as $key => $page ) {
			if ( ! empty( $ids[ $key ] ) && get_post( $ids[ $key ] ) && 'trash' !== get_post_status( $ids[ $key ] ) ) {
				continue;
			}
			$existing = get_page_by_path( $page['slug'] );
			if ( $existing ) {
				$ids[ $key ] = $existing->ID;
				continue;
			}
			$ids[ $key ] = wp_insert_post(
				array(
					'post_type'    => 'page',
					'post_status'  => 'publish',
					'post_title'   => $page['title'],
					'post_name'    => $page['slug'],
					'post_content' => $page['content'],
				)
			);
		}
		update_option( 'ek_pages', $ids );
	}

	/** Address of one of our pages, in the visitor's language when a translation exists (Polylang). */
	public static function page_url( $key ) {
		$ids = (array) get_option( 'ek_pages', array() );
		if ( empty( $ids[ $key ] ) ) {
			return function_exists( 'pll_home_url' ) ? pll_home_url() : home_url( '/' );
		}
		return get_permalink( Languages::translated( (int) $ids[ $key ] ) );
	}

	/** Is the visitor on one of our pages (in any language)? */
	public static function is_page( $key ) {
		$id = self::page_id( $key );
		if ( ! $id || ! is_page() ) {
			return false;
		}
		$ids = function_exists( 'pll_get_post_translations' ) ? array_map( 'intval', array_values( pll_get_post_translations( $id ) ) ) : array();
		$ids[] = $id;
		return in_array( (int) get_queried_object_id(), $ids, true );
	}

	/** One of our pages and its translations (for lists of page IDs). */
	public static function page_ids_all( $key ) {
		$id = self::page_id( $key );
		if ( ! $id ) {
			return array();
		}
		$ids = function_exists( 'pll_get_post_translations' ) ? array_map( 'intval', array_values( pll_get_post_translations( $id ) ) ) : array();
		return array_values( array_unique( array_merge( array( $id ), $ids ) ) );
	}

	public static function page_id( $key ) {
		$ids = (array) get_option( 'ek_pages', array() );
		return (int) ( $ids[ $key ] ?? 0 );
	}
}
