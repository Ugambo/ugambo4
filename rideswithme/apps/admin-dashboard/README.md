# Admin dashboard

Next.js 16 app for RideswithMe staff, signed in with an SMS code plus an
authenticator app. Screens (each shown only to roles with the permission):

- **Overview:** KPI cards (riders, drivers, trips and revenue today) and 14-day
  revenue and trip charts, each with a table view.
- **Live map:** online drivers and active rides, updated over Socket.IO.
- **Rides:** search and filters, each ride's event timeline, payments and refunds,
  and cancelling a ride as staff (with a reason, audited).
- **Users:** search, details, suspend and reactivate.
- **Driver verification** (Phase 2), **Fleets** (create, managers, suspend).
- **Buses:** operators (create, service fee, managers, suspend, record payments to
  them, statement), departures with passenger lists and cancellation, and booking
  lookup by reference or phone with cancellation and full refund.
- **Pricing** per service area and category, **Service areas** drawn on a map.
- **Payments:** wallets and adjustments, refunds, payouts, disputes.
- **Roles** and the **audit log**.

Maps use Leaflet with a configurable tile server (`MAP_TILE_URL`, see
documentation/DECISIONS.md D-057). For the live map the browser connects to the
API directly (`API_PUBLIC_URL`, and the API's `CORS_ORIGINS`).

```bash
cp .env.example .env.local   # API_URL, ADMIN_SESSION_SECRET, POLICY_VERSION, STORAGE_ORIGIN, API_PUBLIC_URL
pnpm dev                     # http://localhost:3001
pnpm build && pnpm e2e       # Playwright tests against a real API (see e2e/env.ts)
```

How it is secured: the browser never sees API tokens. They live in an encrypted
httpOnly cookie on this app's server, which forwards allow-listed calls to the API
(`src/server/`, `src/app/api/`), using `@rideswithme/web-core`, shared with the
passenger website. See documentation/DECISIONS.md D-030.

All text is in `src/lib/messages.ts` (English and Hausa). The Playwright run saves
screenshots of each screen to `e2e/.output/screenshots/`.
