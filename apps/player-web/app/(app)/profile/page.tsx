'use client';

import { useEffect, useState } from 'react';
import type { PlayerMeProfile, PlayerTournamentHistoryEntry } from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { usePlayerSession } from '@/lib/auth';
import { ProfileScreen } from './profile-screen';

interface ProfileData {
  me: PlayerMeProfile;
  history: PlayerTournamentHistoryEntry[];
}

export default function ProfilePage() {
  const { session } = usePlayerSession();
  const [data, setData] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    void Promise.all([
      fetchPlayerApi<PlayerMeProfile>('/api/player/me'),
      fetchPlayerApi<{ entries: PlayerTournamentHistoryEntry[] }>(
        '/api/player/me/tournaments/history',
      ).catch(() => ({ entries: [] })),
    ])
      .then(([me, history]) => {
        if (cancelled) return;
        setData({ me: { ...me, email: session.email }, history: history.entries });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session]);

  if (!data) return null;
  return <ProfileScreen me={data.me} history={data.history} />;
}
