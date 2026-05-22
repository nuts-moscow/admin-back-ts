import { fetchPlayerApi } from '@/lib/api';
import { requirePlayerSession } from '@/lib/auth';
import type { PlayerTournamentHistoryEntry, PlayerTournamentSummary } from '@admin/schemas';
import { ScheduleScreen } from './schedule-screen';

export const dynamic = 'force-dynamic';

export default async function SchedulePage() {
  await requirePlayerSession();
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
  return (
    <ScheduleScreen
      active={active.tournaments}
      upcoming={upcoming.tournaments}
      history={history.entries}
    />
  );
}
