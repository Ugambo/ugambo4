import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';
import type { Place } from '@rideswithme/shared-types';

/** The trip being planned: pickup and destination chosen on the home and search screens. */
interface TripDraft {
  pickup: Place | null;
  dropoff: Place | null;
  setPickup: (p: Place | null) => void;
  setDropoff: (p: Place | null) => void;
  /** True once the user chose a pickup by hand (so GPS should not overwrite it). */
  pickupChosen: boolean;
  setPickupChosen: (v: boolean) => void;
}

const Ctx = createContext<TripDraft | null>(null);

export function TripDraftProvider({ children }: { children: ReactNode }) {
  const [pickup, setPickup] = useState<Place | null>(null);
  const [dropoff, setDropoff] = useState<Place | null>(null);
  const [pickupChosen, setPickupChosen] = useState(false);
  const value = useMemo(
    () => ({ pickup, dropoff, setPickup, setDropoff, pickupChosen, setPickupChosen }),
    [pickup, dropoff, pickupChosen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTripDraft(): TripDraft {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTripDraft outside TripDraftProvider');
  return v;
}
