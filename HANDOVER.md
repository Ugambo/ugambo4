# HANDOVER — Explore Katsina

Updated at the end of every phase so anyone (or a new Claude session) can continue
from exactly where the last one stopped.

## Current status
- **Phase 1 (Architecture plan): done and approved.** See `docs/ARCHITECTURE.md`.
- **Phase 2 (Business accounts & approval): done and approved.**
- **Phase 3 (Hotels): done and approved.**
- **Phase 4 (Restaurants): done and approved.**
- **Phase 5 (Event centres): done and approved.**
- **Phase 6 (Customer accounts & reviews): done, waiting for the owner's go-ahead.**
- Next: **Phase 7**.
- **New owner instruction (9 Nov 2026): use real royalty-free photos, not placeholders.** See "Photos" below.

## Decisions made (owner approved, 5 Nov 2026)
1. All business types live in our own plugin `explore-katsina-core`. No Directorist or GeoDirectory.
2. Banner ads will be built into the plugin (Advanced Ads charges for view/click tracking).
3. FluentSMTP (free) will be added in Phase 12 so emails don't go to spam.
4. **Brand: Option B, "Durbar Regalia".** Colours: Royal Crimson `#8E1B2C`, Brass `#D2A03A`,
   Night Indigo `#141B3A`, Emerald `#1F6B52`, Ivory `#FBF7EF`, Ink `#1C1A22`.
   Fonts: **Unbounded** (headings) + **Overpass** (body), self-hosted, both checked to show
   the Hausa letters ɓ ɗ ƙ ƴ and the ₦ sign. The options page is in `docs/brand-options.html`.
5. A business needs **3 verified reviews** before it shows a rank number (changeable in Settings).
6. Payments: WooCommerce + Paystack + Flutterwave, used only for taking payments.
7. Map: Leaflet + OpenStreetMap, behind one settings function (`EK\Assets::map_config()`) so
   Google Maps can be switched on later.

## Still to decide later
- Phase 11: buy **Polylang for WooCommerce** (paid) or keep Shop/checkout English-only at launch.

## What Phase 2 built (plain language)
- **"List your business" page** (`/list-your-business/`): a 5-step, phone-friendly form for
  business name, type, LGA, description, address, **draggable map pin** (or "Use my location"),
  phone, WhatsApp, email, website, socials, opening hours, photos, owner's name, CAC number
  (optional), ID upload, bank details and a login. The Listing & Partner Agreement must be ticked.
- **Approval:** every new business is **hidden until you approve it** in
  wp-admin → **Explore Katsina → Approvals**. There you can see the details, photos, map pin,
  **ID document** (only you can open it, and every view is logged), bank details, and
  Approve / Reject (with a reason) / Pause / Resume / give or remove the **Verified** badge.
  The owner is emailed each time.
- **Business dashboard** (`/business-dashboard/`): a branded app, mobile-friendly, no WordPress
  admin. Sections: Overview, Profile, Photos, Bookings/Reservations, Earnings, Payouts (with
  bank details), Invoices, Reviews (with replies), Ranking (with tips), Analytics (page views,
  map pin taps, WhatsApp/call/website/directions clicks, bookings, revenue). Owners with more
  than one business get a switcher. Changing bank details needs the password and emails both
  the owner and you.
- **Public business page** (e.g. `/hotels/name/`, `/restaurants/name/`, `/event-centres/name/`,
  `/tour-operators/name/`, `/directory/name/`): basic version with photos, description,
  "Open now", map, WhatsApp / Call / Directions / Website buttons and opening hours.
  Phases 3–5 add rooms, menus and halls.
- **Listing & Partner Agreement** page: drafted and clearly marked **DRAFT, FOR LEGAL REVIEW**.
- **Activity log** (wp-admin → Explore Katsina → Activity log): approvals, rejections, pauses,
  Verified changes, profile/bank changes, ID views, payout requests.
