import { notFound } from 'next/navigation';
import type {
  PlayerMyTournamentState,
  PlayerTournamentDetail,
  PlayerTournamentPlayer,
  PlayerTournamentTable,
} from '@admin/schemas';
import { fetchPlayerApi, PlayerApiError } from '@/lib/api';
import { requirePlayerSession } from '@/lib/auth';
import { TournamentScreen } from './tournament-screen';

export const dynamic = 'force-dynamic';

export default async function TournamentPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePlayerSession();
  const { id } = await params;
  const tournamentId = parseInt(id, 10);
  if (Number.isNaN(tournamentId)) notFound();

  let detail: PlayerTournamentDetail;
  try {
    detail = await fetchPlayerApi<PlayerTournamentDetail>(`/api/player/tournaments/${tournamentId}`);
  } catch (err) {
    if (err instanceof PlayerApiError && err.status === 404) notFound();
    throw err;
  }
  const [playersRes, tablesRes, myState] = await Promise.all([
    fetchPlayerApi<{ players: PlayerTournamentPlayer[] }>(
      `/api/player/tournaments/${tournamentId}/players`,
    ).catch(() => ({ players: [] })),
    fetchPlayerApi<{ tables: PlayerTournamentTable[] }>(
      `/api/player/tournaments/${tournamentId}/tables`,
    ).catch(() => ({ tables: [] })),
    fetchPlayerApi<PlayerMyTournamentState>(
      `/api/player/me/tournaments/${tournamentId}/state`,
    ).catch(() => null),
  ]);

  return (
    <TournamentScreen
      detail={detail}
      players={playersRes.players}
      tables={tablesRes.tables}
      myState={myState}
    />
  );
}
