import { Inject, Injectable } from '@nestjs/common';
import { type Kysely, sql } from 'kysely';
import { collectDefaultMetrics, Gauge, Histogram, Registry } from 'prom-client';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { PresenceService } from '../rides/presence.service';

/**
 * Prometheus metrics: request latency by route, process health, and the
 * business numbers alerts are built on (SOS waiting for staff, ledger
 * integrity, payments stuck at the provider...). Business gauges are read when
 * Prometheus scrapes, so they cost nothing between scrapes.
 */
@Injectable()
export class MetricsService {
  readonly registry = new Registry();
  readonly http: Histogram<'method' | 'route' | 'status'>;

  constructor(
    @Inject(DB) private readonly db: Kysely<Database>,
    private readonly presence: PresenceService,
  ) {
    collectDefaultMetrics({ register: this.registry, prefix: 'rwm_api_' });
    this.http = new Histogram({
      name: 'rwm_http_request_duration_seconds',
      help: 'API request duration by route and status',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
      registers: [this.registry],
    });
    const gauge = (name: string, help: string, read: () => Promise<number>) =>
      new Gauge({
        name,
        help,
        registers: [this.registry],
        async collect() {
          this.set(await read());
        },
      });
    const count = async (q: ReturnType<typeof sql<{ n: string }>>) =>
      Number((await q.execute(this.db)).rows[0]?.n ?? 0);

    gauge('rwm_sos_open_alerts', 'SOS alerts not yet resolved', () =>
      count(sql`SELECT count(*) AS n FROM emergency_alerts WHERE status <> 'resolved'`),
    );
    gauge(
      'rwm_sos_oldest_unacknowledged_seconds',
      'Age of the oldest SOS no staff member has acknowledged',
      () =>
        count(sql`SELECT coalesce(extract(epoch FROM now() - min(created_at)), 0)::bigint AS n
        FROM emergency_alerts WHERE status = 'open'`),
    );
    gauge('rwm_incidents_open_high', 'High-priority incident reports not resolved', () =>
      count(
        sql`SELECT count(*) AS n FROM incident_reports WHERE priority = 'high' AND status <> 'resolved'`,
      ),
    );
    gauge(
      'rwm_ledger_mismatched_wallets',
      'Wallets whose balance differs from their ledger lines (must be 0)',
      () => count(sql`SELECT count(*) AS n FROM ledger_balance_mismatches()`),
    );
    gauge(
      'rwm_payments_pending_stale',
      'Payments pending at the provider for more than 30 minutes',
      () =>
        count(
          sql`SELECT count(*) AS n FROM payments WHERE status = 'pending' AND created_at < now() - interval '30 minutes'`,
        ),
    );
    gauge('rwm_payouts_stuck', 'Driver payouts not finished after 2 hours', () =>
      count(
        sql`SELECT count(*) AS n FROM payouts WHERE status IN ('pending', 'processing') AND requested_at < now() - interval '2 hours'`,
      ),
    );
    gauge('rwm_rides_searching', 'Rides looking for a driver', () =>
      count(sql`SELECT count(*) AS n FROM rides WHERE status = 'searching'`),
    );
    gauge('rwm_rides_active', 'Rides with a driver assigned or in progress', () =>
      count(
        sql`SELECT count(*) AS n FROM rides WHERE status IN ('driver_assigned', 'driver_arrived', 'in_progress')`,
      ),
    );
    gauge(
      'rwm_drivers_online',
      'Drivers online now',
      async () => (await this.presence.onlineDrivers()).length,
    );
    gauge('rwm_support_tickets_waiting', 'Support requests waiting for the team', () =>
      count(sql`SELECT count(*) AS n FROM support_tickets WHERE status = 'open'`),
    );
    gauge('rwm_deletion_requests_blocked', 'Account deletion requests waiting on something', () =>
      count(sql`SELECT count(*) AS n FROM account_deletion_requests WHERE status = 'blocked'`),
    );
  }
}