- **Settings** (wp-admin → Explore Katsina → Settings): admin email for notices, agreement
  version, photo limit and size, minimum payout (₦5,000), reviews needed for a rank.

## What Phase 3 built (plain language)
- **Hotel dashboard, new sections:**
  - *Hotel details*: self-declared star rating (you can mark it "verified" in the admin approval
    screen), amenities, check-in/check-out times, house rules, cancellation policy (Flexible,
    Moderate, Strict, Non-refundable, each with exact refund rules), and how guests may pay
    (full online, deposit online with a chosen %, pay at hotel).
  - *Rooms*: room categories (Standard, Deluxe, Suite…), each with price per night, optional weekend
    price (Friday and Saturday nights), number of rooms, max guests, bed type, size, amenities, photos,
    and an on/off switch. Categories with upcoming bookings can't be deleted, only switched off.
  - *Calendar & prices*: a month view per room category showing rooms free and the price of every
    night. The hotel can close dates, mark some rooms unavailable, set a one-off price, and add
    seasonal/peak prices (e.g. Sallah/Durbar).
  - *Bookings*: tabs for Needs action / Upcoming / In house / Past / Cancelled, with Confirm, Decline,
    Check in, Check out, No-show and Cancel buttons.
- **Price rules (in order):** a one-off price on a date, then a seasonal price, then the weekend price,
  then the normal price.
- **Find a hotel** (`/hotels/`): dates, guests, rooms, LGA, "Near me" (browser location, with
  permission); filters for price per night, star rating, room category, amenities and pay-at-hotel;
  sort by distance, rank, rating or price; list or map view. Shows "2.3 km away", the lowest price
  per night and the total for the dates.
- **Hotel page**: star rating, every room category with price per night, total for the chosen dates,
  rooms left, "Book now"; amenities, check-in/out, house rules, cancellation policy, map, nearby places.
- **Booking** (`/book/`): guest details, payment choice, the nightly breakdown and total. Then
  payment (or straight to confirmation for pay-at-hotel), a booking code like `EK-7Q3MKD`, and a
  private status page link sent by email. Emails go to the guest, the hotel and you.
- **No double booking:** each room category has one calendar row per night. Booking locks those rows in
  date order, checks every night, and reserves in one step. If the database reports a clash, it retries
  up to 3 times. Tested: 8 guests clicking "Book" for the last room at the same moment → exactly 1 booking,
  7 clear "just booked by someone else" messages.
- **Unpaid holds:** an online booking holds the room for 15 minutes. A job every 5 minutes frees expired holds.
  If money arrives after the room went to someone else, the booking is flagged "Payment issue" and you
  are emailed to refund or rebook.
- **Money:** each online payment is recorded as the hotel's earning minus commission (10% placeholder),
  both **on hold**. When the hotel marks check-out, the 3-day release clock starts. (The job that
  releases held money, and the admin payout screen, come in Phase 7.) If a paid booking is declined or
  cancelled by the business, the guest is refunded in full automatically (Phase 6).
- **Delete sample data:** `wp ek delete-sample --yes` removes every business whose name starts with
  "SAMPLE", plus their rooms, bookings, calendar, money records, photos and owner accounts.

## What Phase 4 built (plain language)
- **Restaurant dashboard, new sections:**
  - *Restaurant details*: types of food (Hausa/Northern, Nigerian, continental, fast food,
    grills/suya, café, …), price range (₦ to ₦₦₦₦ per person), halal, dine-in / takeaway / delivers.
  - *Menu*: categories (e.g. Rice dishes, Soups & Swallow, Grills, Drinks) and dishes with name, price,
    photo, description; a one-tap **Sold out / Available again** button; move up/down; edit; delete.
  - *Table settings*: count by seats or by tables, how many per time slot, slot length, largest group
    online, minimum notice, how far ahead, optional own reservation hours, closed dates, and an
    optional **deposit for large groups** (e.g. groups of 8+ pay ₦2,000 per guest online). A preview
    shows the times guests will see tomorrow.
  - *Reservations*: same tabs as hotels; Confirm / Decline → Seated → Completed, or No-show / Cancel.
  - *Online orders*: **built but switched OFF site-wide.** It only appears when you tick
    wp-admin → Explore Katsina → Settings → "Online food ordering". Then each restaurant can choose pickup
    and/or delivery, delivery fee, minimum order, preparation time and payment (online / on pickup).
    Order flow: New → Accepted → Preparing → Ready (or Out for delivery) → Completed. Commission 10%.
