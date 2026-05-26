'use client';

import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  PlayerMyTournamentState,
  PlayerTournamentDetail,
  PlayerTournamentPlayer,
  PlayerTournamentTable,
} from '@admin/schemas';
import { PlayerApiError, fetchPlayerApi } from '@/lib/api';
import { TournamentScreen } from './tournament-screen';

interface TournamentData {
  detail: PlayerTournamentDetail;
  players: PlayerTournamentPlayer[];
  tables: PlayerTournamentTable[];
  myState: PlayerMyTournamentState | null;
}

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = parseInt(params.id, 10);
  const [data, setData] = useState<TournamentData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (Number.isNaN(tournamentId)) {
      setMissing(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const detail = await fetchPlayerApi<PlayerTournamentDetail>(
          `/api/player/tournaments/${tournamentId}`,
        );
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
        if (cancelled) return;
        setData({
          detail,
          players: playersRes.players,
          tables: tablesRes.tables,
          myState,
        });
      } catch (err) {
        if (err instanceof PlayerApiError && err.status === 404) {
          if (!cancelled) setMissing(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tournamentId]);

  if (missing) notFound();
  if (!data) return null;
  return (
    <TournamentScreen
      detail={data.detail}
      players={data.players}
      tables={data.tables}
      myState={data.myState}
    />
  );
}
