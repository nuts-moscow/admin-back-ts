'use client';

import { useEffect, useState } from 'react';
import type {
  HallOfFameEntry,
  PlayerSeason,
  PlayerSeasonRatingEntry,
} from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { RatingScreen } from './rating-screen';

interface RatingData {
  seasons: PlayerSeason[];
  initialEntries: PlayerSeasonRatingEntry[];
  hallOfFame: HallOfFameEntry[];
  initialYear: number;
  initialMonth: number;
}

function defaultLabel(year: number, month: number): string {
  const months = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];
  return `${months[month - 1]} ${year}`;
}

export default function RatingPage() {
  const [data, setData] = useState<RatingData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    void Promise.all([
      fetchPlayerApi<{ seasons: PlayerSeason[] }>('/api/player/rating/seasons').catch(() => ({
        seasons: [],
      })),
      fetchPlayerApi<{ entries: PlayerSeasonRatingEntry[] }>(
        `/api/player/rating/season?year=${year}&month=${month}&limit=50`,
      ).catch(() => ({ entries: [] })),
      fetchPlayerApi<{ entries: HallOfFameEntry[] }>('/api/player/hall-of-fame').catch(() => ({
        entries: [],
      })),
    ])
      .then(([seasonsRes, seasonRes, hofRes]) => {
        if (cancelled) return;
        setData({
          seasons:
            seasonsRes.seasons.length > 0
              ? seasonsRes.seasons
              : [{ year, month, label: defaultLabel(year, month), isCurrent: true }],
          initialEntries: seasonRes.entries,
          hallOfFame: hofRes.entries,
          initialYear: year,
          initialMonth: month,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) return null;
  return <RatingScreen {...data} />;
}
