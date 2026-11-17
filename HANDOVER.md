# HANDOVER — Explore Katsina

The owner's guide to the Explore Katsina website: how to put it online, how to run it day to day, and what
to replace before launch. The technical record of how it was built is at the end (Part 4).

## Current status
- **All 15 phases are done** (Phase 15, test everything and hand over, finished 17 November 2026).
- **Tested:** 1,340 automatic checks (all passing on a fresh install, 17 Nov 2026), including all 14 journeys in the brief, every page and dashboard at
  phone, tablet and computer sizes, every email, every link and the language switcher (see
  `docs/phase15-checks.md`), a break-in test showing businesses only reach their own data, and Google
  Lighthouse 90+ on phones for all 20 main pages (`docs/lighthouse/summary.md`).
- **The site holds demonstration data** named "SAMPLE": delete it before launch (one button, see 2.14).
- **Export for your host:** `explore-katsina-site-2026-11-17.wpress` (212 MB, sent to you in the chat; SHA-256
  `4c93db7c…c7d1389`). It was test-imported into a separate, empty WordPress and worked. The owner login for it
  was given to you separately, not written here.

---

# Part 1 — Putting the site online (step by step)

You need: a hosting plan, your domain name, and about two hours. Do the steps in order.

### 1.1 Hosting and domain
- Choose a host with **PHP 8.1 or newer**, **MySQL/MariaDB**, **SSL (https)** and **cron jobs**: for example
  Truehost or Whogohost (Nigeria, cPanel) or Hostinger (business or LiteSpeed plan). A plan with at least
  2 GB memory and SSD storage is comfortable for maps and bookings.
- Point your domain (e.g. explorekatsina.com.ng: still a placeholder, your choice) to the host and switch on
  the free SSL certificate in the host's control panel. The site must open with **https://**.

### 1.2 Install WordPress on the host
Use the host's one-click installer (Softaculous in cPanel, or Hostinger's "Website → Add website"). Any admin
username and password will do: the import replaces them.

### 1.3 Import Explore Katsina
1. In the new WordPress: **Plugins → Add New**, search **All-in-One WP Migration**, install, activate (free).
2. **All-in-One WP Migration → Import → Import from File**, choose the `.wpress` export file.
3. If it says the file is too big: in cPanel open **MultiPHP INI Editor** (or "Select PHP Version → Options")
   and set `upload_max_filesize` and `post_max_size` to **512M**, then try again. On Hostinger ask support,
   or use their own migration tool. (The paid "Unlimited" add-on is not needed.)
4. Confirm the warning, wait for "Your site has been imported", then open **Settings → Permalinks** and click
   **Save Changes** twice (the import screen asks for this).
5. Log in with the owner login given to you. **Change the password** and set **your own email**
   (Users → Profile). Also set **Settings → General → Administration Email**.
6. Expected yellow boxes after the move (all normal): the encryption key (1.4), "Wordfence installation is
   incomplete" (click **Resume installation**, see 1.10), "FluentSMTP … no email connection" (1.7), and a
   Rank Math note about "mailpoet_page" (you can close it).

### 1.4 The encryption key (do this before any business enters bank details)
wp-admin shows a yellow box with a line starting `define( 'EK_ENCRYPTION_KEY', …`. Copy it into
`wp-config.php` (host **File Manager** → `public_html/wp-config.php` → Edit) just above the line
`/* That's all, stop editing! */`, save, reload wp-admin: the box disappears.
**Keep a copy of that line in a safe place** (password manager). Without it, saved bank details cannot be read,
and backups cannot bring them back.
Optional: add `define( 'EK_PRIVATE_DIR', '/home/youruser/ek-private/' );` (a folder outside `public_html`)
so ID documents are stored outside the website folder.

### 1.5 Speed and the page cache
- **LiteSpeed host** (Hostinger, many Nigerian hosts): deactivate WP Super Cache, install the free
  **LiteSpeed Cache** plugin and switch it on (never run two page caches).
- **Other hosts:** **Settings → WP Super Cache → Caching On → Update Status**.
- The security and browser-caching rules are written automatically the first time you open wp-admin on the
  new host. On an Nginx host, ask the host to add the rules listed in `includes/class-security.php`.

### 1.6 The cron job (keeps money, holds and invoices on time)
cPanel → **Cron Jobs** → every 5 minutes:
`wget -q -O - https://YOUR-DOMAIN/wp-cron.php?doing_wp_cron >/dev/null 2>&1`
then add `define( 'DISABLE_WP_CRON', true );` to `wp-config.php` (same place as the key).

