/** Latency samples per operation, with error counts, summarised as percentiles. */

export interface Summary {
  name: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

/** Nearest-rank percentile of sorted samples (0 when there are none). */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1]!;
}

export class Recorder {
  private readonly samples = new Map<string, number[]>();
  private readonly errors = new Map<string, number>();
  private readonly errorExamples = new Map<string, string>();

  record(name: string, ms: number): void {
    const list = this.samples.get(name) ?? [];
    list.push(ms);
    this.samples.set(name, list);
  }

  fail(name: string, err: unknown): void {
    this.errors.set(name, (this.errors.get(name) ?? 0) + 1);
    if (!this.errorExamples.has(name)) {
      this.errorExamples.set(name, err instanceof Error ? err.message : String(err));
    }
  }

  /** Times `fn`, recording its latency, or an error if it throws (then rethrows). */
  async time<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    try {
      const out = await fn();
      this.record(name, performance.now() - start);
      return out;
    } catch (err) {
      this.fail(name, err);
      throw err;
    }
  }

  summaries(): Summary[] {
    const names = new Set([...this.samples.keys(), ...this.errors.keys()]);
    return [...names].sort().map((name) => {
      const sorted = [...(this.samples.get(name) ?? [])].sort((a, b) => a - b);
      return {
        name,
        count: sorted.length,
        errors: this.errors.get(name) ?? 0,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        p99: percentile(sorted, 99),
        max: sorted.at(-1) ?? 0,
      };
    });
  }

  firstError(name: string): string | undefined {
    return this.errorExamples.get(name);
  }
}

/** A fixed-width text table of summaries (milliseconds, rounded). */
export function formatTable(rows: Summary[]): string {
  const head = ['operation', 'ok', 'errors', 'p50 ms', 'p95 ms', 'p99 ms', 'max ms'];
  const body = rows.map((r) => [
    r.name,
    String(r.count),
    String(r.errors),
    ...[r.p50, r.p95, r.p99, r.max].map((v) => String(Math.round(v))),
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((row) => row[i]!.length)));
  const line = (cells: string[]) =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i]!) : c.padStart(widths[i]!))).join('  ');
  return [line(head), widths.map((w) => '-'.repeat(w)).join('  '), ...body.map(line)].join('\n');
}

/** Runs `worker` over `items` with at most `limit` in flight. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lanes = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i]!, i);
    }
  });
  await Promise.all(lanes);
  return out;
}
