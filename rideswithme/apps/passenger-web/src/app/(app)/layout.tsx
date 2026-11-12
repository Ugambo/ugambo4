import type { ReactNode } from 'react';
import { serverEnv } from '@/server/env';
import { RealtimeProvider } from '@/lib/realtime';
import { Shell } from './shell';

/** Signed-in pages: header, navigation and the live connection to the API. */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RealtimeProvider url={serverEnv().API_PUBLIC_URL}>
      <Shell>{children}</Shell>
    </RealtimeProvider>
  );
}
