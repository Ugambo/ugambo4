# Explore Katsina — Architecture Plan (Phase 1)

Status: **Approved by the owner on 5 November 2026** (all five recommendations accepted).
Brand chosen: **Option B, Durbar Regalia** (see `docs/brand-options.html`).
Date: 4 November 2026

This plan is written for a non-developer. Technical names appear in `code font`
so a developer can follow along; you can skip them.

---

## 1. The big picture

Explore Katsina is one WordPress website with five parts that share the same
data. A hotel added once should appear in search, on the map, in the rankings,
on the Top 10 pages and in its owner's dashboard, without anyone typing it twice.

```
                 ┌──────────────────────────────────────────────┐
  Visitors  ───► │  Kadence child theme "explore-katsina"        │  look & feel, homepage,
                 │  (English + Hausa via Polylang)               │  mobile bottom nav
                 └───────────────┬──────────────────────────────┘
                                 │
                 ┌───────────────▼──────────────────────────────┐
  Businesses ──► │  Custom plugin "explore-katsina-core"         │  all business logic:
                 │  listings · rooms · menus · halls · calendars │  bookings, dashboards,
                 │  bookings · reservations · reviews · rankings │  map, rankings, money
                 │  map · commissions · payouts · invoices       │
                 │  plans · ads · tours · tickets · analytics    │
                 └───────────────┬──────────────────────────────┘
                                 │  "please charge ₦X for booking #EK-7Q3M"
                 ┌───────────────▼──────────────────────────────┐
  Payments ────► │  WooCommerce + Paystack + Flutterwave         │  takes the money only;
                 │  (also runs the Shop and Digital Guides)      │  tells the plugin "paid"
                 └──────────────────────────────────────────────┘
```

**The main rule:** the custom plugin owns all the data and decisions. WooCommerce
only handles the checkout and the shop. That keeps the money side on tested
payment code while the booking rules stay ours.

---

## 2. Directory plugin or custom plugin? (Recommendation)

You asked me to compare **Directorist** and **GeoDirectory** for the general
business categories (Transport & Car Hire, Crafts & Souvenirs, Shopping,
Health & Emergency, Banks & ATMs, Tour Operators).

| | Directorist (free) | GeoDirectory (free) | Everything in our custom plugin |
|---|---|---|---|
| Front-end "add listing" form | Yes | Yes | Yes (same form as hotels) |
| OpenStreetMap / Leaflet | Yes | Yes | Yes (the same Katsina Map) |
| Handles many listings well | OK | Good (stores listings in its own tables) | Good (own map index table) |
| Paid plans / featured listings | Paid add-on | Paid add-on | Built in (we need it anyway) |
| Multiple areas (our 34 LGAs) | Categories/locations, basic | Location Manager is a paid add-on | Built in |
| Uses **our** honest rankings and verified reviews | No, it has its own reviews | No, it has its own reviews | Yes |
| Uses **our** sign-up, approval, ID and bank details, partner agreement | No, a second, different sign-up | No, a second, different sign-up | Yes, one flow |
| Uses **our** branded dashboard and analytics | No, a second dashboard | No, a second dashboard | Yes, one dashboard |