### 1.7 Email that arrives (not in spam)
Create the mailbox `info@` your domain (host control panel). Then **Settings → FluentSMTP**: add a connection
(your host's SMTP details, or a mail service such as Brevo/Zoho/Amazon SES; check their current prices).
Send the test email. Newsletter email (MailPoet) uses the same route.

### 1.8 Payments: test first, then live
1. Create accounts with **Paystack** and/or **Flutterwave** (they verify your business; this takes days).
2. **WooCommerce → Settings → Payments → Paystack → Manage**: tick Enable and **Test mode**, paste the
   **test** public and secret keys (Paystack dashboard → Settings → API Keys & Webhooks), copy the webhook
   address shown on that page into the same Paystack page, save. Flutterwave: same idea.
3. Make a test booking with a test card from the Paystack/Flutterwave documentation. Check the booking shows
   as paid in the hotel's dashboard and that the emails arrive.
4. Untick Test mode, paste the **live** keys, save. (The local "test payment" screen used during building
   never appears on a live site.)
The exact field names on those plugins' pages may differ slightly from this description: follow their labels.

### 1.9 Backups
**UpdraftPlus → Settings**: choose remote storage (Google Drive is free), click Authenticate, save. Schedules are
already set (database every day, 14 kept; files every week, 4 kept). Click **Backup Now** once to check.
Keep the encryption key line (1.4) separately: it is not inside the backups.

### 1.10 Security
- **Wordfence**: open it once and click **Optimize the Wordfence Firewall** if offered.
- **Two-step login for administrators**: Wordfence → **Login Security** → scan the QR code with an authenticator
  app on your phone. Free; strongly recommended.
- Login lockouts (4 tries, 20 minutes), hidden WordPress version, XML-RPC off, password rules and security
  headers are already on.

### 1.11 Replace the placeholders — see the checklist in Part 3.

### 1.12 Delete the SAMPLE data — see 2.14.

### 1.13 Open to search engines
**Settings → Reading → untick "Discourage search engines"** (the export arrives with it ticked so nothing is
indexed before launch). Then add the site to **Google Search Console** and submit `https://YOUR-DOMAIN/sitemap_index.xml`.

---

# Part 2 — Running the site (how to…)

Everything below is in **wp-admin → Explore Katsina** unless said otherwise. Every important action is written
to **Activity log**.

### 2.1 Approve (or reject) a new business
1. **Approvals** (the red number shows how many are waiting) → click the business.
2. Check the details, the **map pin**, the photos, the bank details and the ID document
   (**View ID (logged)**: every view is recorded).
3. **Approve and publish**, or **Reject** with a reason (the owner is told what to fix and can resubmit).
4. Later on the same page: **Pause listing / Resume listing**, **Give Verified badge**, and **Verify
   self-declared star rating** (only verified stars are shown to search engines).

### 2.2 Commission
- Default rates: **Settings → Money → Commission rates** (placeholders: hotels 10%, event centres 10%, tour
  operators 15%, restaurant reservations 0%, food orders 10%).
- One business's own rate: open it in **Approvals** → **Own commission rate for this business** → **Save rate**
  (give a reason). Changes apply to **new bookings only**.

### 2.3 Payouts (paying businesses)
How money moves: a guest pays online → the business's share is **on hold** until 3 days after check-out / the
event (the complaint window) → it becomes **available** → the business requests a payout (minimum ₦5,000).
1. **Payouts** → **Show full account details (logged)**.
2. Send the bank transfer from your bank.
3. **Approve**, type the **Transfer reference**, **Mark paid**. Or **Reject** with a reason (the money stays in
   their balance). The business is emailed at each step.

### 2.4 Commission invoices (pay-at-the-venue bookings)
- On the **1st of each month** an invoice is created for commission on bookings paid at the venue. Businesses
  pay online or from their earnings balance in their dashboard.
- Paid by bank transfer? **Invoices → Mark paid** with the reference. **Write off** (with a reason) cancels one.
- **Unpaid 30 days after the due date → the listing is paused automatically**, and comes back by itself when
  paid. **Create invoices now for [month]** makes them by hand (safe to repeat).
- Change the payment time: **Settings → Money → Invoice payment time (days)**.

### 2.5 Guest complaints (disputes)
A guest can report a problem up to 3 days after check-out/the event; the business's money for that booking is
frozen. **Complaints** → read both sides → choose **No refund: release the money to the business** or **Refund
the guest** (any amount up to what they paid) → write a note (sent to both) → **Decide**.

### 2.6 Refunds
Cancellations follow each business's policy automatically. When the payment company cannot refund by itself,
the refund appears in **Refunds → Waiting to be paid**: send it by transfer and click **Mark refunded** (with
the reference), or **Try the gateway again**.

### 2.7 Fake or abusive reviews
Only guests with a real, completed booking can review. **Reviews** → find it → choose a reason (fake, abusive,
personal information, not about this business, spam) → **Hide**. **Show again** undoes it. Rankings update
overnight, or press **Recalculate rankings now**. Owners can reply to reviews from their dashboard.

### 2.8 Ranking weights
**Settings → Rankings**: reviews needed before a rank number shows (3), how the score is made (rating /
completed bookings / response, out of 100), "pretend" average reviews (stops one 5★ review beating many 4.6★
ones), how fast old reviews count less, and the Top Rated / Rising badges. Featured and paid plans are
**never** part of the score. Press **Recalculate rankings now** after changes.

### 2.9 Plans, Verified and paid services
- Prices: **Settings → Prices for paid features** (all PLACEHOLDERS). Businesses buy plans (Featured,
  Premium) in their dashboard → **Plan**; reminders go 7 days and 1 day before the end; when a plan ends the
  listing simply goes back to Basic.
- **Sales & services**: approve or reject **Verified badge applications** (with optional refund), move
  **Listing setup orders** along (In progress → Done), and approve **Event promotions**.
- **Revenue**: your income per month and per source; record money received outside the site there too.

### 2.10 Banner ads, AdSense and partners
- **Banner ads → Add an ad**: name, advertiser, zone (Homepage, Search results, Katsina Map list, Sidebar,
  Inside articles), image, link, start/end dates, payment received. Views and clicks are counted; ads are always
  labelled "Advertisement".
- AdSense: **Settings → Advertising & shop** (off until you add your publisher ID and slot numbers).
- **Partners**: affiliate links (car hire etc.) with click counts. **Enquiries**: messages from the
  "Advertise with us" page. Add your media kit PDF in Settings.

### 2.11 Your own tours and ticket check-in
- **Tours → Add New**: description, price per person, maximum group size, pickup point, duration, photos, and
  the **Dates** table (date, time, seats, optional price, open/closed; dates with bookings cannot be deleted,
  set them to closed). Free cancellation window:
  **Settings → Prices** ("Own tours: free cancellation until … hours before departure").
- Ticketed events: in the event editor (2.12) fill the **ticket types** table (name, price, quantity).
  Buyers get each ticket's QR code by email and on their order page.
- **Check-in staff**: **Users → Add New → Role "Ticket check-in staff"**. On the day, staff open
  `https://YOUR-DOMAIN/check-in/` on a phone, log in, choose the event, press **Start camera** and point it
  at the QR code (or type the code). Each ticket works once; the counter shows how many are in.

### 2.12 Attractions, festivals and events
- **Attractions → Add New**: text, category, LGA, map pin, opening hours and entry fee (as text), how to get
  there, best time to visit, history, **sources**, photos with credits. Keep **"not yet verified"** ticked
  until you have checked the details on the ground.
- **Festivals & Events → Add New**: dates (or **date to be confirmed**), venue, LGA, map pin, type, sources and
  optional ticket types. Organisers can also pay to promote their own events (approve them in Sales & services).
- **Posts → Add New** for Stories (blog), with the categories already created.

### 2.13 Switch on food ordering (later)
**Settings → Restaurants → "Switch on online food ordering"**. Each restaurant then gets an **Online orders**
section in its dashboard (pickup/delivery, fees, minimum order, preparation time) and orders appear there.
While it is off, no ordering button appears anywhere (tested).

### 2.14 Delete the SAMPLE data (before launch)
**Explore Katsina → Settings**, bottom of the page: **Delete all SAMPLE data**: type `DELETE` and confirm. It
removes every SAMPLE business with its owner account, bookings, reviews, invoices and photos, the SAMPLE
tours, events and stories, the SAMPLE shop products and guide PDF. Your real businesses, the researched guide
content (attractions, the Sallah Durbar, Plan your trip) and your settings stay.
(Developers: `wp ek delete-sample --yes` does the same.)

### 2.15 Hausa translations
- Every main page has a Hausa copy (addresses start with `/ha/`). **Pages**, then use the language menu in the
  top admin bar to show the Hausa pages, → open a page → replace the English text with Hausa → untick **"Needs Hausa translation"** (box on the
  right) → Update. Until then visitors see a short note and search engines skip the page.
- Menus: **Appearance → Menus → the "(Hausa)" menus**.
- Listings, attractions and events are shown in both languages from one record (owners write their own text).
- Buttons and labels of the booking screens are English. To translate them, the free **Loco Translate**
  plugin can be used. Please use a fluent Hausa writer, not machine translation.

### 2.16 Shop and digital guides
**Products → Add New** (WooCommerce). Guides/maps: tick **Virtual** and **Downloadable** and add the PDF: buyers get
an instant private download link. Delivery fees by state: **WooCommerce → Settings → Shipping** (PLACEHOLDER
fees: Katsina ₦1,500, nearby states ₦3,000, rest of Nigeria ₦5,000).

### 2.17 Reports
**Reports**: commission earned, money owed per business, no-show rates, CSV download of bookings for a period.

---

# Part 3 — Checklist: replace before launch

**Things only you can provide or decide**
- [ ] Domain name and host (1.1); the site on **https://**
- [ ] Encryption key in wp-config.php, with a safe copy (1.4); optionally `EK_PRIVATE_DIR`
- [ ] Your own admin email and password (1.3); two-step login (1.10)
- [ ] Real mailbox and SMTP service (1.7)
- [ ] Paystack/Flutterwave: test keys → test booking → live keys (1.8)
- [ ] Backups connected to remote storage (1.9); cron job (1.6); page cache on (1.5)

**Contact details (PLACEHOLDER everywhere until replaced)**
- [ ] Email `info@explorekatsina.com.ng` (footer, Contact page, emails, dashboard footer, MailPoet sender)
- [ ] Phone `+234 800 000 0000` (Contact page, agreement, footer) and the **WhatsApp number** in
      the **Join.chat** settings (left menu; currently +2348000000000)
- [ ] Social handles `@explorekatsina`
- [ ] Admin notification email (**Explore Katsina → Settings → Businesses**)
- [ ] Bank transfer details for businesses paying invoices by transfer (shown as "contact us" for now)

**Legal (drafts marked "DRAFT – for legal review")**
- [ ] Listing & Partner Agreement: every `[square bracket]` item + lawyer review (change the agreement version in Settings when you update it)
- [ ] Booking & Cancellation Policy, Refund Policy, Review Guidelines, Privacy Policy (NDPA 2023), Terms of Use: every `[bracket]`, then lawyer review
- [ ] About page: company name, RC number, address, a line about the founders
- [ ] Hotel cancellation policy wording (4 presets) and the refund rules (24 h / 5 days / 7 days; restaurants 24 h), 180-day review window

**Prices and business rules (all placeholders, all changeable in Settings)**
- [ ] Commission rates (2.2): hotels 10%, event centres 10%, tour operators 15%, restaurant reservations 0%, food orders 10%
- [ ] Plan prices, Verified fee, listing setup, event promotion packages, banner ad prices ("on request")
- [ ] Money rules: 3-day hold and complaint window, invoice due after 30 days, minimum payout ₦5,000, no-show flag at 25%
- [ ] Booking rules: 30% default deposit, 15-minute payment hold; event centres 48-hour reply / 72-hour deposit windows, 7-day maximum online booking; restaurants ₦2,000-per-guest deposit for groups of 8+
- [ ] Restaurant price bands (₦ under ₦3,000 … ₦₦₦₦ over ₦15,000 per person); map price bands (hotels under ₦15k / ₦35k / ₦70k; event centres under ₦200k / ₦500k / ₦1m)
- [ ] Ranking settings (2.8)
- [ ] Shop delivery fees (2.16); tour cancellation window (48 h)

**Content**
- [ ] **Delete the SAMPLE data** (2.14)
- [ ] Guide content: check hours, fees, access and the approximate map pins on the ground, then untick "not yet verified" per attraction; review and publish the 3 draft stories
- [ ] Your own tours (city tour, Durbar package, Daura day trip): descriptions, prices, dates
- [ ] Hausa translations by a fluent writer (2.15)
- [ ] Media kit PDF, AdSense code (optional), partner agreements
- [ ] Logo/brand files if you have final versions; replace the default share picture if you like (Rank Math → Titles & Meta → Global Meta → OpenGraph Thumbnail)

**Optional services (choose later; may cost money)**
- [ ] WhatsApp/SMS notifications (off until you choose a provider, e.g. Termii or Twilio; costs per message)
- [ ] Map tiles: OpenStreetMap is free with a fair-use limit; switch provider if the map gets very busy
- [ ] Polylang for WooCommerce (paid) only if you want the shop in Hausa too (owner decision: English-only for now)

**Launch day**
- [ ] Settings → Reading: allow search engines (1.13); submit the sitemap in Google Search Console
- [ ] Make one real small booking end to end and refund it

---

# Part 4 — Technical record

### What Phase 15 did (plain language)
**Tested everything, the way people will use it**
- **All 14 journeys in the brief** pass in one automatic browser test (`tests/e2e/phase15-journeys.js`): a
  hotel signs up on a phone → approved → rooms, prices, calendar → on the map; a guest uses "Near me", pays 2
  nights, the stay ends, the money is released and paid out; two guests race for the last room (one wins); a
  pay-at-hotel stay → invoice → unpaid invoice pauses the listing (paying brings it back); restaurant menu →
  reservation → completed → verified review; event centre hall → request → deposit → event → money released;
  cancellation with refund; Featured on and off (rank unchanged); a one-review newcomer does not outrank an
  established hotel; the map with 215 pins shows in 1.9 s on a slowed-down phone; an ad's views and clicks are
  counted; a ticket's **QR code is emailed and scanned by a phone camera** at check-in; a digital guide
  downloads instantly; food ordering stays hidden while off.
- **Every page, dashboard, email, link and the language switcher** (`tests/e2e/phase15-sweep.js`, report in
  `docs/phase15-checks.md`): 48 English and 28 Hausa pages and all dashboards at 360 / 768 / 1280 px, 67 kinds
  of email (99 emails) checked for branding, leftover placeholders and working links, 178 addresses crawled
  with none broken, and English ⇄ Hausa on every page.
- **A real move to a new host was rehearsed**: a fresh install was built from scratch with `setup.sh`,
  exported with All-in-One WP Migration (compressed), imported into a separate empty WordPress, and checked.

**Fixed or added because of the testing**
- Ticket emails now carry each ticket's **QR code** (drawn as a small table, so it shows even when pictures are
  blocked); a phone camera scanned it successfully.
