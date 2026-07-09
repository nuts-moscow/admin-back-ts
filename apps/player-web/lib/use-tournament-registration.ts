'use client';

import { useEffect, useState } from 'react';
import { fetchPlayerApi } from './api';

/**
 * Register / unregister the current player for a tournament, with an optimistic
 * flip and an onChanged() refresh. Server `isRegistered` is the source of truth;
 * the optimistic value is cleared once a refresh brings it into agreement.
 */
export function useTournamentRegistration(
  tournamentId: number,
  isRegistered: boolean,
  onChanged?: () => void,
): { registered: boolean; busy: boolean; error: string | null; toggle: () => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const registered = optimistic ?? isRegistered;

  useEffect(() => {
    setOptimistic(null);
  }, [isRegistered]);

  async function toggle() {
    if (busy) return;
    const next = !registered;
    setError(null);
    setBusy(true);
    setOptimistic(next);
    try {
      if (next) {
        await fetchPlayerApi(`/api/player/tournaments/${tournamentId}/register`, {
          method: 'POST',
          body: {},
        });
      } else {
        await fetchPlayerApi(`/api/player/tournaments/${tournamentId}/register`, {
          method: 'DELETE',
        });
      }
      onChanged?.();
    } catch (err) {
      setOptimistic(null); // revert to server truth on failure
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return { registered, busy, error, toggle };
}
