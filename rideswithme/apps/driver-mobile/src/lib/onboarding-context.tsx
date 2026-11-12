import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import type { DriverOnboardingView } from '@rideswithme/shared-types';
import { api } from './session';

interface OnboardingState {
  view: DriverOnboardingView | null;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  /** Replace the view with a fresher one returned by a save. */
  setView: (view: DriverOnboardingView) => void;
}

const Ctx = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [view, setView] = useState<DriverOnboardingView | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setView(await api.driver.onboarding());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <Ctx.Provider value={{ view, error, loading, reload, setView }}>{children}</Ctx.Provider>;
}

export function useOnboarding(): OnboardingState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useOnboarding outside OnboardingProvider');
  return v;
}
