import type { SupportContactView, VehicleCategorySummary } from '@rideswithme/shared-types';
import { WelcomeView } from './welcome-view';

export const dynamic = 'force-dynamic';

async function fromApi<T>(path: string, fallback: T): Promise<T> {
  const api = process.env.API_URL;
  if (!api) return fallback;
  try {
    const res = await fetch(`${api}${path}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2_000),
    });
    return res.ok ? ((await res.json()) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** The front page for visitors who are not signed in: what RideswithMe offers, and the way in. */
export default async function WelcomePage() {
  const [vehicles, contact] = await Promise.all([
    fromApi<VehicleCategorySummary[]>('/v1/vehicle-categories', []),
    fromApi<SupportContactView>('/v1/support-contact', { phone: null, email: null }),
  ]);
  return <WelcomeView vehicles={vehicles} contact={contact} />;
}
