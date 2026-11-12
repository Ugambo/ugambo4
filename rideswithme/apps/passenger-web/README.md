# Passenger website

Next.js 16 site where passengers book rides from a browser: sign in with an SMS
code, search pickup and destination (or use the browser's location), compare
prices, book now or schedule, follow the ride live (status, driver, plate, where
the driver is, "last updated" when their position is old), cancel, and see
receipts and past rides. English and Hausa.

```bash
cp .env.example .env.local   # API_URL, API_PUBLIC_URL, PASSENGER_SESSION_SECRET, POLICY_VERSION, STORAGE_ORIGIN
pnpm dev                     # http://localhost:3002
pnpm build && pnpm e2e       # Playwright tests against a real API (see e2e/env.ts)
```

The API must allow this site's origin for live updates: add it to the API's
`CORS_ORIGINS` (e.g. `http://localhost:3002`).

How it works:

- **No API tokens in the browser.** They live in an encrypted httpOnly cookie on
  this site's server, which forwards allow-listed calls to the API
  (`src/server/allowlist.ts`). Shared with the admin dashboard through
  `@rideswithme/web-core`.
- **Live updates** come over Socket.IO straight from the API. Each connection
  attempt first gets a 60-second realtime ticket from `/api/realtime`, so the
  browser never holds an access token. If an update is missed while offline, the
  page refetches on reconnect, and checks every 30 seconds as a fallback.
- **Ride rules and text** (cancellation fee, stale positions, ride statuses,
  receipts) are shared with the passenger app through `@rideswithme/utilities`.
- **The map** is a to-scale sketch of pickup, destination, route and driver
  (`src/components/route-sketch.tsx`). A street map needs a Google Maps
  JavaScript key; see documentation/DECISIONS.md D-045.

The Playwright run saves screenshots of each screen to `e2e/.output/screenshots/`.
