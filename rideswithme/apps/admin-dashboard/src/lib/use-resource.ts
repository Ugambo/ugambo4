'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** Loads data with loading/error state and a reload function. Ignores stale responses. */
export function useResource<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const mine = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const result = await load();
      if (mine === generation.current) setData(result);
    } catch (err) {
      if (mine === generation.current) setError(err);
    } finally {
      if (mine === generation.current) setLoading(false);
    }
  }, deps);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}