- **Find a restaurant** (`/restaurants/`): Near me, LGA, food type, price range, minimum rating, Open now,
  Halal; sort by distance, rank, rating or price; list or map.
- **Restaurant page**: food types, price range, halal and service labels, **Reserve a table** (date + people
  → bookable times), the full menu with prices and sold-out labels, opening hours, map, WhatsApp and Call.
- **No over-booking of tables:** the same lock-and-check method as hotel rooms, per time slot. Tested: 6 groups
  racing for 5 seats → exactly 1 got in.
- **Deposits** are held like hotel money (commission 0% on table reservations) and start their 3-day release
  clock when the reservation is marked completed.

## What Phase 5 built (plain language)
- **Event centre dashboard, new sections:**
  - *Venue details*: amenities (parking, generator/24-hour power, AC, chairs and tables, sound system,
    outside catering/decorators allowed, changing rooms, security, stage, projector, wheelchair access),
    **how guests book** (Request to book, or Instant booking with deposit), deposit % (default 30%),
    cancellation policy and venue rules.
  - *Halls*: name, seated and standing capacity, price per day or per event, optional weekend price,
    indoor/outdoor, photos, on/off switch.
  - *Calendar & prices*: the same calendar as hotels: block dates, weekend and peak (Sallah) prices.
  - *Bookings*: Needs action / Upcoming / Past / Cancelled with Accept, Decline, Cancel, Mark event completed.
- **Request to book:** the guest asks for a date (the date is held). The venue has **48 hours** to reply,
  otherwise the request expires and the date is freed. After acceptance the guest has **72 hours** to pay the
  deposit online, otherwise the booking is cancelled and the date freed. Statuses: requested → confirmed →
  deposit paid → completed (or declined / cancelled / expired).
- **Instant booking:** the guest pays the deposit straight away (15-minute hold while paying).
- **Money:** 10% commission (placeholder) on the deposit; the venue's share is **released 3 days after the
  event date** (the release job and payouts screen come in Phase 7). The balance is paid to the venue directly.
- **Find an event centre** (`/event-centres/`): date, guests, seated/standing, LGA, Near me, max price,
  amenities; sort by distance, rank, rating or price; list or map.
- **Venue page:** amenities, every hall with capacity, price for the chosen date, deposit, availability,
  "Request to book" / "Book now", cancellation policy and venue rules.

## What Phase 6 built (plain language)
- **My Account** (`/account/`, in the menu): log in or create an account (name, email, optional phone,
  password). Tabs: **My Bookings** (hotels and event centres), **My Reservations** (restaurant tables),
  **My Orders** (shop orders now; tickets, guides and tours plug in later), **Favourites**, **Profile**
  (name, phone, password). Customers never see WordPress admin. Booking forms fill in their name, email
  and phone automatically, and the booking lands in their account.
- **Booked before having an account?** "Email me the link" sends a 24-hour link; opening it adds every
  booking made with that email. Only the real owner of the email can do this; bookings already in someone
  else's account are never moved.
- **Confirmation page** (also reachable from the email link): booking code, **Add to calendar**
  (.ics file for phones/Outlook/Apple, and Google Calendar), Directions, WhatsApp, Call.
