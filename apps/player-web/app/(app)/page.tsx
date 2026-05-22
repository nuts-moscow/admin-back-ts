import { fetchPlayerApi } from '@/lib/api';
import { requirePlayerSession } from '@/lib/auth';
import type {
  PlayerMeProfile,
  PlayerSeasonRatingEntry,
  PlayerTournamentSummary,
} from '@admin/schemas';
import { HomeScreen } from './home-screen';

export const dynamic = 'force-dynamic';

async function loadHomeData(year: number, month: number) {
  const [me, active, upcoming, season] = await Promise.all([
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
  ]);
  return { me, active: active.tournaments, upcoming: upcoming.tournaments, leaders: season.entries };
}

export default async function HomePage() {
  await requirePlayerSession();
  const now = new Date();
  const data = await loadHomeData(now.getFullYear(), now.getMonth() + 1);
  return <HomeScreen {...data} />;
}
