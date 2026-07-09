'use client';

import { useEffect, useState } from 'react';

/**
 * Live per-second countdown for the current blind level.
 *
 * Seeds from the server-provided remaining seconds, decrements locally once a
 * second, and re-seeds whenever the server value changes. Shared by the
 * tournament page and the Home/Schedule active-tournament card so their timers
 * tick identically from the same seed.
 */
export function useLevelCountdown(seedSec: number | null | undefined): number {
  const seed = seedSec ?? 0;
  const [s, setS] = useState(seed);

  useEffect(() => {
    setS(seed);
  }, [seed]);

  useEffect(() => {
    const id = setInterval(() => setS((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  return s;
}
