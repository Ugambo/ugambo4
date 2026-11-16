import type { ReactNode } from 'react';
import { ConfigProvider } from '@/lib/config';
import { serverEnv } from '@/server/env';
import { Shell } from './shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const env = serverEnv();
  return (
    <ConfigProvider
      value={{
        apiPublicUrl: env.API_PUBLIC_URL ?? null,
        tiles: { url: env.MAP_TILE_URL, attribution: env.MAP_TILE_ATTRIBUTION },
      }}
    >
      <Shell>{children}</Shell>
    </ConfigProvider>
  );
}
