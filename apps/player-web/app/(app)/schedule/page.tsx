'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerTournamentHistoryEntry, PlayerTournamentSummary } from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { ScheduleScreen } from './schedule-screen';

interface ScheduleData {
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  history: PlayerTournamentHistoryEntry[];
}

/**
 * How often the schedule silently re-fetches tournament state, so registrations
 * by other players (and changing player counts / statuses) show up without a
 * manual reload. A register/unregister action also triggers an immediate refresh
 * via the onChanged callback.
 */
const POLL_INTERVAL_MS = 15_000;

async function fetchScheduleData(): Promise<ScheduleData> {
  const [active, upcoming, history] = await Promise.all([
    fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
      '/api/player/tournaments?status=in_progress',
    ).catch(() => ({ tournaments: [] })),
    fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
      '/api/player/tournaments/upcoming?limit=50',
    ).catch(() => ({ tournaments: [] })),
    fetchPlayerApi<{ entries: PlayerTournamentHistoryEntry[] }>(
      '/api/player/me/tournaments/history',
    ).catch(() => ({ entries: [] })),
  ]);
  return {
    active: active.tournaments,
    upcoming: upcoming.tournaments,
    history: history.entries,
  };
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleData | null>(null);
  const cancelledRef = useRef(false);

  // Swap fresh data in place (never reset to null on refresh → no flicker; a
  // transient error keeps the last-good data). Stable identity so it can be
  // handed to cards as a "refresh now" callback after they register.
  const refresh = useCallback(() => {
    fetchScheduleData()
      .then((d) => {
        if (!cancelledRef.current) setData(d);
      })
      .catch(() => {
        /* 401 handled by fetchPlayerApi; keep last-good data otherwise */
      });
  }, []);

  useEffect(() => {
    cancelledRef.current = false;
    refresh(); // initial load

    const id = setInterval(() => {
      // Don't poll a backgrounded tab; the visibility listener refreshes on return.
      if (typeof document !== 'undefined' && document.hidden) return;
      refresh();
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelledRef.current = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  if (!data) return null;
  return <ScheduleScreen {...data} onChanged={refresh} />;
}