- **Cancel online, refund by policy.** The page tells the guest exactly how much comes back *before* they
  cancel:
  - Flexible: full until 24h before; after that everything except the first night.
  - Moderate: full until 5 days before; after that 50%.
  - Strict: 50% until 7 days before; after that nothing. Non-refundable: nothing.
  - Restaurant deposits: full until 24h before; after that nothing.
  - Food orders: full refund until the restaurant accepts them.
  - **If the business declines or cancels, the guest always gets everything back.**
  Refunds go back through Paystack/Flutterwave automatically when possible. If not, they wait in
  **wp-admin → Explore Katsina → Refunds** (with a count badge); you pay by transfer and type the reference.
  The business's earnings are adjusted: it keeps only the non-refunded part, minus commission on that part.
- **Verified reviews only:** hotel after check-out, restaurant after a completed reservation, event centre
  after a completed event (tours in Phase 9). One review per booking, up to 180 days after. Overall stars
  plus cleanliness, service, value and location (optional), title, text, English or Hausa. The guest is
  emailed an invitation. Reviews appear on the business page as **"Verified booking"** with averages,
  and the owner's reply underneath.
- **Favourites:** "♡ Save" on every business page; saved places are listed under Favourites.
- **Emails** for every booking, reservation, cancellation, refund and review go to the guest, the business
  and you (admin). **WhatsApp/SMS:** every email also fires a hook (`ek_send_message`) so a WhatsApp/SMS provider
  can be plugged in later. It is off by default (no provider chosen, no cost).
- **Fixes along the way:** business-page photos were showing zoomed-in on wide screens (fixed for all
  businesses); the menu no longer lists utility pages (Book, Cart, Checkout, WooCommerce's own
  "My account", Sample Page, the agreement, Business Dashboard). Business owners reach their dashboard
  through log-in or the button in My Account. A designed menu comes with the design work later.

## Photos (royalty-free, with credits)
- Source: **Wikimedia Commons**, only files that are public domain, CC0, CC BY or CC BY-SA. Each photo keeps
  its author, licence, licence link and source page, and business pages show a **"Photo credits"** list.
- Tools: `scripts/commons_search.py "search words"` lists candidates with licences;
  `scripts/fetch_commons.py sample-data/media/manifest.json sample-data/media` downloads the chosen ones
  (standard 1280-pixel copies) and writes `sample-data/media/credits.json`.
- **Current library (10 photos, all reviewed by eye):** 3 hotel rooms + 1 hotel pool, jollof/fried-rice
  plate, suya skewers, masa (waina), tuwo, 2 event halls. Rejected after review: a blurry room with
  luggage, a dated black-and-white restaurant, and photos where identifiable people are the subject.
- Rules followed: generic photos only for SAMPLE businesses (no real hotel names or logos, no close-ups of
  identifiable people); real attractions (Phase 10) will only use photos of that actual place.
- The cloud environment "ugambo4" allows `commons.wikimedia.org` and `upload.wikimedia.org`. Wikimedia
  rate-limits cloud servers: the tools identify themselves with this project's GitHub page and pause between
  requests, but after a burst of searches Wikimedia may refuse requests for a while ("robot policy" 429).
  The download tool reads licences from each photo's page and only fetches standard 1280px copies,
  one photo about every minute, retrying refused ones later. Expect ~1 photo per minute at best.

## Payments: now installed
- The cloud session now runs in a personal environment called **"ugambo4"** that allows wordpress.org, so
  `setup.sh` installs **WooCommerce 11.2.2**, **Paystack WooCommerce Payment Gateway 5.8.6** (by Paystack)
  and **Flutterwave WooCommerce 3.3.2** (by Flutterwave), all set to Naira and Katsina. Plugins are downloaded
  to `.cache/plugins/` and installed from there.
- The **booking ↔ WooCommerce order bridge is tested** (17 checks) using WooCommerce's built-in offline
  payment method as a stand-in: order created in Naira for the right amount, payment marks the booking paid
  once only, failed payment frees the room, the guest returns to our booking page.