*(Feature lists of both plugins change over time. I'll re-check them before relying
on any specific detail. My recommendation doesn't depend on those details.)*

### My recommendation: handle **all** businesses in the custom plugin. Don't install a directory plugin.

Why, in plain language:

1. **We have to build the hard parts anyway.** Hotels, restaurants and event
   centres need the sign-up form, approval queue, map pin, dashboard, reviews,
   rankings, analytics and featured plans. A pharmacy or a car-hire company
   needs a *smaller* version of the same thing: a profile, hours, contacts and
   a pin. Adding those categories to our plugin is a small extra step. Adding a
   second plugin means a second system.
2. **One map, one ranking, one review system.** With a directory plugin, its
   listings would live in a separate place with separate reviews. Our map,
   "Near me" search and rankings couldn't treat them consistently, and you would
   moderate reviews in two places.
3. **One sign-up and one dashboard for every business owner.** Business owners
   see the same branded screens whatever their type. You approve everyone from
   one queue.
4. **Sensitive data stays in one protected place.** ID uploads and bank
   details need special protection (see section 7). A directory plugin wasn't
   designed to keep those, so we would have to bolt it on anyway.
5. **No paid add-on traps.** Both directory plugins charge for exactly the
   features we'd want: pricing plans, multiple locations and claiming
   listings.

**The trade-off:** more custom code to maintain. I'll keep the code organised in
modules, document it, and cover the important rules (double booking, money,
privacy) with automated tests.

---

## 3. Plugins we'll use

All are free unless marked. I won't install anything paid without asking you
and telling you the price.

| Plugin | What it does for us | Notes |
|---|---|---|
| **explore-katsina-core** (ours) | Everything in section 4 | Built by me, kept in git |
| **WooCommerce** | Checkout, orders, receipts, Shop, Digital Guides (downloads), delivery fees by Nigerian state | Currency: Naira (₦) |
| **Paystack WooCommerce Payment Gateway** (by Paystack) | Card / bank / USSD / transfer payments | Test mode first |
| **Flutterwave WooCommerce** (by Flutterwave) | Second payment option | Test mode first |
| **Kadence** theme (free) + our child theme **explore-katsina** | Design | Phase 11 |
| **Polylang** | English / Hausa | See "paid" note below |
| **Rank Math SEO** | SEO titles, sitemaps, Open Graph | Our plugin outputs the special Hotel / Restaurant / Event schema. Rank Math's schema is switched off on those pages so the two don't clash |
| **Wordfence** + **Limit Login Attempts Reloaded** | Firewall + login protection | Both can limit logins. I'll let only one of them do it so they don't clash |
| **UpdraftPlus** | Automatic backups to Google Drive / Dropbox | |
| **LiteSpeed Cache** (if your host uses LiteSpeed) *or* **WP Super Cache** | Speed | Dashboards, checkout and availability are never cached |
| **Smush** *or* **ShortPixel** | Image compression / WebP | Pick one in Phase 12. If LiteSpeed Cache's image tools cover it, we skip both |
| **Join.chat** | WhatsApp button | On general pages; business pages use each business's own WhatsApp |
| **Fluent Forms** | Contact, "Advertise with us", enquiries | |
| **MailPoet** | Newsletter | Free tier has a subscriber limit (about 1,000 on their sending service) |
| **Duplicator** (Phase 15) | Moving the site to your live host | Preferred over All-in-One WP Migration, whose free version limits import size |

### Suggested addition (free) — needs your OK
- **FluentSMTP**: makes sure booking emails actually arrive (not in spam) by
  sending through a proper mail service such as your host's email or Brevo's free tier.
  The site sends many emails, so I strongly recommend it.

### Things we're deliberately **not** using (and why)
| Not using | Why |
|---|---|
| Directorist / GeoDirectory | See section 2 |
| Advanced Ads (free) | You need view/click counts, and its tracking is a **paid** add-on. Ads are simple to build into our plugin with scheduling and counts |
| WooCommerce Bookings / Subscriptions | Paid, and not designed for many hotels each managing their own rooms |
| Event Tickets Plus | Paid. Our tickets + QR + scanner are built in |

### ⚠️ One paid item to decide later (not now)
- **Polylang for WooCommerce** (paid, roughly €99/year; I'll confirm the price
  when we get there). Without it, the **Shop and checkout pages** can't be
  properly linked between English and Hausa. Everything else (attractions,
  hotels, pages, the dashboard text) translates fine with free Polylang.
  Option: keep the shop/checkout English-only at launch. I'll ask you in Phase 11.

### Libraries bundled inside our plugin (not plugins, no cost)
- **Leaflet** + **Leaflet.markercluster** for the map, with OpenStreetMap tiles.
  The map code sits behind a small "map provider" layer so Google Maps can be
  switched on later by adding an API key.
- A QR-code generator (for tickets) and a camera QR scanner (for check-in staff).
  Both are open-source with permissive licences.

---

## 4. What the custom plugin contains (modules)

| Module | What it does |
|---|---|
| Listings | Business profiles of every type, the sign-up form, your approval queue, pending/approved/paused states, Verified badge |
| Hotels | Room categories, availability calendar, seasonal/weekend prices, payment options |
| Restaurants | Menu builder, table time slots, reservations, food ordering (built but **off**) |
| Event centres | Halls, calendar, peak prices, request-to-book / instant deposit |
| Tours & tickets | Your own tours, ticketed events, QR tickets, check-in scanner |
| Bookings engine | One shared engine for hotel stays, hall bookings, table reservations and tour seats, with no double booking |
| Payments bridge | Creates a WooCommerce order for each payment and marks the booking paid when Paystack/Flutterwave confirms |
| Money | Commissions, money on hold, release dates, payouts, monthly invoices, auto-pause on unpaid invoices |
| Reviews & rankings | Verified reviews, owner replies, moderation log, daily ranking calculation, badges, Top 10 pages |
| Map & search | Map index, "Near me", distance sorting, filters, loading only the visible area |
| Dashboards | Branded front-end dashboards for business owners and customers (no WordPress admin access) |
| Revenue | Featured/Premium plans, Verified applications, setup-service orders, ads, sponsored labels, event promotion, AdSense slots, partner referral tracking |
| Notifications | Emails for every event. WhatsApp/SMS "hooks" ready but **off** |
| Analytics | Page views, map pin taps, WhatsApp/call clicks, bookings, revenue per business per day |
| Admin reports | Revenue dashboard, commission, money on hold, amounts owed, unpaid invoices, no-show rates |

---

## 5. Database structure in plain language

Think of the database as a set of **record books**. There are two kinds.

### A. Public content (stored as normal WordPress content)
These are pages people visit. Storing them as normal WordPress content means
SEO, translation (Polylang), photos and sitemaps all work automatically.

| Record book | One entry is… | Main details kept |
|---|---|---|
| **Businesses** | one business of any type | name, type, LGA, address, map pin, phone/WhatsApp, email, website/socials, opening hours, description, photos, status (pending / approved / paused / rejected), star rating (self-declared) + Verified flag, current plan |
| **Room categories** | e.g. "Deluxe" at one hotel | belongs to a hotel; price per night, number of rooms, max guests, bed type, size, amenities, photos |
| **Halls** | one hall/space at an event centre | belongs to an event centre; seated & standing capacity, price per day/event, indoor/outdoor, photos |
| **Attractions** | e.g. Gobarau Minaret | LGA, category, history, hours, entry fee, how to get there, map pin, gallery |
| **Festivals & Events** | e.g. Sallah Durbar | dates or "date TBC", location, gallery, linked tickets |
| **Tours** | one of your own tours | price per person, group size, pickup point; dates are in "Tour departures" below |
| **Stories** | a blog article | normal WordPress posts; can be marked "Sponsored" |
| **Products & Guides** | shop items, PDF guides | WooCommerce products (guides are downloadable products) |

**Labels used for filtering:** LGAs (all 34), business types and categories,
amenities, cuisines, attraction categories.

### B. Private / transactional records (our own tables)
These are fast, private and never shown as public pages. Each has a clear owner,
and the plugin checks on **every** request that you are allowed to see a row.

| Record book | One entry is… | Why it exists |
|---|---|---|
| **Business private details** | sensitive owner info | owner's name, CAC number, ID document, bank name / account name / account number (**encrypted**), which version of the Partner Agreement they accepted and when |
| **Map index** | one pin | position, type, LGA, lowest price, rating, rank, featured flag. Lets the map fetch only the pins in view, quickly |
| **Availability calendar** | one room category (or hall) on one date | rooms available, rooms booked, blocked or not, the price for that date. **This is what prevents double booking** |
| **Price rules** | e.g. "Sallah peak: +30%, 28 Mar–5 Apr" | seasonal and weekend prices |
| **Menus** | a menu category or menu item | name, price, photo, description, available / sold-out |
| **Table slots** | a restaurant's seats per time slot on one date | capacity check for reservations |
| **Tour departures** | a tour on one date | seats available / sold |
| **Bookings** | any booking or reservation | booking code (e.g. `EK-7Q3M`), customer, business, what was booked, dates, guests, total, payment type (full / deposit / pay at venue), status, cancellation policy *as it was when booked* |
| **Booking history** | every status change | who confirmed/declined/checked in and when. Used for disputes and response-rate scoring |
| **Money ledger** | one money movement | payment received, commission, business share, refund. Each line is **on hold → available → paid out** (or refunded), with its release date |
| **Payouts** | a payout request | amount (minimum ₦5,000), bank details at the time, status (requested / approved / paid / rejected), your transfer reference |
| **Invoices** | a monthly commission invoice | for pay-at-hotel bookings; amount, due date, paid / unpaid, paid via Paystack |
| **Reviews** | one verified review | linked to a **completed** booking (that's what makes it verified); overall + cleanliness, service, value, location; text; owner's reply; visible / hidden |
| **Moderation log** | one admin action | e.g. "Review #88 hidden: fake, by admin, date". Also approvals, pauses and verified decisions |
| **Rankings** | one business's rank on one day | score, statewide rank, LGA rank, badges. Kept daily so we can detect "Rising" |
| **Analytics** | one business, one day, one counter | page views, pin taps, WhatsApp/call clicks, bookings, revenue |
| **Plans** | one plan purchase | Featured / Premium, monthly / yearly, start and end date, reminders sent |
| **Ads** | one ad and its daily counts | zone, schedule, image/link, views, clicks |
| **Tickets** | one ticket | ticket type, attendee, secret QR code, checked-in time and by whom |
| **Referral clicks** | one click to a partner | partner, page it came from, date |
| **Favourites** | one saved place | customer + business/attraction |
| **Message log** | one email / WhatsApp / SMS | for troubleshooting "I never got my email" |

**Money is stored in kobo** (₦1 = 100 kobo) as whole numbers, so totals never
have rounding errors. Times use **Africa/Lagos**.

---

## 6. How the important parts work

### 6.1 No double booking
- Each room category has one calendar row per date showing how many rooms are
  left (for example "Deluxe, 14 March: 6 rooms, 5 booked → 1 left").
- When a guest clicks "Book", the system **locks** those dates, checks every
  night has a room left, and reserves it in one step. If two guests try for the
  last room at the same moment, the database makes them queue. The second one
  is told "Sorry, just sold out".
- While the guest pays, the room is **held for 15 minutes**. If they don't
  finish paying, the hold is released automatically.
- The same engine protects halls (one booking per hall per date), restaurant
  slots (seats per time slot) and tour departures (seats per date).

### 6.2 Where the money goes
1. Guest pays online → money goes to **Explore Katsina's** Paystack/Flutterwave account.
2. The ledger splits it into **your commission** and **the business's share**.
3. The business's share is **on hold**:
   - Hotels: until check-out, plus 3 days with no complaint.
   - Event centres: until 3 days after the event date, with no complaint.
   - A complaint freezes the hold until you resolve it.
4. Then it becomes **available**. The business requests a payout (minimum ₦5,000),
   you approve it, pay by bank transfer, and record the transfer reference.
5. **Pay at hotel:** no money passes through us. Each month the system adds up
   the commission owed and puts an **invoice** in the hotel's dashboard,
   payable by Paystack. If it's unpaid after 30 days, the listing **pauses**
   automatically and comes back when the invoice is paid.
6. Commission rates are settings you control, per business type, with an
   optional override per business. Each booking stores the rate used **at the
   time**, so changing a rate later never changes old bookings.

*(Later option, not now: Paystack can also send payouts automatically through
its Transfers feature. We'll start with manual bank transfers as you asked.)*

### 6.3 Honest rankings, explained simply
Each business gets a **score** every night. It's mostly about reviews, with
smaller parts for real activity:

- **Weighted rating (default 70%).** A Bayesian average. Every business starts
  as if it already had **10 "average" reviews** (the average for its type).
  Real reviews gradually outweigh those pretend ones.
  - New place with one 5★ review: (1×5 + 10×4.2) ÷ 11 ≈ **4.27**
  - Established place with fifty 4.6★ reviews: (50×4.6 + 10×4.2) ÷ 60 ≈ **4.53** ✔ ranks higher
- **Recency.** A review loses half its weight after about 12 months, so recent
  experiences count more.
- **Completed bookings (default 15%).** On a sliding scale, so the 10th booking
  matters more than the 1,000th.
- **Response rate (default 15%).** How quickly the business confirms bookings and replies to reviews.
- Only **verified** reviews count. **Paid plans are never part of the score.**
- All the numbers above (10 pretend reviews, 12 months, 70/15/15) are settings
  you can adjust.
- A business needs **at least 3 verified reviews** before it shows a rank
  number (approved). Until then it shows "New, not yet ranked".
- Separate rankings per type (hotels vs restaurants vs event centres…),
  statewide and per LGA.
- Badges: **Top Rated** (top 10% of its type), **Rising** (big improvement over
  the last 90 days), **Verified** (approved by you). **Featured** is a separate
  label and has nothing to do with the rank number.

### 6.4 The map
- Leaflet + OpenStreetMap, centred on Katsina State.
- The browser only asks for the pins **inside the visible area**, so 200+ pins
  stay fast on 3G/4G. Pins cluster when zoomed out.
- Distances are calculated by the server from the visitor's location, but only
  if the visitor allows it. Their location is never stored.
- Note: OpenStreetMap's free tile server has a fair-use policy. That's fine at
  launch. If traffic grows a lot, we switch to a free-tier tile provider or
  Google Maps by changing one setting.

### 6.5 Languages
- The website's own text (buttons, menus, dashboard, emails) will be translatable
  into Hausa. Hausa pages are created and marked **"needs translation"**. No
  machine translation.
- Content typed by businesses (room names, menu items) shows as they typed it.

---

## 7. Security & privacy (Nigeria Data Protection Act 2023)

- Business owners get a special account type with **no WordPress admin
  access**. They're always redirected to their branded dashboard.
- Every dashboard request checks **"does this business belong to you?"** I'll
  write automated tests that try to read another business's data and must fail.
- **ID documents** are stored outside the public uploads folder and only you can
  open them. **Bank account numbers are encrypted.**
- We collect only what's needed. The privacy policy will explain what is kept,
  why and for how long.
- Login protection, hidden WordPress version, XML-RPC disabled (Phase 14).

---

## 8. Practical notes

- **Scheduled jobs** (nightly rankings, releasing held money, invoices, plan
  expiry, reminder emails) need a real "cron job" on your host. Most hosts
  (Truehost, Whogohost, Hostinger) offer it in cPanel/hPanel. I'll include the
  exact line to paste.
- Food ordering is built in Phase 4 but **switched off** by a single setting.
- WhatsApp/SMS sending is **ready but off**. It needs a paid provider (e.g.
  Termii or Twilio) later, and I'll ask you first.
- All sample content will be tagged **SAMPLE** and removable with one command.

---

## 9. Build order

The phases you listed, with one suggestion: let me show you the **2 brand
palette/font options at the start of Phase 2** (not in Phase 11), so the
business dashboards are built in the final look and don't need redoing.
The full theme work stays in Phase 11.

| Phase | What you'll get |
|---|---|
| 2 | Local WordPress running, plugin skeleton, business sign-up, approval, dashboards |
| 3 | Hotels: rooms, calendar, prices, search, booking without double booking |
| 4 | Restaurants: menus, table reservations (food ordering built, switched off) |
| 5 | Event centres: halls, calendar, request-to-book / deposit |
| 6 | Customer accounts, confirmations, cancellations, verified reviews, emails |
| 7 | Commissions, holds, payouts, invoices, admin reports |
| 8 | Katsina Map and rankings |
| 9 | Revenue features |
| 10 | Tourism guide content (researched, with anything uncertain flagged) |
| 11 | Brand & theme |
| 12 | Other plugins, compatibility checks |
| 13 | Pages & SAMPLE data |
| 14 | SEO, speed, security |
| 15 | Full testing, export, final HANDOVER.md |