- **Delete all SAMPLE data** button (Settings) so no command line is needed before launch.
- wp-admin shows a ready-to-paste **encryption key** line when none is set; security rules are re-written
  automatically after moving host; the backups folder is closed before the first backup.
- Language switcher on the full-screen map; wide admin tables scroll inside their box on phones; the XML
  sitemap refreshes with the page cache; the setup script now builds menus and the share picture after the guide
  content (found by testing a brand-new install); "Festivals & Events" label in the menu.
- Local test sites only: a **test payment** option for the shop (never on a live site), like the one bookings use.

**For developers: making a new export**
`wp ek prepare-export --yes` (new owner admin, normal email sending, hidden from search engines, local files
removed; prints the password once), then All-in-One WP Migration → Export → File, with "Exclude must-use
plugins" ticked. Compression (gzip) was switched on for this export by adding the plugin's own
`options[compression_type]=gzip` field to its export form; the free importer reads compressed files.

### Decisions made (owner approved, 5 Nov 2026)
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

8. **Shop and checkout stay English-only at launch** (owner, 11 Nov 2026). No paid "Polylang for
   WooCommerce" (about €99/year alone or €139/year in the Business Pack, per search results; check
   polylang.pro before buying). It can be added later without redoing anything.

9. **Images: Smush (free) + WordPress's own WebP** (owner, 11 Nov 2026). Smush's WebP is paid (Pro); ShortPixel
   needs an account. WordPress saves new uploads as WebP itself (quality 80, ~40% smaller than JPEG).
10. **Cache: WP Super Cache** until a host is chosen (owner, 11 Nov 2026). If the host runs LiteSpeed, switch to
    LiteSpeed Cache (deactivate WP Super Cache first; never run two page caches).

### Still to decide later
- Hosting company (decides the cache plugin, real SMTP email and the backup storage).

### What Phase 2 built (plain language)
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

### What Phase 3 built (plain language)
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
  releases held money and the admin payout screen were added in Phase 7.) If a paid booking is declined or
  cancelled by the business, the guest is refunded in full automatically (Phase 6).
- **Delete sample data:** `wp ek delete-sample --yes` removes every business whose name starts with
  "SAMPLE", plus their rooms, bookings, calendar, money records, photos and owner accounts (and, since
  Phase 10, attractions and events named "SAMPLE …").

### What Phase 4 built (plain language)
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

### What Phase 5 built (plain language)
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
  event date** (see Phase 7). The balance is paid to the venue directly.
- **Find an event centre** (`/event-centres/`): date, guests, seated/standing, LGA, Near me, max price,
  amenities; sort by distance, rank, rating or price; list or map.
- **Venue page:** amenities, every hall with capacity, price for the chosen date, deposit, availability,
  "Request to book" / "Book now", cancellation policy and venue rules.

### What Phase 6 built (plain language)
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

