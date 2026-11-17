'use client';

import { createContext, type ReactNode, useContext } from 'react';

const BrandContext = createContext<string | null>(null);

/** Gives pages the logo's address (from the root layout); null shows the built-in mark. */
export function BrandProvider({
  logoUrl,
  children,
}: {
  logoUrl: string | null;
  children: ReactNode;
}) {
  return <BrandContext.Provider value={logoUrl}>{children}</BrandContext.Provider>;
}

export const useBrandLogo = () => useContext(BrandContext);

/**
 * The logo a super admin set on the Settings page, or the orange "R" mark.
 * Decorative: the app's name is always written next to it.
 */
export function BrandMark({ size = 36 }: { size?: number }) {
  const logo = useContext(BrandContext);
  return logo ? (
    <img className="brand-logo" src={logo} alt="" width={size} height={size} />
  ) : (
    <span className="brand-mark" aria-hidden>
      R
    </span>
  );
}
