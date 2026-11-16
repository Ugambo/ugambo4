# Partner portal (fleet portal)

Next.js 16 app for RideswithMe's partners: fleet operators and bus operators. The
sidebar shows the fleet pages, the bus pages, or both, depending on what the person
manages.

- **Fleets:** an overview (drivers online, trips and earnings today and this week),
  drivers (invite by phone number, remove), each driver's details and trips,
  vehicles, and a trip list filtered by driver and date.
- **Buses:** an overview (upcoming departures, seats sold, the operator's share, what
  RideswithMe owes), routes, seat layouts drawn on a grid, departures created for
  chosen days with fares per seat class, each departure's passenger list (change
  fares or cancel it), check-in by ticket code, and the statement.

```bash
cp .env.example .env.local   # API_URL, FLEET_SESSION_SECRET, POLICY_VERSION
pnpm dev                     # http://localhost:3003
pnpm build && pnpm e2e       # Playwright tests against a real API (see e2e/env.ts)
```

- **Who can sign in:** someone staff made a manager of a fleet or a bus operator in
  the admin dashboard. They sign in with an SMS code and an authenticator app, like staff
  (`fleet.portal` and `bus.operator` need two-factor). The sign-in screens are shared with the admin
  dashboard (`@rideswithme/web-core`).
- **Drivers join by consent:** an invitation only appears in the driver app; the
  manager sees nothing of the driver until they accept. A driver belongs to at most
  one fleet.
- **What a manager sees:** trips a driver made while in the fleet (between joining
  and leaving), never trips from before or after, and nothing of other fleets. The
  API enforces this; the portal's proxy also only forwards `/v1/fleet/*`,
  `/v1/operator/*`, sign-in and session calls (`src/server/allowlist.ts`). Bus
  operators likewise see only their own routes, departures and passengers.
- **Security:** as in the admin dashboard, API tokens stay in an encrypted
  httpOnly cookie on this app's server (documentation/DECISIONS.md D-030).

All text is in `src/lib/messages.ts` (English and Hausa; Hausa needs native-speaker
review). The Playwright run saves screenshots to `e2e/.output/screenshots/`.
