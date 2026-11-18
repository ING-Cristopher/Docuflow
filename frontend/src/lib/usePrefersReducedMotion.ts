import { useEffect, useState } from 'react';

/**
 * Returns true when the user has requested reduced motion at the OS level.
 * Safe in non-browser environments (tests/SSR) where matchMedia may not exist.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  return reduced;
}
