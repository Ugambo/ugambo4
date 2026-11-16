'use client';

import { createContext, type ReactNode, useContext } from 'react';

export interface ClientConfig {
  /** The API's address for the live connection (null: live updates off, the page polls). */
  apiPublicUrl: string | null;
  tiles: { url: string; attribution: string };
}

const Ctx = createContext<ClientConfig | null>(null);

/** Settings the server passes to browser code (no secrets). */
export function ConfigProvider({ value, children }: { value: ClientConfig; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConfig(): ClientConfig {
  const v = useContext(Ctx);
  if (!v) throw new Error('useConfig outside ConfigProvider');
  return v;
}
