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
| Bus operator    | Partner portal  | List routes, departures, seat maps and fares; see passengers; check tickets at boarding    |

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

**Fleet operator:** staff create a fleet and its managers; managers sign in with
two-factor authentication; drivers join only by accepting an invitation in the
driver app and belong to at most one fleet; managers see their drivers' status,
vehicles, trips and earnings only for the time each driver was in the fleet, and
nothing of other fleets.

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

| Phase                    | Scope                                                                                        | Status                                    |
| ------------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1 Foundation             | Monorepo, Docker, database, migrations, phone OTP auth, roles, shared packages, CI           | Approved                                  |
| 2 Driver onboarding      | Driver registration, document upload, admin verification queue                               | Approved                                  |
| 3 Core ride flow         | Location search, fare estimate, ride request, matching, state machine, cash                  | Approved (passenger web moved to Phase 4) |
| 4 Real-time tracking     | Socket.IO, background location, offline buffering, staleness; passenger web booking          | Approved                                  |
| 5 Payments               | Paystack, wallets, commission, payouts, refunds                                              | Approved                                  |
| 6 Admin and fleet        | Dashboard, pricing, service areas, fleet portal, audit log UI                                | Approved                                  |
| 7 Buses                  | Routes, schedules, seat maps, seat booking, tickets                                          | Approved                                  |
| 8 Safety, polish, launch | SOS, trip sharing, ratings, promotions, Hausa, monitoring, backups, load tests, store builds | Built, awaiting approval                  |

Phase 6 note: the admin dashboard's promotions screen and SOS panel are built with
those features in Phase 8, as the phase plan lists them there (confirmed).

**Buses (Phase 7):** operators list point-to-point routes, draw seat layouts with
standard, executive and VIP seats, and create departures with fares per seat class;
passengers search by cities and day, choose seats on a seat map, hold them while
paying (wallet, saved card or the payment page), and board with a QR code per seat;
operators check tickets in; cancellations refund to the wallet; RideswithMe keeps a
service fee from each fare and records what it owes each operator.

**Safety, engagement and launch (Phase 8):**

- **SOS:** on every live trip in all apps. It alerts on-call staff by SMS, the
  admin dashboard live, and monitoring if no one responds within 2 minutes.
- **Trip sharing:** a live link anyone can open without an account.
- **Ratings:** both ways after each trip.
- **In-ride messages:** between passenger and driver.
- **Problem reports:** with high-priority safety categories.
- **Support tickets:** for passengers.
- **Promotion codes:** funded by the platform, not the driver.
- **Notifications:** an in-app inbox and push notifications.
- **Account deletion:** with a grace period, as the NDPA requires.
- **Launch tooling:**
  - monitoring, alerts and runbooks
  - encrypted backups with weekly restore checks
  - load tests
  - checks on the Hausa text, and an export for its review
  - store build configuration

  The go-live checklist is in `LAUNCH.md`.

## Open decisions (defaults in use)

1. Launch area: one city, as a service-area polygon.
2. Vehicles at launch: car and Keke Napep; others by configuration.
3. Commission: percentage per vehicle category.
4. Payments: cash, wallet and Paystack card payments (Phase 5).
5. Buses: third-party operators; RideswithMe takes a service fee.

Further questions raised while building are listed at the top of `DECISIONS.md`.
