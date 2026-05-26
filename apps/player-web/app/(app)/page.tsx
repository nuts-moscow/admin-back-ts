'use client';

import { useEffect, useState } from 'react';
import type {
  PlayerMeProfile,
  PlayerSeasonRatingEntry,
  PlayerTournamentSummary,
} from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { HomeScreen } from './home-screen';

interface HomeData {
  me: PlayerMeProfile;
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  leaders: PlayerSeasonRatingEntry[];
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    void Promise.all([
      fetchPlayerApi<PlayerMeProfile>('/api/player/me'),
      fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
        '/api/player/tournaments?status=in_progress',
      ).catch(() => ({ tournaments: [] })),
      fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
        '/api/player/tournaments/upcoming?limit=4',
      ).catch(() => ({ tournaments: [] })),
      fetchPlayerApi<{ entries: PlayerSeasonRatingEntry[] }>(
        `/api/player/rating/season?year=${year}&month=${month}&limit=5`,
      ).catch(() => ({ entries: [] })),
    ])
      .then(([me, active, upcoming, season]) => {
        if (cancelled) return;
        setData({
          me,
          active: active.tournaments,
          upcoming: upcoming.tournaments,
          leaders: season.entries,
        });
      })
      .catch(() => {
        /* errors handled by 401-redirect in fetchPlayerApi or shown silently for v1 */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;
  return <HomeScreen {...data} />;
}
