'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PlayerMeProfile,
  PlayerSeasonRatingEntry,
  PlayerTournamentSummary,
  SeasonFinalAnnouncement,
} from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { HomeScreen } from './home-screen';

interface HomeData {
  me: PlayerMeProfile;
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  leaders: PlayerSeasonRatingEntry[];
  seasonFinal: SeasonFinalAnnouncement;
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
  const [me, active, upcoming, season, seasonFinal] = await Promise.all([
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
    fetchPlayerApi<SeasonFinalAnnouncement>('/api/player/season-final').catch(() => ({
      date: null,
    })),
  ]);
  return {
    me,
    active: active.tournaments,
    upcoming: upcoming.tournaments,
    leaders: season.entries,
    seasonFinal,
  };
}

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);
  const cancelledRef = useRef(false);

  // Swap fresh data in place (no null-reset → no flicker; last-good on error).
  // Stable identity so it can be handed down as an "refresh now" callback after
  // a register action from the hero card.
  const refresh = useCallback(() => {
    fetchHomeData()
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
  return <HomeScreen {...data} onChanged={refresh} />;
}
