# Load tests

Drives a local API through its public endpoints with many simulated passengers
and drivers at once, prints latency percentiles per operation, and fails when a
correctness check or latency budget fails.

## What it does

1. **Set-up**: resets its own database (`rideswithme_load`) and Redis db 12,
   seeds Kano, starts the built API on port 3400 with the console SMS provider,
   the fake maps and payment providers and a random `METRICS_TOKEN`.
2. **Accounts**: signs passengers in with SMS codes (read from the API log) and
   registers drivers through the full application flow (approval is a
   database shortcut).
3. **Estimates and locations**: every passenger asks for fare estimates every
   2–3 s while every driver sends a location every 1.5–2.5 s. Idle drivers keep
   sending locations for the whole run, as the app does.
4. **Booking and matching**: in each round as many passengers as there are
   drivers book cash rides at the same moment. Drivers poll for offers, accept,
   arrive, start and complete (collecting the payable cash). Every ride must
   complete within 90 s.
5. **Bus seat races**: for every seat on each departure, `--racers` passengers
   try to hold it at the same moment. Exactly one must win each race, and the
   database must never show a seat held twice.
6. **Checks**: reads the API's `/metrics` and requires no wallet whose balance
   disagrees with its ledger, nothing still searching and no active rides.
   Every operation must have no errors and a p95 under `--p95-ms`. Matching has
   its own budget, `--match-p95-ms`.

The results are also written to `.output/report.json`, and the API's log to
`.output/api.log`.

## Running it

Needs PostgreSQL (PostGIS), Redis and S3-compatible storage, as for the API's
tests, and a built API:

```sh
pnpm --filter @rideswithme/api... build
pnpm --filter @rideswithme/load-tests... build
pnpm --filter @rideswithme/load-tests load-test
# heavier:
pnpm --filter @rideswithme/load-tests load-test -- --passengers 200 --drivers 80 --rounds 3 --estimate-seconds 60
```

| Option | Default | Meaning |
| --- | --- | --- |
| `--passengers` | 30 | Simulated passengers |
| `--drivers` | 15 | Simulated drivers (also the rides booked per round) |
| `--rounds` | 2 | Booking rounds |
| `--estimate-seconds` | 20 | Length of the estimates and locations stage |
| `--racers` | 12 | Passengers racing for each bus seat |
| `--departures` | 2 | Bus departures (8 seats each) |
| `--p95-ms` | 1000 | p95 budget for each API call |
| `--match-p95-ms` | 8000 | p95 budget from booking to a driver accepting |
| `--port` | 3400 | Port for the API it starts |

Environment: `LOAD_DATABASE_URL` (default
`postgres://rwm:rwm@localhost:5432/rideswithme_load`; the database is
**dropped and recreated**), `LOAD_REDIS_URL` (default `redis://localhost:6379/12`,
flushed), and `TEST_S3_ENDPOINT` / `TEST_S3_ACCESS_KEY_ID` /
`TEST_S3_SECRET_ACCESS_KEY` (default: a local moto server on port 9000).

Per-user rate limits stay on: each simulated user stays inside them. The two
OTP limits per IP address are raised, because every simulated user signs in
from 127.0.0.1.

It only runs against an API it starts itself: sign-in reads codes from that
API's log. Do not point it at production.

## Results

Recorded runs are in `documentation/LAUNCH.md` under "Load tests". The first
run found a dispatcher bug (DECISIONS D-075): when two rides were offered to the
same driver at the same moment, the losing transaction was aborted, and the
remaining candidates were wrongly taken offline.
