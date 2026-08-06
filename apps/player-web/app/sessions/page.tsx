'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { endSessions, usePlayerSession } from '@/lib/auth';

/**
 * A player's own sessions. Ending them costs one call and no letter — before
 * this screen existed, the only way to lock someone out of your account was a
 * full password reset with a code.
 */
export default function SessionsPage() {
  const router = useRouter();
  const { status, session } = usePlayerSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function end(scope: 'current' | 'all') {
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      await endSessions(scope);
      router.replace('/login');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сетевая ошибка');
      setBusy(false);
    }
  }

  if (status === 'loading') return null;

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="cinzel text-2xl text-ink font-semibold">NUTS Family</div>
          <div className="text-ink-3 text-xs mt-2 uppercase tracking-widest font-semibold">
            Сессии
          </div>
        </div>

        <div className="bg-paper border border-line-2 rounded-md p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_14px_-10px_rgba(27,22,18,0.18)]">
          <p className="text-[13px] leading-relaxed text-ink-2">
            Вход выполнен как{' '}
            <span className="font-semibold text-ink">
              {session?.email ?? session?.login ?? session?.nickname}
            </span>
            .
          </p>

          <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
            Если вы оставили вход на чужом устройстве, завершите сеансы. Пароль
            при этом не меняется.
          </p>

          {error && (
            <div className="mt-4 text-sm text-crimson" role="alert">
              {error}
            </div>
          )}

          <button
            type="button"
            disabled={busy}
            onClick={() => end('current')}
            className="mt-6 w-full rounded-md border border-line-2 py-3 text-sm font-bold uppercase tracking-wider text-ink disabled:opacity-60"
          >
            Выйти на этом устройстве
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => end('all')}
            className="mt-3 w-full rounded-md bg-ink text-paper py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
          >
            Выйти на всех устройствах
          </button>

          <p className="mt-5 text-center text-xs text-ink-3 leading-relaxed">
            <Link href="/" className="font-bold text-ink underline">
              Вернуться
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
