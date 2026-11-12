# RideswithMe: product requirements

RideswithMe is a ride-hailing and bus-booking platform for Nigeria. Passengers
book cars, taxis, Keke Napep, motorcycles and bus seats. Drivers accept trips and
get paid. Admins and fleet operators run the service.

This is a summary of the build brief, kept up to date as decisions are made. Where
it differs from the brief, `DECISIONS.md` explains why.

## Users

| Who             | Uses            | Needs                                                                                      |
| --------------- | --------------- | ------------------------------------------------------------------------------------------ |
| Passenger       | Mobile app, web | Book quickly, see the fare first, track the driver, pay by cash, wallet or card, feel safe |
| Driver          | Mobile app      | Get approved, receive fair requests, navigate, get paid, keep working on poor connections  |
| Admin / support | Admin dashboard | Verify drivers, manage rides, pricing and payments, respond to SOS first                   |
| Fleet operator  | Fleet portal    | Manage their own drivers and vehicles, see their trips and earnings, nothing else          |
| Bus operator    | (Phase 7)       | List routes, schedules and seat maps                                                       |

## Requirements by area

**Passenger:** phone OTP sign-in, profile, email; GPS pickup, destination search,
pick on map, saved places; vehicle category choice, ride now or scheduled; fare
estimate before confirming; live driver tracking; in-app messages and masked calls;
cash, wallet and Paystack; trip history and receipts; ratings; SOS, trip sharing,
support; English and Hausa.

**Driver:** registration with ID, licence, permits, vehicle details and photos,
insurance and roadworthiness documents, payout account; per-document status
(pending, approved, rejected with reason, expired); cannot go online until
approved; online/offline; request screen with countdown; navigation; arrive,
start, complete; earnings and payouts; background GPS while online.

**Admin:** KPIs, charts, live map; driver verification queue; users and rides with
event timelines; pricing, service areas, promotions; payments, wallets, refunds,
payouts, disputes; SOS panel at highest priority; incidents and tickets; bus
routes and seat maps; roles, permissions, audit log, two-factor authentication.

**Fare:** `F = B + (D × Rd) + (T × Rt) + A` per vehicle category, admin-controlled
rates, minimums, waiting and cancellation charges, service fees, commission,
promotions, optional peak pricing. Integer kobo. The fare is snapshotted when a
ride is confirmed.

**Rides:** `requested → searching → driver_assigned → driver_arrived → in_progress → completed`,
plus three cancellation/no-driver end states, each transition recorded. Two drivers
can never accept the same ride. Offers expire and move on.

**Connectivity:** drivers buffer location offline; every point has device and
server time; stale positions are never shown as live; creates are idempotent;
sockets reconnect and refetch state.

**Payments:** Paystack webhooks verified by signature are the source of truth;
double-entry wallet ledger; commission from the fare snapshot (debited from the
driver's wallet on cash trips); fees, refunds and disputes audited.

**Non-functional:** fast responses; availability target 99.9% (see DECISIONS B-5);
HTTPS, encrypted sensitive fields, short-lived tokens; NDPA consent, minimisation
and deletion; private driver documents via short-lived signed URLs with access
logged; admin two-factor; SOS first; structured logs, error tracking, alerts;
tested backups; rate limits on OTP, login and booking.

## Phases

| Phase                    | Scope                                                                                        | Status                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1 Foundation             | Monorepo, Docker, database, migrations, phone OTP auth, roles, shared packages, CI           | Approved                                                      |
| 2 Driver onboarding      | Driver registration, document upload, admin verification queue                               | Approved                                                      |
| 3 Core ride flow         | Location search, fare estimate, ride request, matching, state machine, cash                  | **Built, awaiting approval** (passenger web moved to Phase 4) |
| 4 Real-time tracking     | Socket.IO, background location, offline buffering, staleness; passenger web booking          |                                                               |
| 5 Payments               | Paystack, wallets, commission, payouts, refunds                                              |                                                               |
| 6 Admin and fleet        | Dashboard, pricing, service areas, fleet portal, audit log UI                                |                                                               |
| 7 Buses                  | Routes, schedules, seat maps, seat booking, tickets                                          |                                                               |
| 8 Safety, polish, launch | SOS, trip sharing, ratings, promotions, Hausa, monitoring, backups, load tests, store builds |                                                               |

## Open decisions (defaults in use)

1. Launch area: one city, as a service-area polygon.
2. Vehicles at launch: car and Keke Napep; others by configuration.
3. Commission: percentage per vehicle category.
4. Payments: cash first; wallet and Paystack in Phase 5.
5. Buses: third-party operators; RideswithMe takes a service fee.

Further questions raised while building are listed at the top of `DECISIONS.md`.
