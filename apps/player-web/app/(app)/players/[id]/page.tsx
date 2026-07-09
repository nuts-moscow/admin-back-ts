'use client';

import { notFound, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { PlayerPublicProfile, PlayerTournamentHistoryEntry } from '@admin/schemas';
import { PlayerApiError, fetchPlayerApi } from '@/lib/api';
import { PublicProfileScreen } from './public-profile-screen';

interface PublicPlayerData {
  profile: PlayerPublicProfile;
  history: PlayerTournamentHistoryEntry[];
}

export default function PublicPlayerPage() {
  const params = useParams<{ id: string }>();
  const playerId = parseInt(params.id, 10);
  const [data, setData] = useState<PublicPlayerData | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (Number.isNaN(playerId)) {
      setMissing(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const profile = await fetchPlayerApi<PlayerPublicProfile>(
          `/api/player/players/${playerId}/profile`,
        );
        const history = await fetchPlayerApi<{ entries: PlayerTournamentHistoryEntry[] }>(
          `/api/player/players/${playerId}/tournaments/history`,
        ).catch(() => ({ entries: [] }));
        if (cancelled) return;
        setData({ profile, history: history.entries });
      } catch (err) {
        if (err instanceof PlayerApiError && err.status === 404 && !cancelled) {
          setMissing(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  if (missing) notFound();
  if (!data) return null;
  return <PublicProfileScreen profile={data.profile} history={data.history} />;
}