### What Phase 7 built (plain language)
- **Commission rates you control:** wp-admin → Explore Katsina → **Settings** → Money. One rate per type
  (PLACEHOLDERS: hotels 10%, event centre deposits 10%, tour operators 15%, table reservations 0%, food
  orders 10%). On any business's admin page you can give it its own rate ("Commission & money" box);
  every change is logged. Each booking keeps the rate it was made at.
- **Money flow:** online payments come to Explore Katsina first. Each payment is split into the
  business's share and our commission. The share is **on hold**, then released automatically:
  - hotels: 3 days after check-out;
  - event centres: 3 days after the event date;
  - restaurants: 3 days after the reservation/order is completed.
  An hourly job does the releasing and emails the business when money becomes available.
- **"If there's no complaint":** on the booking page, a guest can **Report a problem** during the stay
  and up to 3 days after it. The business's money for that booking is then **frozen**, and you decide in
  **wp-admin → Explore Katsina → Complaints**: release it to the business, or refund the guest part or all of
  what they paid online (the business keeps the rest, minus commission on the rest). Guest, business and
  you are emailed at each step.
- **Payouts:** a business requests a payout (minimum ₦5,000) from its available money. In
  **wp-admin → Payouts** you see the request and the bank account saved with it (the full account number
  is shown only when you click, and each view is logged), **Approve**, send the transfer from your bank,
  then **Mark paid** with the transfer reference, or **Reject** with a reason. The business is emailed each time.
- **Monthly invoices for "Pay at hotel" bookings:** on the 1st of each month, every completed booking
  whose commission we didn't collect online (pay-at-hotel stays, cash food orders, or a deposit smaller than
  the commission) goes onto that business's invoice (INV-YYYYMM-business). No-shows aren't charged.
  The business sees it under **Invoices** with the bookings it covers, and pays **online (Paystack)** or
  **from its earnings balance**; if it pays you by transfer, mark it paid in **wp-admin → Invoices** (or write
  it off). Reminder 7 days before the due date; **unpaid 30 days after issue → listing paused automatically**,
  and switched back on automatically when paid. (Listings you paused yourself are never switched on by this.)
- **Reports** (wp-admin → Reports, any date range): bookings by type, money paid online, commission earned
  (online + invoices), refunds, payouts, money on hold now, what you owe each business, unpaid invoices,
  **hotel no-show rates** (flagged ⚠ at 25%+ with 5+ finished bookings, or more than twice the average:
  a high no-show rate on pay-at-hotel bookings can hide commission). Download bookings as CSV.
- **Command line:** `wp ek money-tick` runs the hourly job now; `wp ek invoices 2026-10` creates a month's invoices.

