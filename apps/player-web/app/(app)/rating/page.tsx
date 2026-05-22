import type {
  HallOfFameEntry,
  PlayerEloLiteEntry,
  PlayerSeason,
  PlayerSeasonRatingEntry,
} from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { requirePlayerSession } from '@/lib/auth';
import { RatingScreen } from './rating-screen';

export const dynamic = 'force-dynamic';

export default async function RatingPage() {
  await requirePlayerSession();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [seasonsRes, seasonRes, eloRes, hofRes] = await Promise.all([
    fetchPlayerApi<{ seasons: PlayerSeason[] }>('/api/player/rating/seasons').catch(() => ({ seasons: [] })),
    fetchPlayerApi<{ entries: PlayerSeasonRatingEntry[] }>(
      `/api/player/rating/season?year=${year}&month=${month}&limit=50`,
    ).catch(() => ({ entries: [] })),
    fetchPlayerApi<{ entries: PlayerEloLiteEntry[] }>(
      `/api/player/rating/elo-lite?year=${year}&month=${month}&limit=50`,
    ).catch(() => ({ entries: [] })),
    fetchPlayerApi<{ entries: HallOfFameEntry[] }>('/api/player/hall-of-fame').catch(() => ({
      entries: [],
    })),
  ]);

  return (
    <RatingScreen
      seasons={
        seasonsRes.seasons.length > 0
          ? seasonsRes.seasons
          : [{ year, month, label: defaultLabel(year, month), isCurrent: true }]
      }
      initialEntries={seasonRes.entries}
      initialElo={eloRes.entries}
      hallOfFame={hofRes.entries}
      initialYear={year}
      initialMonth={month}
    />
  );
}

function defaultLabel(year: number, month: number): string {
  const months = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  return `${months[month - 1]} '${String(year).slice(-2)}`;
}
