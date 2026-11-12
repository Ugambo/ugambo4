import type { LocationPoint } from '@rideswithme/validation';

export interface BufferedPoint {
  id: number;
  point: LocationPoint;
}

/** Durable storage for the buffer (SQLite on the phone, memory in tests). */
export interface BufferStore {
  append(points: LocationPoint[]): Promise<void>;
  /** Oldest first. */
  peek(limit: number): Promise<BufferedPoint[]>;
  removeThrough(id: number): Promise<void>;
  count(): Promise<number>;
  /** Keeps only the newest `max` points. */
  trimTo(max: number): Promise<void>;
}

/** Points per upload (the API accepts up to 500). */
export const FLUSH_BATCH = 200;
/** About 2 days of readings every 10 seconds; older ones are dropped if the phone stays offline. */
export const MAX_BUFFERED = 20_000;

/**
 * Every location reading goes into a durable queue first and is uploaded in
 * order, oldest first, in batches. A batch is removed only after the API
 * accepted it, so nothing is lost when the network drops mid-upload; a resent
 * batch is harmless (the API keeps the newest position and ignores older ones).
 */
export class LocationBuffer {
  private flushing: Promise<number> | null = null;

  constructor(private readonly store: BufferStore) {}

  async add(points: LocationPoint[]): Promise<void> {
    if (points.length === 0) return;
    await this.store.append(points);
    if ((await this.store.count()) > MAX_BUFFERED) await this.store.trimTo(MAX_BUFFERED);
  }

  /** Uploads everything buffered; stops at the first failure. Returns how many points were sent. */
  flush(send: (points: LocationPoint[]) => Promise<void>): Promise<number> {
    this.flushing ??= this.drain(send).finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  pending(): Promise<number> {
    return this.store.count();
  }

  private async drain(send: (points: LocationPoint[]) => Promise<void>): Promise<number> {
    let sent = 0;
    for (;;) {
      const batch = await this.store.peek(FLUSH_BATCH);
      if (batch.length === 0) return sent;
      try {
        await send(batch.map((b) => b.point));
      } catch {
        return sent;
      }
      await this.store.removeThrough(batch[batch.length - 1]!.id);
      sent += batch.length;
    }
  }
}

/** In-memory store for tests and as a fallback if SQLite cannot open. */
export class MemoryBufferStore implements BufferStore {
  private rows: BufferedPoint[] = [];
  private nextId = 1;
  async append(points: LocationPoint[]) {
    for (const point of points) this.rows.push({ id: this.nextId++, point });
  }
  async peek(limit: number) {
    return this.rows.slice(0, limit);
  }
  async removeThrough(id: number) {
    this.rows = this.rows.filter((r) => r.id > id);
  }
  async count() {
    return this.rows.length;
  }
  async trimTo(max: number) {
    this.rows = this.rows.slice(-max);
  }
}
