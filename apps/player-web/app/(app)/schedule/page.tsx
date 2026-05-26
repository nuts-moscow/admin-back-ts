'use client';

import { useEffect, useState } from 'react';
import type { PlayerTournamentHistoryEntry, PlayerTournamentSummary } from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { ScheduleScreen } from './schedule-screen';

interface ScheduleData {
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  history: PlayerTournamentHistoryEntry[];
}

export default function SchedulePage() {
  const [data, setData] = useState<ScheduleData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
        '/api/player/tournaments?status=in_progress',
      ).catch(() => ({ tournaments: [] })),
      fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
        '/api/player/tournaments/upcoming?limit=50',
      ).catch(() => ({ tournaments: [] })),
      fetchPlayerApi<{ entries: PlayerTournamentHistoryEntry[] }>(
        '/api/player/me/tournaments/history',
      ).catch(() => ({ entries: [] })),
    ])
      .then(([active, upcoming, history]) => {
        if (cancelled) return;
        setData({
          active: active.tournaments,
          upcoming: upcoming.tournaments,
          history: history.entries,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;
  return <ScheduleScreen {...data} />;
}
