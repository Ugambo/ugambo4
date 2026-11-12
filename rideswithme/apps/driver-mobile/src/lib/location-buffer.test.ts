import { describe, expect, it, vi } from 'vitest';
import { FLUSH_BATCH, LocationBuffer, MAX_BUFFERED, MemoryBufferStore } from './location-buffer';

const pt = (i: number) => ({
  lat: 12 + i / 1e5,
  lng: 8.5,
  recordedAt: new Date(1_800_000_000_000 + i * 10_000).toISOString(),
});

describe('LocationBuffer', () => {
  it('uploads oldest first in batches and empties the buffer', async () => {
    const buffer = new LocationBuffer(new MemoryBufferStore());
    await buffer.add(Array.from({ length: 450 }, (_, i) => pt(i)));
    const send = vi.fn(async () => undefined);
    expect(await buffer.flush(send)).toBe(450);
    expect(send.mock.calls.map((c) => (c as unknown as [unknown[]])[0].length)).toEqual([
      FLUSH_BATCH,
      FLUSH_BATCH,
      50,
    ]);
    expect((send.mock.calls[0] as unknown as [{ recordedAt: string }[]])[0][0]!.recordedAt).toBe(
      pt(0).recordedAt,
    );
    expect(await buffer.pending()).toBe(0);
  });

  it('keeps unsent points when the network fails and sends them later', async () => {
    const buffer = new LocationBuffer(new MemoryBufferStore());
    await buffer.add(Array.from({ length: 300 }, (_, i) => pt(i)));
    const flaky = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('offline'));
    expect(await buffer.flush(flaky)).toBe(FLUSH_BATCH);
    expect(await buffer.pending()).toBe(100);
    await buffer.add([pt(300)]);
    expect(await buffer.flush(async () => undefined)).toBe(101);
  });

  it('never runs two uploads at once', async () => {
    const buffer = new LocationBuffer(new MemoryBufferStore());
    await buffer.add([pt(1)]);
    let release!: () => void;
    const send = vi.fn(() => new Promise<void>((r) => (release = r)));
    const a = buffer.flush(send);
    const b = buffer.flush(send);
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    release();
    expect(await a).toBe(1);
    expect(await b).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('drops the oldest readings when offline for very long', async () => {
    const store = new MemoryBufferStore();
    const buffer = new LocationBuffer(store);
    await buffer.add(Array.from({ length: MAX_BUFFERED + 5 }, (_, i) => pt(i)));
    expect(await buffer.pending()).toBe(MAX_BUFFERED);
    expect((await store.peek(1))[0]!.point.recordedAt).toBe(pt(5).recordedAt);
  });
});
