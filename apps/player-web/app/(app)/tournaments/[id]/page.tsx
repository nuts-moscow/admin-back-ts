'use client';

import { notFound, useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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

/**
 * How often the tournament page silently re-fetches, so the live player count,
 * roster, and clock stay current as others register or get eliminated. Data is
 * swapped in place (no flicker; the blind timer re-syncs via useLevelCountdown).
 */
const POLL_INTERVAL_MS = 15_000;

export default function TournamentPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = parseInt(params.id, 10);
  const [data, setData] = useState<TournamentData | null>(null);
  const [missing, setMissing] = useState(false);
  // The effect's load(), published so actions (register/cancel) can refetch
  // immediately instead of waiting out the poll interval.
  const reloadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (Number.isNaN(tournamentId)) {
      setMissing(true);
      return;
    }
    let cancelled = false;

    // `initial` lets the first load surface a 404 (notFound); polls keep the
    // last-good data on any error rather than blanking the page.
    const load = async (initial: boolean) => {
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
        if (initial && err instanceof PlayerApiError && err.status === 404) {
          if (!cancelled) setMissing(true);
        }
        // polls: keep the last-good data on transient errors
      }
    };

    reloadRef.current = () => load(false);
    load(true); // initial load

    const id = setInterval(() => {
      // Don't poll a backgrounded tab; the visibility listener refreshes on return.
      if (typeof document !== 'undefined' && document.hidden) return;
      load(false);
    }, POLL_INTERVAL_MS);

    const onVisible = () => {
      if (!document.hidden) load(false);
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      reloadRef.current = null;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
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
      onChanged={() => reloadRef.current?.()}
    />
  );
}