### What Phase 8 built (plain language)
- **Katsina Map** (`/map/`, in the menu): a full-screen map of every approved hotel, restaurant and event
  centre, plus attractions. Leaflet + OpenStreetMap (free); one setting (`EK\Assets::map_config()`) switches
  to Google Maps later.
  - Opens on the whole of Katsina State. Colour-coded pins with an icon per type and a legend.
  - Pins group into numbered clusters when zoomed out. **Only the pins in view are downloaded** (fast on 3G/4G).
  - Switch each type on/off. More filters: LGA, minimum rating, price (₦ to ₦₦₦₦), open now, "must have"
    (WiFi, parking, 24-hour power, AC, pool, halal, prayer room, wheelchair access, security).
  - **Use my location** (asks permission) with 1 / 5 / 10 / 25 km circles. Distances are worked out for
    that request only. **Locations are never stored or cached.**
  - Tapping a pin opens a card: photo, name, type, stars and review count, rank ("#3 of 42 hotels in
    Katsina"), price (from ₦X/night, price range, cheapest hall, or entry fee), distance, open now, and
    View / Book or Reserve / Directions (Apple Maps on iPhone, Google Maps otherwise) / WhatsApp.
  - A list beside the map (a bottom sheet you pull up on phones) stays in sync, sortable by distance,
    rank, rating or price.
  - `/map/?focus=123` opens the map on one place (used by "Show on Katsina Map" buttons).
- **Small maps** on business and attraction pages now show nearby places as dots, and the "Nearby" list
  includes attractions.
- **Attractions** (wp-admin → Attractions): name, description, photo, LGA, category, map pin (drag it),
  entry fee, opening hours, how to get there, and a **"details not yet verified"** tick that shows a notice
  to visitors. No real attractions were added: researched content comes in Phase 10.
- **Honest rankings**, recalculated every night at about 02:15 (and with "Recalculate rankings now"):
  - Score out of 100 = **70% rating** (Bayesian average: every place starts with 10 "pretend" reviews at its
    type's average; a review counts half after 12 months) + **15% completed bookings** (sliding scale, 50 a
    year = full marks) + **15% response** (bookings answered within 48 hours, reviews replied to).
  - Compared only within the same type, statewide and per LGA. **3 verified reviews needed** for a number.
  - Badges: **Top Rated** (top 10% of its type), **Rising** (+5 points in 90 days), **Verified**.
  - **Paid plans never change the score or rank.** Featured places get a gold-ringed pin and a "Featured"
    label only (plans themselves arrive in Phase 9).
  - All the numbers are in wp-admin → Settings → Rankings, explained in plain language there.
  - Shown on business pages (statewide + LGA rank and badges), search results, map cards, and in a new
    score breakdown in each business's dashboard (Ranking section).
- **Top 10 pages:** `/top-hotels/`, `/top-restaurants/`, `/top-event-centres/`, and per LGA, e.g.
  `/top-hotels/daura/`. They're linked from business pages and the map, and kept out of the main menu.
- **Hiding fake or abusive reviews:** wp-admin → **Reviews**. Pick a reason and hide; it stops counting for
  ratings and rankings. The **moderation log** on the same page keeps the reason and a copy of what was
  hidden. "Show again" undoes it.
- **Command line:** `wp ek rank` (recalculate now), `wp ek map-index` (rebuild every pin).

### What Phase 9 built (plain language)
Owner decisions (9 Nov 2026): use **placeholder prices** (all in wp-admin → Settings → "Prices for paid
features", marked PLACEHOLDER); **only events you add sell tickets** (organisers can pay to promote events).

Everything Explore Katsina sells directly goes through one "sales" record book, paid the same way as bookings
(Paystack/Flutterwave through WooCommerce on the live site; a "test payment" screen locally). Each sale has a
code (EKS-XXXXXX), a receipt page, receipt emails to the buyer and a notice to you.
1. **Featured / Premium plans** (business dashboard → "Plan & Verified"): Featured ₦10,000/month or
   ₦100,000/year; Premium ₦25,000/month or ₦250,000/year. Featured: top of search results (max 3 places,
   marked "Featured"), gold-ringed map pin, 20 photos. Premium: also the homepage spot (`[ek_premium_spotlight]`)
   and 40 photos. Rank numbers never change. Renewing early adds time; switching plan starts the new one today.
   Reminders 7 days and 1 day before the end; plans end automatically.
2. **Verified badge**: the business pays ₦5,000 once; it waits in **wp-admin → Sales & services**, where you approve
   (badge given) or reject with a reason (optionally refunding).
3. **Listing setup service** (`/listing-setup/`): ₦15,000 from their information, or ₦30,000 with a photo visit.
   Orders appear in Sales & services (New → In progress → Done; the customer is emailed when done).
4. **Banner ads** (wp-admin → Banner ads, built in, no paid plugin): zones Homepage, Search results, Katsina Map,
   Sidebar, Inside articles; dates; image + link; daily views and clicks. Always labelled "Advertisement"; links
   marked sponsored. Record what the advertiser paid so it shows in Revenue. Banner prices are "on request".
5. **Sponsored articles**: tick "Sponsored" (and the sponsor's name) on a post: clear label at the top, links
   marked rel="sponsored".
6. **Event promotion** (`/promote-event/`): ₦15,000 for 7 days or ₦40,000 for 30 days. You approve each one in
   Sales & services (a new event is created from the organiser's details); then it shows "Promoted" at the top of
   `/events/` and on the homepage block (`[ek_promoted_events]`). Reject = automatic refund.
7. **Google AdSense**: OFF. Settings → Advertising: tick on, add your publisher ID (ca-pub-…) and slot numbers;
   it then fills zones that have no booked banner.
8. **Own tours** (wp-admin → Tours, page `/tours/`): price per person, group size, pickup point, duration, what's
   included, and dates with seats. Seats are held 15 minutes while paying (never overbooked). Guests can cancel
   online for a full refund until 48 hours before (a setting). No tour descriptions were invented.
9. **Event tickets** (wp-admin → Events → ticket types, e.g. Regular / VIP, price, quantity, sales end): tickets held
   15 minutes while paying, max 10 per order, free tickets issued at once. Each ticket has its own secret code shown
   as a **QR code** on the receipt (print or show on phone). **Check-in page** `/check-in/` for staff (role "Ticket
   check-in staff", or admins): scan with the phone camera or type the code: "Welcome!", "Already used", "another
   event" or "not valid", with a running count.
10. **Shop** (WooCommerce): categories Leatherwork, Fabrics & textiles, Crafts, Guides & maps; delivery fees by state
    (PLACEHOLDERS: Katsina ₦1,500; Kano/Jigawa/Kaduna/Zamfara ₦3,000; rest of Nigeria ₦5,000; change them in
    WooCommerce → Settings → Shipping). Settings → "External store link": if filled, every product's button
    becomes "Buy on our store" linking there. No products were added (Phase 13 adds SAMPLE ones).
11. **Digital guides**: make a WooCommerce product "Virtual" + "Downloadable" and attach the PDF: buyers get an
    instant private download (also under My Account → My Orders → My downloads).
12. **Partner referral links** (wp-admin → Partners): name, type, their link with your referral code. Use
    `/go/short-name/` or `[ek_partner slug="…" label="…"]`. Clicks are counted by month (CSV for claiming commission);
    record commission received so it shows in Revenue. Robots aren't counted.
13. **Advertise with us** (`/advertise/`): packages and prices, media kit download (upload the PDF in Settings),
    enquiry form → wp-admin → Enquiries (+ email to you).
- **Revenue dashboard** (wp-admin → Revenue): your own income per month for 12 months, from every source (booking
  commission, invoices, plans, Verified, setup, promotions, tours, tickets, shop, guides, ads, partners), net of
  refunds. Businesses' share of bookings is not counted as income.
- New pages (kept out of the main menu except Events and Tours): Events, Tours, Promote your event, Listing setup
  service, Advertise with us, Ticket check-in.
- Free libraries added: qrcode-generator 1.4.4 (MIT) for ticket QR codes, jsQR 1.4.0 (Apache 2.0) for the camera
  scanner (only loaded on /check-in/).

### What Phase 14 built (plain language)
**Search engines (SEO)**
- Every hotel, restaurant, event centre, attraction, festival, tour and shop product now carries
  **structured data** (schema.org): the "hidden labels" Google, Bing and AI assistants read to show stars,
  prices, opening hours and menus in results. Hotels: rooms with Naira prices, check-in/out, amenities, and the
  star rating **only if our team verified it**. Restaurants: the **full menu** with prices, cuisines,
  reservations. Event centres: halls, capacity, prices. Other businesses get the closest type (Store, Travel
  agency, Bank…). Ratings come only from verified-booking reviews. Festivals with an unconfirmed date get no
  markup (search engines need a real date). Only facts already visible on the page are used.
- Every main page has a written **search description**; the homepage has its own search title.
- **Share previews** (WhatsApp, Facebook, X): every page has a picture, title and description. Pages without
  their own photo use the credited Commons photo of the Emir's Palace gate.
- **XML sitemap** at `/sitemap_index.xml` (businesses, attractions, events, tours, pages, stories, products);
  booking, account, dashboard and check-in pages and untranslated Hausa pages are left out. `robots.txt`
  points to it. Addresses are clean (`/hotels/name/`, `/attractions/name/`, `/events/name/`).

**Speed (target: Lighthouse 90+ on a phone, reached on all 20 main pages: see `docs/lighthouse/summary.md`)**
- Small **".min" copies** of our CSS and JavaScript (`npm run build` after editing; if forgotten, the site
  safely serves the normal files and the tests say so).
- **Pictures**: below-the-fold photos load as you scroll; the main photo loads first; phones download smaller
  copies (never the full-size original).
- **Map library** (Leaflet) loads only when a map is scrolled into view.
- **Fonts**: the Naira sign ₦ and Hausa letters come from tiny 3 KB files instead of 165 KB ones.
- WooCommerce's shop scripts (and jQuery) load only on shop pages; its visitor-tracking cookies are off.
- WordPress's unused emoji script and embed links removed.
- **Browser caching** for a year on pictures, fonts, CSS and JS (their addresses change when the file changes),
  **compression** of text files, plus the page cache from Phase 12.

**Security**
- WordPress version hidden (no "generator" tag, no version on WordPress's own files; readme.html blocked).
- **XML-RPC off** completely (an old door attackers use to guess passwords), pingbacks off.
- **Login protection**: 4 tries then a 20-minute lockout (Phase 12); one message for any failed login and for
  "forgot password", so nobody can find out which emails have accounts; usernames are never published (no
  author pages, no public user list); **password rules**: at least 8 characters for everyone, 12 for staff,
  no well-known passwords (e.g. "password123", "Katsina2026") or ones made from your own name/email;
  application passwords never for business owners.
- **Security headers** on every page (also cached ones); file editor in wp-admin off; no PHP can run from the
  uploads folder; no folder listings.
- **"Businesses can only access their own data", tested carefully**: the code check of every form and page,
  plus a break-in test through the real website: logged in as three SAMPLE businesses (hotel, restaurant, event
  centre), it makes 114 attempts on three other businesses (opening 60 of their dashboard pages; sending
  their forms; slipping their room, hall, dish, category, booking, review, invoice, photo and price-rule numbers
  into its own forms). **All refused, and a fingerprint of everything the other businesses own is unchanged.**
  Also tested: guests see only their own bookings; booking pages need their secret link; ID documents and the
  private folder are closed; owners can't reach wp-admin or the user list.

### What Phase 13 built (plain language)
**Every page in the brief now exists**, in English, each with a Hausa version marked "Needs Hausa translation":
- Home (now the site's front page), Explore, Katsina Map, Hotels, Restaurants, Event Centres, Things to Do and
  Tours.
- Festivals & Events (renamed from "Events"), the three Top 10 pages, Shop, and **Guides** (digital guides
  from the shop).
- **Directory**: every listed business by category, with filters for category, LGA and name.
- Plan Your Trip with Itineraries and Safety, Stories, List Your Business, and **Pricing** (Basic free, the
  plans, commission rates, Verified, setup and promotion, all read from Settings and marked PLACEHOLDER).
- Advertise, My Account, Business Dashboard and Contact.
- **About**, **FAQ for travellers** and **FAQ for businesses**.
- The legal pages, each with a red **"DRAFT – for legal review"** notice:
  - **Booking & Cancellation Policy**
  - **Refund Policy**
  - **Review Guidelines**
  - **Privacy Policy** (Nigeria Data Protection Act 2023: lawful bases, your rights, NDPC complaints,
    retention, cross-border transfers; it replaces WordPress's own sample privacy page)
  - **Terms of Use**
  - the Listing & Partner Agreement
- The policies describe **exactly the rules the site applies**: 15-minute holds, the four cancellation
  policies, restaurant deposits 24 h, tours 48 h, tickets only refunded if the event is cancelled, problem
  reports up to 3 days after, the 180-day review window, and paid plans never changing ranks. A test checks
  that they still match.
- Items only you or your lawyer can fill in are in [square brackets]: company name and RC number, address,
  retention periods, liability, jurisdiction, and shop returns.
- The footer now links to About, both FAQs, Pricing and all policies.

**SAMPLE data** (`wp ek sample-data`, run by `setup.sh`). Delete all of it with `wp ek delete-sample --yes`.
- All names start with "SAMPLE". The businesses are invented, use the placeholder phone number, and have generic,
  credited Commons photos.
- Map pins are within 1.5 km of real town centres in **7 LGAs**: Katsina, Daura, Funtua, Malumfashi, Dutsin-Ma,
  Mani and Jibia.

| What | How many |
|---|---|
| Hotels | 8, each with 3–4 room types (₦9,000–₦95,000 a night; weekend prices; 4 cancellation policies) |
| Restaurants | 8 with full menus (60 dishes: tuwo, suya, masa, jollof, fura da nono…), one with group deposits |
| Event centres | 5 with 8 halls (₦60,000–₦1,000,000; request-to-book and instant) |
| Other categories | 3 each: tour operators, transport, crafts, shopping, health, banks |
| Verified reviews | 79, each tied to a completed past booking; rankings computed (Palmview Lodge has 2 reviews, so it shows "new, not yet ranked") |
| Bookings | over 100. Hotels: awaiting payment, new, confirmed, pay at hotel, checked in, checked out, cancelled by guest (refund by policy) and by hotel, declined, no-show, expired, payment issue. Restaurants: awaiting deposit, new, confirmed, seated, completed, cancelled, declined, no-show, expired. Event centres: requested, accepted (deposit due), deposit paid, completed, cancelled, declined, awaiting payment, expired |
| Tours | 2 (Old City Walking Tour, Daura Day Trip) with 4 dates each and seats sold |
| Ticketed event | 1 (Food & Culture Night, Regular/VIP) with tickets sold |
| Shop | 5 products + 1 digital guide (a real PDF, downloadable after payment) |
| Paid extras | 1 Featured hotel, 1 Premium restaurant, 1 Verified hotel (to show the labels) |

- Future bookings were made through the real booking engine, so their payments, refunds and money records are
  real.
- Past and same-day bookings (history and reviews) are records only, with no money attached.
- To log in as a sample owner, reset its password, e.g.
  `wp user update sample_crimson-gate-hotel --user_pass=…`.

### What Phase 12 built (plain language)
All free versions, one plugin per job (no duplicates), set up by `wp ek plugins-setup` (run by `setup.sh`;
each plugin is set up once, and changes you make later in wp-admin are kept). Every phase's tests still pass
with all of them switched on.

| Plugin (free) | What it does here | Still for you to do |
|---|---|---|
| **Rank Math SEO** | Page titles, sitemap (`/sitemap_index.xml`: businesses, attractions, events, tours, stories, pages), redirects, 404 log. Booking/account/dashboard/check-in/cart/checkout and untranslated Hausa pages are hidden from search engines and the sitemap. Modules needing outside accounts (Analytics, Content AI…) are off. No generic "Article" markup on listings: our own Hotel/Restaurant/Event markup (Phase 14) is used instead. | Optional: connect a free Rank Math account and Google Search Console after launch. |
| **Wordfence** | Firewall and malware scans; alerts to the admin email. Hides usernames. Its own login lockouts are **off** so they don't double up with… | Optional: switch on two-factor login for admins (Wordfence → Login Security). |
| **Limit Login Attempts Reloaded** | 4 wrong passwords → 20-minute lockout, on wp-login and our "My Account" login. (On the local test site only, your own machine is never locked out, so the tests can run.) | — |
| **UpdraftPlus** | Database backup every day (14 kept), files every week (4 kept). Tested: a backup was made, and the backup folder can't be downloaded from the web. | **Connect remote storage** (Google Drive or Dropbox: free) in Settings → UpdraftPlus. Keep a copy of `EK_ENCRYPTION_KEY` somewhere safe and separate: without it, a restored site can't read bank details. On an Nginx host, ask the host to block `/wp-content/updraft/`. |
| **WP Super Cache** | Visitors who aren't logged in get a ready-made copy of each page (kept 1 hour). **Never cached:** booking, account, dashboard, check-in, cart, checkout, sign-up, any page with one of our forms, pages showing a booked banner (so ad views are counted), shoppers with items in their cart, and anyone logged in. Lists, maps and Top 10 refresh at once when a listing, review or ranking changes. | If your host runs LiteSpeed, switch to LiteSpeed Cache. |
| **Smush** + WordPress WebP | Photos compressed on upload, camera/location data removed, max 2560 px; sizes saved as **WebP** (quality 80: about 40% smaller than JPEG). All existing photos converted (`wp ek webp`). | — |
| **Join.chat** | Green WhatsApp button, placed above the phone bottom bar; hidden on the map, dashboards, check-in, booking and checkout pages. No pop-up, no tracking. | **Set your real WhatsApp number** (Join.chat settings). It is the PLACEHOLDER +234 800 000 0000 now. |
| **Fluent Forms** | New **Contact us** page (`/contact/`, plus a Hausa copy): name, email, phone, topic (booking help, listing, advertising, report a problem…), message, consent (Nigeria Data Protection Act 2023). Messages saved in wp-admin → Fluent Forms → Entries and emailed to you. Advertising enquiries stay in our own form. | — |
| **MailPoet** | Newsletter list "Explore Katsina news", **double opt-in** (nobody is added without clicking the email link), sign-up box in the footer of every page. | Sender address is the PLACEHOLDER info@explorekatsina.com.ng. When ready, choose a sending method (MailPoet's own sending service has a free starter plan, so check its current limits; or your host's email). |
| **FluentSMTP** | Will send all site email (bookings, receipts, newsletters' confirmations) through a proper mail service so it doesn't land in spam. Email log kept 14 days. | **Add a mail service** at launch (your host's mailbox, or a mail service with a free plan, such as Brevo; check its current daily limit). Until then email goes the normal WordPress way. |

Fixes found while testing:
- The contact form jumped when error messages disappeared, so a tap could miss the tick box. Error messages now
  sit in reserved space.
- Caching must skip only logged-in people, not everyone with a cookie (Polylang and WooCommerce set cookies for
  all visitors).
- Rank Math's redirect tables are created during set-up (they were missing and showed database errors).
- The "Save" button no longer carries a security code for guests, so attraction pages can be cached.
- The Top 10 pages per LGA ("Top 10 hotels in Daura") keep their own page title now that Rank Math manages titles.

### What Phase 11 built (plain language)
1. **Theme:** Kadence (free) + our child theme **"Explore Katsina"** (`themes/explore-katsina/`).
   - The brand is set as Kadence's *defaults*, so nothing is locked: you can still change colours,
     fonts, header and footer in Appearance → Customize.
   - Durbar Regalia colours. Unbounded headings and Overpass text, served from our own server.
   - Visual identity:
     - Night-indigo header and footer with a brass line.
     - An arch emblem and arch-framed photos, after the city gates (kofa).
     - Our own geometric line pattern, inspired by Hausa wall decoration.
     - Crimson and brass borders, like Durbar regalia.
   - No generic blue.
2. **Homepage** (`front-page.php`, sections in `inc/home.php`):
   - Hero with a **tabbed search**: Hotels (where, dates, guests), Restaurants (where, food), Event
     centres (where, date, guests), Things to do (type). It works with arrow keys too.
   - **Near you:** uses the phone's location, shows the 6 closest places within 15 km, and never stores
     the location.
   - **Map preview:** the map library only downloads when you scroll to it, to save data.
   - Featured attractions (with photos), upcoming festivals (the Sallah Durbar), top-ranked hotels,
     restaurants and event centres, Premium spotlight, homepage banner ad zone, our tours, stories, and
     the **"List your business"** and **"Advertise with us"** banners.
   - Empty sections either hide or say "coming soon".
3. **Mobile bottom bar** (phones and tablets): Home, Explore, Map, Bookings, Account. It is hidden on
   the full-screen map, the business dashboard and ticket check-in, which have their own controls.
   The new **Explore** page (`/explore/`) has tiles for everything.
4. **Menus** (made automatically, safe to re-run, never overwritten):
   - Main menu: Hotels, Restaurants, Event centres, Things to do, Events, Map, and Plan your trip with
     its 6 sub-pages.
   - Footer: tours, stories, Top 10, list your business, advertise, agreement, plus the placeholder
     contact details.
5. **English / Hausa (Polylang, free):**
   - English keeps normal addresses; Hausa pages start with `/ha/`. "English | Hausa" switcher in the
     header and in the phone menu.
   - **21 Hausa pages** were created, one for each main page plus the Plan your trip pages. Each:
     - holds the **English text** (no machine translation);
     - is marked **"Needs Hausa translation"** in the Pages list (a tick box on each page);
     - shows visitors a short "not translated yet" note;
     - is hidden from search engines until the box is unticked.
   - Listings, attractions, events and tours appear in both languages (not duplicated), so the map,
     rankings and bookings stay single and accurate.
   - Links between our pages follow the visitor's language.
   - Shop and checkout: English only (your decision).
6. **Branded dashboards:**
   - wp-admin has a **"Durbar Regalia" colour scheme**, used by default. Anyone can pick another in their
     profile.
   - The **login page** is branded.
   - My Account and the business dashboard use the brand.
   - Business pages now use the theme layout properly.
7. **Accessibility:**
   - Visible brass keyboard focus ring.
   - Every brand colour pair checked for contrast (WCAG AA; all 4.5:1 or better).
   - Animations switch off for people who prefer reduced motion.
   - "Skip to content" link. Tabs follow the standard keyboard pattern.
8. **Speed:** fonts preloaded, hero photo loaded first, everything else lazy-loaded. No Google Fonts and
   no extra plugins.
- New commands: `wp ek languages` (set up English/Hausa; safe to re-run).
- `wp eval 'ekt_setup_content();'` sets up the menus and footer text. `setup.sh` runs both.
- The test runner now carries on after a failure and lists every failing step at the end.

**For you to do later:**
- Ask a fluent Hausa writer to translate the Hausa pages, then untick "Needs Hausa translation" on each.
- Plugin and theme words (buttons, labels) can be translated in a `.po` file. Phase 13 or later can set
  that up with Loco Translate (free).
- Replace the placeholder contact details in Appearance → Widgets (footer) when ready.

### What Phase 10 built (plain language)
**Research first.** Every fact on the guide pages comes from a published source, listed under "Sources" on the
page itself. The full notes, with confidence levels and every place where sources disagree, are in
`docs/research/phase10-sources.md`. Nothing was invented:
- **Opening hours and fees were not confirmed for any place**, so pages say "Not yet confirmed. Please check
  locally before you go".
- Every attraction has **"Facts not yet verified on the ground"** ticked, which shows visitors a notice. Untick
  it only after someone has checked the place locally.
- Where sources disagree (Gobarau's date, the palace's founding date, which gate is "original", Zobe Dam's
  size, Ajiwa Dam's LGA), the page says so instead of picking one.
- Legends (Bayajidda and Kusugu Well; Gobarau as a watchtower) are written as "according to the legend" or
  "tradition says".

1. **Attractions** (wp-admin → Attractions, simple one-page editor):
   - Fields: name, LGA, category, description, history, opening hours, entry fee, best time to visit, how to get
     there, map pin (+ a note such as "approximate location"), photo gallery and sources.
   - Categories: Historic site, Religious site, Nature & dams, Markets, Museums, Palaces, Crafts.
   - Each page automatically lists the **3 nearest hotels, restaurants and event centres with distances**, and
     other attractions nearby, from the Katsina Map.
2. **10 researched attractions**:
   - The 8 you asked for: Gobarau Minaret, Emir of Katsina's Palace, the ancient city walls and gates, Kusugu
     Well (Daura), Emir of Daura's Palace, Zobe Dam, Ajiwa Dam, Katsina Central Market.
   - **2 suggested extras I could verify:** Durbi Takusheyi (burial mounds of early Katsina rulers, a national
     monument since 1959) and the National Museum, Katsina (its exact location is unconfirmed, so it has no map
     pin yet).
3. **Things to do** page (`/things-to-do/`): photo cards with a category filter.
4. **Festivals & events:**
   - Events now have a type (Festival, Culture & heritage, Religious, Music & entertainment, Sports, Business &
     conferences, Community), a photo gallery and sources.
   - **Sallah Durbar, Katsina** added with **"Date to be confirmed"**. Eid dates follow the moon sighting; set the
     date in wp-admin → Events once it is announced.
   - The page mentions that durbars were suspended in some years (e.g. 2021).
   - It makes no UNESCO claim: the 2024 UNESCO listing is for the Durbar in **Kano** only.
5. **Plan your trip** (`/plan-your-trip/`) with 6 pages: Getting there (Katsina airport, code DKA, and by road),
   Getting around, Etiquette and dress, Best time to visit, Itineraries (1 day and 3 days) and Safety and travel tips.
6. **Safety and travel tips:**
   - Sends visitors to the **official travel advice** of the UK, US, Canada and Australia, and to Katsina State
     Government announcements.
   - It **does not say which areas are safe**, and gives no emergency numbers (it says "ask your hotel").
7. **Stories (the blog)** (wp-admin → Stories, page `/stories/`):
   - Categories: History, Culture, Food, Crafts, Travel guides. Each story can list its sources.
   - **3 draft stories** are waiting for your review (not public): a short history of Katsina, the Sallah Durbar
     explained, and crafts (weaving and dyeing). No food story yet: I found no sources good enough to write one.
8. **Photos of the real places** from Wikimedia Commons (licence-checked, credited under each gallery):
   - Gobarau Minaret, the Katsina palace gate, Kofar Sauri and Kofar Kwaya, Kusugu Well and Kofar Bayajidda,
     the Daura palace, Ajiwa Dam, the National Museum entrance and the Durbar (including a 1959 public-domain
     photo). Each one was checked by eye.
   - Left out: a date-stamped Gobarau close-up, and two Daura crafts photos where a person is the main subject.
   - There are no free photos yet of Zobe Dam, Durbi Takusheyi or the Central Market.
   - If a photo is missing (Wikimedia sometimes refuses downloads for a while), run `scripts/fetch_commons.py
     sample-data/media/guide-manifest.json sample-data/media` again, then `wp ek import-guide`.
- **One command imports it all:** `wp ek import-guide` (run by `setup.sh`). It is safe to re-run: it only adds
  what is missing and never overwrites your wp-admin edits (`--update` replaces them, after asking). The text lives
  in `plugins/explore-katsina-core/content/guide/` so it also ships with the plugin to the live site.
- `wp ek delete-sample --yes` now also deletes test attractions and events named "SAMPLE …".
- Fixed: the small map on attraction pages was invisible (no height) since Phase 8.

**Please check before launch (flags):**
- Opening hours, fees and access for every attraction, especially palaces (working royal residences) and the
  dams (water infrastructure, access may be restricted).
- The National Museum's location, hours and exhibitions.
- Approximate pins: Kusugu Well and the Daura palace.
- The Ajiwa Dam LGA.
- The current Emir of Daura (Wikipedia says Umar Faruk Umar since 2007).
- Airline routes from Katsina airport.
- Etiquette page: general advice, worth a read by someone local.
- Hausa versions of the guide pages: these need a fluent Hausa writer. I did not machine-translate them.

### Photos (royalty-free, with credits)
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

### Payments: now installed
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

### Security in place (tested)
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
- Phase 14 lock-down and the business-isolation break-in test: see "What Phase 14 built".
- **Owner to switch on:** two-step login for administrators (Wordfence → Login Security → scan the QR code
  with an authenticator app on your phone). Free; it needs your phone, so it is not switched on for you.

### How to run it
Your own computer: with **XAMPP + VS Code** (simplest, no Docker): **`docs/RUN-WITH-XAMPP.md`**; with Docker + VS Code (runs the automatic tests too): **`docs/RUN-LOCALLY.md`**.
```bash
./setup.sh          # sets up / updates everything (safe to re-run)
./tests/run.sh      # about 1,350 automatic checks, server and browser (Phases 2–15)
./tests/run.sh --lighthouse   # the same plus the mobile speed test (about 5 more minutes)
npm run build       # after editing any CSS/JS file: makes the small .min copies visitors download
docker compose -f docker-compose.offline.yml run --rm -T cli wp ek delete-sample --yes   # tidy up test data
```
- Site: http://localhost:8888 · Admin: http://localhost:8888/wp-admin (user `admin`, password in `.env`)
- Test inbox (offline mode): http://localhost:8025, where every email the site sends lands.

### Where things are
| Path | What it is |
|---|---|
| `docs/ARCHITECTURE.md` | The approved plan |
| `docs/brand-options.html` | The two brand options (B chosen) |
| `docs/screenshots/phase2/` | Screenshots of the sign-up, dashboard, admin and public page |
| `docs/screenshots/phase3/` | Screenshots of hotel search, hotel page, booking, confirmation, calendar, rooms |
| `docs/screenshots/phase4/` | Screenshots of restaurant search, restaurant page, reservation, menu builder, table settings |
| `docs/screenshots/phase5/` | Screenshots of event centre search, venue page, request form, halls, confirmation |
| `docs/screenshots/phase9/` | Screenshots of the plan page, search with Featured + banner ad, tickets with QR codes, check-in, tour, events, advertise, admin sales and revenue |
| `docs/screenshots/phase14/` | Screenshots of the login message, the weak-password message, structured data and the speed report |
| `docs/phase15-checks.md` | Phase 15 sweep report: every page, dashboard, email, link and the language switcher |
| `docs/screenshots/phase15/` | Screenshots from the 14 journeys (calendar, payout, sold-out, paused listing, review, earnings, refund, Featured, newcomer, 200-pin map, ads, ticket email and camera check-in, guide download) |
| `docs/lighthouse/summary.md` | Mobile Lighthouse scores for the 20 main pages (`node tests/lighthouse.js`) |
| `scripts/minify.js`, `scripts/font-subset.py` | Make the .min CSS/JS (`npm run build`) and the tiny ₦/Hausa font files |
| `docs/screenshots/phase13/` | Screenshots of the homepage with sample data, a sample hotel, Directory, Pricing, Privacy draft, a sample owner's dashboard |
| `docs/screenshots/phase12/` | Screenshots of the contact form, newsletter sign-up, WhatsApp button on a phone, Fluent Forms in wp-admin |
| `docs/screenshots/phase11/` | Screenshots of the homepage (computer and phone), Explore, My Account, Hausa page, login and wp-admin |
| `themes/explore-katsina/` | Child theme of Kadence: brand defaults (`inc/defaults.php`), homepage (`front-page.php`, `inc/home.php`), styles, bottom bar, language switcher |
| `docs/research/phase10-sources.md` | Phase 10 research: every fact, its source, confidence, and conflicts between sources |
| `docs/screenshots/phase10/` | Screenshots of Things to do, attraction pages (computer and phone), Sallah Durbar, Plan your trip, safety page, the attraction editor |
| `docs/screenshots/phase8/` | Screenshots of the Katsina Map (computer and phone), map cards, Top 10 page, rank on a hotel page, attraction page, review moderation |
| `docs/screenshots/phase7/` | Screenshots of commission settings, complaints, payouts, invoices, reports, hotel earnings and invoice |
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
| `  content/pages/` | About, FAQs and the legal drafts (Phase 13) |
| `  content/sample/data.php` | The SAMPLE data (names, prices, menus, halls, reviews) |
| `  content/guide/` | Researched guide content: attractions, festivals, Plan your trip pages, draft stories (`wp ek import-guide`) |
| `  assets/vendor/qrcode/`, `jsqr/` | QR code drawing (MIT) and camera scanning (Apache 2.0) for tickets |
| `  assets/vendor/markercluster/` | Leaflet.markercluster 1.5.3 (MIT licence, free) for pin clusters |
| `mu-plugins/ek-local-mail.php` | Local-only: sends emails to the test inbox. **Never upload to the live site.** |
| `tests/` | Automated checks: `phase2-security.php`, `phase3-hotels.php`, `phase4-restaurants.php`, `phase5-venues.php`, `phase6-accounts.php`, `phase7-money.php`, `phase8-rank-map.php`, `phase9-revenue.php`, `phase10-guide.php`, `phase11-theme.php`, `phase12-plugins.php`, `phase13-pages-sample.php`, `phase14-seo-security.php`, `phase4-woo-bridge.php`, `e2e/phase2–14.js`, `e2e/phase14-isolation.js` (business break-in test), `e2e/phase15-journeys.js` (the 14 journeys), `e2e/phase15-sweep.js` (pages, dashboards, emails, links, languages), `lighthouse.js` |

### Environment notes (for the next session)
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
- **GitHub push works**: `git push -u origin claude/explore-katsina-architecture-wj2xli`.
- The local Apache needs its "headers" module for the security headers on cached pages; `setup.sh` switches it
  on (`a2enmod headers`). Most hosts have it on already.
- In the cloud test browser, OpenStreetMap tiles don't load (network), so maps look grey in
  screenshots; pins, dragging and "Use my location" work. In a normal browser the map shows.
- **Live host needs a real cron job** (every 5 minutes) so unpaid holds are freed, held money is released and
  monthly invoices go out on time even when the site is quiet: `*/5 * * * * wget -q -O - https://explorekatsina.com.ng/wp-cron.php?doing_wp_cron >/dev/null 2>&1`
  and add `define( 'DISABLE_WP_CRON', true );` to wp-config.php. Phase 15 covers this.
- WordPress gotcha: never name a form field `name` (it's a reserved WordPress word and turns the page
  into "Page not found"). The business name field is `business_name`.
