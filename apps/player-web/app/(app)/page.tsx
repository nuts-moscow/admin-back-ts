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

/**
 * How often the home screen silently reconciles its data with the server.
 * The blind timer ticks locally between polls (see useLevelCountdown); this
 * keeps player counts, blinds, the current level, and the timer in sync
 * without a visible reload.
 */
const POLL_INTERVAL_MS = 20_000;

async function fetchHomeData(): Promise<HomeData> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const [me, active, upcoming, season] = await Promise.all([
    fetchPlayerApi<PlayerMeProfile>('/api/player/me'),
    fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
      '/api/player/tournaments?status=in_progress',
    ).catch(() => ({ tournaments: [] })),
    fetchPlayerApi<{ tournaments: PlayerTournamentSummary[] }>(
      '/api/player/tournaments/upcoming?limit=5',
    ).catch(() => ({ tournaments: [] })),
    fetchPlayerApi<{ entries: PlayerSeasonRatingEntry[] }>(
      `/api/player/rating/season?year=${year}&month=${month}&limit=6`,
    ).catch(() => ({ entries: [] })),
  ]);
  return {
    me,
    active: active.tournaments,
    upcoming: upcoming.tournaments,
    leaders: season.entries,
  };
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);

  useEffect(() => {
    let cancelled = false;

    // Swap fresh data in place. We never reset to null on refresh, so the
    // screen keeps showing the current data (no flicker) until the next
    // response arrives; a transient error keeps the last-good data.
    const refresh = () => {
      fetchHomeData()
        .then((d) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          /* 401 handled by fetchPlayerApi; keep last-good data otherwise */
        });
    };

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
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!data) return null;
  return <HomeScreen {...data} />;
}
