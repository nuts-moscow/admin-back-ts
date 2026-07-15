'use client';

import { useEffect, useRef, useState } from 'react';
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
  // Published loader so profile edits (e.g. nickname) can refetch at once.
  const reloadRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const load = () => Promise.all([
      fetchPlayerApi<PlayerMeProfile>('/api/player/me'),
      fetchPlayerApi<{ entries: PlayerTournamentHistoryEntry[] }>(
        '/api/player/me/tournaments/history',
      ).catch(() => ({ entries: [] })),
    ])
      .then(([me, history]) => {
        if (cancelled) return;
        setData({ me: { ...me, email: session.email ?? '' }, history: history.entries });
      })
      .catch(() => undefined);
    reloadRef.current = () => void load();
    void load();
    return () => {
      cancelled = true;
      reloadRef.current = null;
    };
  }, [session]);

  if (!data) return null;
  return <ProfileScreen me={data.me} history={data.history} onChanged={() => reloadRef.current?.()} />;
}
