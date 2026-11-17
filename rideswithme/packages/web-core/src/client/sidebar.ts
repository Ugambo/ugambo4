'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The staff sidebar's two states: collapsed to icons on wide screens
 * (remembered in this browser), and the menu opened from the top bar on
 * phones (closed again whenever the page changes).
 */
export function useSidebar(storageKey: string, pathname: string) {
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Read after the first render, so the server's page and the browser's match.
  useEffect(() => {
    try {
      setCollapsed(window.localStorage.getItem(storageKey) === 'collapsed');
    } catch {
      // Storage blocked (private window): start expanded.
    }
  }, [storageKey]);

  useEffect(() => setMenuOpen(false), [pathname]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      try {
        window.localStorage.setItem(storageKey, c ? 'expanded' : 'collapsed');
      } catch {
        // Not remembered; it still toggles.
      }
      return !c;
    });
  }, [storageKey]);

  return {
    collapsed,
    toggleCollapsed,
    menuOpen,
    toggleMenu: useCallback(() => setMenuOpen((o) => !o), []),
  };
}