- **Still to do (needs the owner):** add Paystack and Flutterwave **TEST** keys under
  WooCommerce → Settings → Payments, then run a real test-mode payment. The cloud session also needs
  `api.paystack.co` / `checkout.paystack.com` (and Flutterwave's hosts) allowed for that.
- Until a real payment method is switched on, **local** sites keep the clearly-labelled TEST payment screen.
  Live sites never show it.
- "Near a chosen attraction" in hotel search works through `?near=<id>` and appears in the form once
  attractions exist (Phase 10).

## Security in place (tested)
- Business owners have their own role with **no WordPress admin** and no Media Library access.
- Every dashboard action checks "does this business belong to you?" first. Tests try all six
  dashboard actions against another owner's business and all are refused.
- Bank account numbers are **encrypted** (libsodium) with the key `EK_ENCRYPTION_KEY`.
  **Keep a safe copy of this key** (`.env` locally; `wp-config.php` on the live host).
  Without it, saved bank details cannot be read.
- ID documents are stored with random names in a folder the web server refuses to serve (tested: 403).
  On the live host, set `EK_PRIVATE_DIR` in wp-config.php to a folder outside the website.
- Spam protection on sign-up: a hidden trap field plus a minimum fill-in time.
- Payout requests use a database lock, so a double-click can't request the same money twice.

## How to run it
```bash
./setup.sh          # sets up / updates everything (safe to re-run)
./tests/run.sh      # about 390 automatic checks, server and browser (Phases 2–6)
docker compose -f docker-compose.offline.yml run --rm -T cli wp ek delete-sample --yes   # tidy up test data
```
- Site: http://localhost:8888 · Admin: http://localhost:8888/wp-admin (user `admin`, password in `.env`)
- Test inbox (offline mode): http://localhost:8025, where every email the site sends lands.

## Where things are
| Path | What it is |
|---|---|
| `docs/ARCHITECTURE.md` | The approved plan |
| `docs/brand-options.html` | The two brand options (B chosen) |
| `docs/screenshots/phase2/` | Screenshots of the sign-up, dashboard, admin and public page |
| `docs/screenshots/phase3/` | Screenshots of hotel search, hotel page, booking, confirmation, calendar, rooms |
| `docs/screenshots/phase4/` | Screenshots of restaurant search, restaurant page, reservation, menu builder, table settings |
| `docs/screenshots/phase5/` | Screenshots of event centre search, venue page, request form, halls, confirmation |
| `docs/screenshots/phase6/` | Screenshots of My Account, confirmation with calendar/cancel, cancelled booking, review form, reviews on a page, favourites, admin Refunds |
| `sample-data/media/` | Royalty-free sample photos + `credits.json` (author, licence, source) |
| `scripts/` | Photo search/download tools for Wikimedia Commons |
| `setup.sh` | Re-runnable setup |
| `docker-compose.offline.yml` | "Offline" local site (used when wordpress.org is blocked) |
| `.wp-env.json` | wp-env setup (normal local site) |
| `plugins/explore-katsina-core/` | Our plugin (all business logic) |
| `  includes/` | PHP classes, one per job (Business, Signup, Dashboard, Admin, Money, Crypto…) |
| `  templates/` | Screens (sign-up, dashboard sections, admin pages, public page) |
| `  assets/` | Brand CSS, fonts, JavaScript, Leaflet map library |
| `  content/listing-partner-agreement.html` | Agreement draft (for legal review) |
| `mu-plugins/ek-local-mail.php` | Local-only: sends emails to the test inbox. **Never upload to the live site.** |
| `tests/` | Automated checks: `phase2-security.php`, `phase3-hotels.php`, `phase4-restaurants.php`, `phase5-venues.php`, `phase6-accounts.php`, `phase4-woo-bridge.php`, `e2e/phase2–6.js` |

## Environment notes (for the next session)
- **Cloud environment:** this session uses the personal environment **"ugambo4"** (wordpress.org allowed).
  Start new cloud sessions for this project in that environment.
- **Docker containers can't reach the internet directly** in the cloud (only this machine's proxy can), so
  `setup.sh` downloads plugin files on the machine and installs them from `.cache/plugins/`. The "could not
  establish a secure connection to WordPress.org" warnings from inside WordPress are harmless here.
