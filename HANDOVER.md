# HANDOVER — Explore Katsina

Updated at the end of every phase so anyone (or a new Claude session) can continue
from exactly where the last one stopped.

## Current status
- **Phase 1 (Architecture plan): done and approved.** See `docs/ARCHITECTURE.md`.
- **Phase 2 (Business accounts & approval): done, waiting for the owner's go-ahead.**
- Next: **Phase 3 (Hotels)**.

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
./tests/run.sh      # 40 server-side checks + 37 browser checks
```
- Site: http://localhost:8888 · Admin: http://localhost:8888/wp-admin (user `admin`, password in `.env`)
- Test inbox (offline mode): http://localhost:8025, where every email the site sends lands.

## Where things are
| Path | What it is |
|---|---|
| `docs/ARCHITECTURE.md` | The approved plan |
| `docs/brand-options.html` | The two brand options (B chosen) |
| `docs/screenshots/phase2/` | Screenshots of the sign-up, dashboard, admin and public page |
| `setup.sh` | Re-runnable setup |
| `docker-compose.offline.yml` | "Offline" local site (used when wordpress.org is blocked) |
| `.wp-env.json` | wp-env setup (normal local site) |
| `plugins/explore-katsina-core/` | Our plugin (all business logic) |
| `  includes/` | PHP classes, one per job (Business, Signup, Dashboard, Admin, Money, Crypto…) |
| `  templates/` | Screens (sign-up, dashboard sections, admin pages, public page) |
| `  assets/` | Brand CSS, fonts, JavaScript, Leaflet map library |
| `  content/listing-partner-agreement.html` | Agreement draft (for legal review) |
| `mu-plugins/ek-local-mail.php` | Local-only: sends emails to the test inbox. **Never upload to the live site.** |
| `tests/` | Automated checks (`phase2-security.php`, `e2e/phase2.js`) |

## Environment notes (for the next session)
- **Cloud sessions block** `wordpress.org` (WordPress and plugin downloads), Alpine/Debian package
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
- Sample/test businesses created by the tests are named "SAMPLE …" and can be deleted
