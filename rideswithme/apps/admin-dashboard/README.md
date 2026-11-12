# Admin dashboard

Next.js 16 app for RideswithMe staff. Phase 2 provides sign-in (SMS code plus an
authenticator app) and driver verification: the review queue, document viewer,
and approve/reject decisions. Users, rides, pricing, payments and the audit-log
screens arrive in Phase 6.

```bash
cp .env.example .env.local   # API_URL, ADMIN_SESSION_SECRET, POLICY_VERSION, STORAGE_ORIGIN
pnpm dev                     # http://localhost:3001
pnpm build && pnpm e2e       # Playwright tests against a real API (see e2e/env.ts)
```

How it is secured: the browser never sees API tokens. They live in an encrypted
httpOnly cookie on this app's server, which forwards allow-listed calls to the API
(`src/server/`, `src/app/api/`), using `@rideswithme/web-core`, shared with the
passenger website. See documentation/DECISIONS.md D-030.

All text is in `src/lib/messages.ts` (English and Hausa). The Playwright run saves
screenshots of each screen to `e2e/.output/screenshots/`.