- **Earlier note: cloud sessions blocked** `wordpress.org` (WordPress and plugin downloads), Alpine/Debian package
  mirrors and pushes to GitHub. Because of that:
  - `setup.sh` detects it and uses **offline mode** (`docker-compose.offline.yml`), which only needs
    Docker Hub. WordPress itself is taken from the official `wordpress:php8.2-apache` image.
  - wp-env needs those mirrors to build its images, so it runs on the owner's own computer, not in the cloud.
  - **Third-party plugins (WooCommerce, Paystack, etc.) cannot be installed in the cloud session**
    until the owner allows `wordpress.org`, `downloads.wordpress.org` and `api.wordpress.org` in the
    environment's Network access settings. Phase 3 needs WooCommerce for payments.
  - Docker Hub sometimes answers "429 Too Many Requests"; `setup.sh` retries automatically.
- The cloud session's Docker daemon is not started automatically: `dockerd > /tmp/dockerd.log 2>&1 &`.
- **GitHub push is failing** ("Claude doesn't have GitHub access to Ugambo/ugambo4"). All work is
  committed locally on branch `claude/explore-katsina-architecture-wj2xli`. The owner must reconnect
  GitHub / install the Claude GitHub App; then run `git push -u origin claude/explore-katsina-architecture-wj2xli`.
- In the cloud test browser, OpenStreetMap tiles don't load (network), so maps look grey in
  screenshots; pins, dragging and "Use my location" work. In a normal browser the map shows.
- **Live host needs a real cron job** (every 5 minutes) so unpaid holds are freed on time even when the
  site is quiet: `*/5 * * * * wget -q -O - https://explorekatsina.com.ng/wp-cron.php?doing_wp_cron >/dev/null 2>&1`
  and add `define( 'DISABLE_WP_CRON', true );` to wp-config.php. Phase 15 covers this.
- WordPress gotcha: never name a form field `name` (it's a reserved WordPress word and turns the page
  into "Page not found"). The business name field is `business_name`.

## Placeholders to replace before launch (running list)
- Contact email `info@explorekatsina.com.ng` (PLACEHOLDER), used in the dashboard footer and emails
- Phone `+234 800 000 0000` (PLACEHOLDER), used in the agreement
- Social handles `@explorekatsina` (PLACEHOLDER)
- Listing & Partner Agreement: every `[square bracket]` item + lawyer review
- Commission rates (placeholders: hotels 10%, event centres 10%, tour operators 15%, restaurant reservations 0%, food orders 10%)
- Plan prices (Phase 9)
- Paystack and Flutterwave live keys (test keys only until launch)
- Admin notification email (Settings)
- `EK_ENCRYPTION_KEY` and `EK_PRIVATE_DIR` on the live host's wp-config.php
- Sample/test businesses created by the tests are named "SAMPLE …": delete with `wp ek delete-sample --yes`
- Hotel cancellation policy wording (4 presets in `includes/class-hotel.php`): check with your lawyer
- Deposit default 30% and 15-minute payment hold (business decisions, easy to change)
- Restaurant price-range bands (₦ under ₦3,000 … ₦₦₦₦ over ₦15,000 per person) in `includes/class-restaurant.php`
- Default large-group deposit ₦2,000 per guest for groups of 8+ (each restaurant can change it)
- Paystack / Flutterwave TEST keys, then LIVE keys at launch
- Event centres: 48-hour reply window, 72-hour deposit window, 30% default deposit, 7-day maximum online booking
- Sample photos are illustrative (Wikimedia Commons, credited); real businesses upload their own
- Refund rules above (24h / 5 days / 7 days, restaurant 24h) and the 180-day review window: check with your lawyer
- WhatsApp/SMS notifications: off until you choose a provider (e.g. Termii, Twilio). Costs per message
