import { Inject, Logger, type OnApplicationShutdown } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayConnection,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Kysely } from 'kysely';
import type { Server, Socket } from 'socket.io';
import { ErrorCode } from '@rideswithme/shared-types';
import { locationUpdateSchema, uuidSchema } from '@rideswithme/validation';
import { AppException } from '../common/app-exception';
import { RateLimiterService } from '../common/rate-limit/rate-limiter.service';
import { APP_CONFIG, type AppConfig } from '../config/config';
import { DB } from '../database/database.module';
import type { Database } from '../database/types';
import { LocationService } from '../rides/location.service';
import { RealtimeAuthService, type RealtimeIdentity } from './realtime-auth.service';
import { RealtimeNotifier, rideRoom, userRoom } from './realtime.notifier';

type Ack = { ok: true; [k: string]: unknown } | { ok: false; code: string };

/**
 * Realtime connection at /realtime (Socket.IO).
 *
 * Connect with `auth: { token }`: an access token (mobile apps) or a realtime
 * ticket (web apps). Each client joins its user room and receives:
 *   ride:updated     the ride as that user sees it, on every change
 *   offer:new        (drivers) a new ride request
 *   offer:closed     (drivers) a request expired or was withdrawn
 *   driver:position  (passengers) the driver's position during the ride
 *   session:ended    the session was signed out or suspended; the socket closes
 * Clients send:
 *   ride:subscribe   { rideId } to watch a ride they may see (staff: rides.read)
 *   location:update  { points } (drivers), same as POST /v1/driver/location
 * After reconnecting, clients should refetch current state over HTTP.
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnApplicationShutdown {
  private readonly logger = new Logger(RealtimeGateway.name);
  private sweeper: NodeJS.Timeout | null = null;
  @WebSocketServer() server!: Server;

  constructor(
    private readonly auth: RealtimeAuthService,
    private readonly notifier: RealtimeNotifier,
    private readonly locations: LocationService,
    private readonly rateLimiter: RateLimiterService,
    @Inject(DB) private readonly db: Kysely<Database>,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  afterInit(server: Server) {
    server.use((socket, next) => {
      this.auth
        .authenticate(socket.handshake.auth?.token)
        .then((identity) => {
          socket.data.identity = identity;
          next();
        })
        .catch((err: unknown) =>
          next(new Error(err instanceof AppException ? err.code : ErrorCode.UNAUTHENTICATED)),
        );
    });
    this.notifier.attach(server);
    this.sweeper = setInterval(
      () => void this.sweepSessions(),
      this.config.REALTIME_SESSION_CHECK_SECONDS * 1000,
    );
    this.sweeper.unref();
  }

  onApplicationShutdown() {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  async handleConnection(socket: Socket) {
    const identity = socket.data.identity as RealtimeIdentity | undefined;
    if (!identity) return socket.disconnect(true);
    await socket.join(userRoom(identity.userId));
  }

  @SubscribeMessage('ride:subscribe')
  async subscribe(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const identity = socket.data.identity as RealtimeIdentity;
    const rideId = uuidSchema.safeParse((body as { rideId?: unknown } | null)?.rideId);
    if (!rideId.success) return { ok: false, code: ErrorCode.VALIDATION_FAILED };
    const ride = await this.db
      .selectFrom('rides')
      .select(['passenger_id', 'driver_id'])
      .where('id', '=', rideId.data)
      .executeTakeFirst();
    const allowed =
      !!ride &&
      (ride.passenger_id === identity.userId ||
        ride.driver_id === identity.userId ||
        identity.permissions.includes('rides.read'));
    if (!allowed) return { ok: false, code: ErrorCode.NOT_FOUND };
    await socket.join(rideRoom(rideId.data));
    return { ok: true };
  }

  @SubscribeMessage('location:update')
  async location(@ConnectedSocket() socket: Socket, @MessageBody() body: unknown): Promise<Ack> {
    const identity = socket.data.identity as RealtimeIdentity;
    if (!identity.roles.includes('driver')) return { ok: false, code: ErrorCode.FORBIDDEN };
    const parsed = locationUpdateSchema.safeParse(body);
    if (!parsed.success) return { ok: false, code: ErrorCode.VALIDATION_FAILED };
    try {
      await this.rateLimiter.consume(
        { name: 'driver_location', limit: 60, windowSeconds: 60 },
        identity.userId,
      );
      const res = await this.locations.ingest(identity.userId, parsed.data.points);
      return { ok: true, position: res.position, stored: res.stored };
    } catch (err) {
      return { ok: false, code: err instanceof AppException ? err.code : ErrorCode.INTERNAL_ERROR };
    }
  }

  /**
   * Closes connections whose session has been signed out, revoked or suspended.
   * Each API copy checks its own connections.
   */
  async sweepSessions(): Promise<number> {
    try {
      const sockets = await this.server.local.fetchSockets();
      const ids = [
        ...new Set(
          sockets
            .map((s) => (s.data.identity as RealtimeIdentity | undefined)?.sessionId)
            .filter((x): x is string => !!x),
        ),
      ];
      const valid = await this.auth.validSessions(ids);
      let closed = 0;
      for (const s of sockets) {
        const sid = (s.data.identity as RealtimeIdentity | undefined)?.sessionId;
        if (!sid || !valid.has(sid)) {
          s.emit('session:ended', { code: ErrorCode.SESSION_REVOKED });
          s.disconnect(true);
          closed++;
        }
      }
      return closed;
    } catch (err) {
      this.logger.warn({ err }, 'Realtime session sweep failed');
      return 0;
    }
  }
}
