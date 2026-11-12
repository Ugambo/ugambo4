import type { ReactNode } from 'react';
import { Shell } from './shell';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <Shell>{children}</Shell>;
}
