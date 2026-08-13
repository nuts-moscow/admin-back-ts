'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePlayerSession } from '@/lib/auth';
import {
  bindTelegram,
  mountTelegramWidget,
  telegramBotName,
  unbindTelegram,
} from '@/lib/telegram';

/**
 * Where a player who is already inside installs the second door.
 *
 * This screen is the whole answer to «я уже играю»: the club never guesses
 * that a Telegram belongs to an existing player, so the player says so from
 * within their own session, and their tournament history stays where it is.
 */
export default function TelegramBindingPage() {
  const { session, status } = usePlayerSession();
  const [bound, setBound] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (bound !== null || status === 'loading' || !session) return;
    // The session says nothing about bindings, so the screen starts by
    // assuming none and lets the attempt correct it.
    setBound(false);
  }, [bound, status, session]);

  useEffect(() => {
    const host = widgetRef.current;
    if (!host || bound !== false) return;
    return (
      mountTelegramWidget(host, async (payload) => {
        setError(null);
        setBusy(true);
        try {
          await bindTelegram(payload);
          setBound(true);
        } catch (err) {
          setError(
            err instanceof Error && err.message
              ? err.message
              : 'Не удалось привязать телеграм',
          );
        } finally {
          setBusy(false);
        }
      }) ?? undefined
    );
  }, [bound]);

  async function onUnbind() {
    setBusy(true);
    setError(null);
    try {
      await unbindTelegram();
      setBound(false);
    } catch {
      setError('Не удалось отвязать телеграм');
    } finally {
      setBusy(false);
    }
  }

  if (status === 'loading') return null;

  if (!telegramBotName()) {
    return (
      <main className="px-6 py-10">
        <p className="text-[13px] text-ink-2">Вход через телеграм пока не настроен.</p>
      </main>
    );
  }

  return (
    <main className="px-6 py-10 max-w-sm mx-auto">
      <h1 className="cinzel text-xl text-ink font-semibold">Телеграм</h1>

      {bound ? (
        <>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            Телеграм привязан — в следующий раз можно входить одной кнопкой.
            Пароль и почта продолжают работать как раньше.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onUnbind}
            className="mt-6 w-full rounded-md border border-line-2 py-3 text-sm font-bold uppercase tracking-wider text-ink disabled:opacity-60"
          >
            {busy ? 'Отвязываем…' : 'Отвязать'}
          </button>
        </>
      ) : (
        <>
          <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
            Привяжите телеграм, чтобы входить в этот аккаунт одной кнопкой, без
            пароля и без письма. Аккаунт останется тот же — вся турнирная
            история на месте.
          </p>
          <div ref={widgetRef} className="mt-6 flex justify-center" />
        </>
      )}

      {error && (
        <div className="mt-4 text-sm text-crimson" role="alert">
          {error}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-ink-3">
        <Link href="/profile" className="font-bold text-ink underline">
          Назад в профиль
        </Link>
      </p>
    </main>
  );
}
