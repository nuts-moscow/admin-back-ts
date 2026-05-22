import type { PlayerMeProfile, PlayerTournamentHistoryEntry } from '@admin/schemas';
import { fetchPlayerApi } from '@/lib/api';
import { requirePlayerSession } from '@/lib/auth';
import { ProfileScreen } from './profile-screen';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await requirePlayerSession();
  const [me, history] = await Promise.all([
    fetchPlayerApi<PlayerMeProfile>('/api/player/me'),
    fetchPlayerApi<{ entries: PlayerTournamentHistoryEntry[] }>(
      '/api/player/me/tournaments/history',
    ).catch(() => ({ entries: [] })),
  ]);
  return <ProfileScreen me={{ ...me, email: session.email }} history={history.entries} />;
}
