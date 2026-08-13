'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getStoredToken } from '@/lib/api';
import { loginPlayer } from '@/lib/auth';
import {
  mountTelegramWidget,
  signInWithTelegram,
  telegramBotName,
  type TelegramPayload,
} from '@/lib/telegram';

export default function LoginPage() {
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Proved, and bound to nobody. Opening an account this way is deliberately
  // not offered yet: until it is, the only honest thing to say is that this
  // Telegram is not attached to anything here, and where to attach it.
  const [unbound, setUnbound] = useState<TelegramPayload | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);

  // If user is already logged in, bounce home.
  useEffect(() => {
    if (getStoredToken()) {
      router.replace('/');
    }
  }, [router]);

  useEffect(() => {
    const host = widgetRef.current;
    if (!host || unbound) return;
    return (
      mountTelegramWidget(host, async (payload) => {
        setError(null);
        try {
          const outcome = await signInWithTelegram(payload);
          if (outcome.status === 'signed-in') {
            router.replace('/');
            return;
          }
          if (outcome.status === 'unavailable') {
            setError('Вход через телеграм сейчас недоступен');
            return;
          }
          // Proved, and bound to nobody. We do not guess who this is.
          setUnbound(payload);
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Сетевая ошибка');
        }
      }) ?? undefined
    );
  }, [router, unbound]);


  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await loginPlayer(login, password);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сетевая ошибка');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="cinzel text-2xl text-ink font-semibold">NUTS Family</div>
          <div className="text-ink-3 text-xs mt-2 uppercase tracking-widest font-semibold">
            Player app
          </div>
        </div>

        {unbound ? (
          <div className="bg-paper border border-line-2 rounded-md p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_14px_-10px_rgba(27,22,18,0.18)]">
            <p className="text-[13px] leading-relaxed text-ink-2">
              Телеграм подтверждён, но он пока ни к чему не привязан — и сам по
              себе аккаунт не заводит.
            </p>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-2">
              Если вы уже играете в клубе, войдите как обычно и привяжите
              телеграм в профиле: дальше можно будет входить одной кнопкой, а
              турнирная история останется на месте. Если аккаунта ещё нет —
              зарегистрируйтесь по почте.
            </p>

            {error && (
              <div className="mt-4 text-sm text-crimson" role="alert">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setUnbound(null);
                setError(null);
              }}
              className="mt-6 w-full rounded-md bg-ink text-paper py-3 text-sm font-bold uppercase tracking-wider"
            >
              Войти как обычно
            </button>

            <p className="mt-4 text-center text-xs text-ink-3 leading-relaxed">
              Нет аккаунта?{' '}
              <Link href="/register" className="font-bold text-ink underline">
                Зарегистрироваться по почте
              </Link>
            </p>
          </div>
        ) : (
        <form
          onSubmit={onSubmit}
          className="bg-paper border border-line-2 rounded-md p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_14px_-10px_rgba(27,22,18,0.18)]"
        >
          <label className="block">
            <span className="text-xs uppercase tracking-wider font-semibold text-ink-3">
              Почта
            </span>
            <input
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              className="mt-1 block w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink"
            />
            <span className="mt-1 block text-[11px] text-ink-3">
              Аккаунты, созданные до перехода на почту, входят по своему логину
            </span>
          </label>

          <label className="block mt-5">
            <span className="text-xs uppercase tracking-wider font-semibold text-ink-3">Пароль</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink"
            />
          </label>

          {error && (
            <div className="mt-4 text-sm text-crimson" role="alert">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-6 w-full rounded-md bg-ink text-paper py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
          >
            {submitting ? 'Входим…' : 'Войти'}
          </button>

          <p className="mt-5 text-center text-xs text-ink-3 leading-relaxed">
            <Link href="/password" className="font-bold text-ink underline">
              Забыли пароль?
            </Link>
          </p>

          <p className="mt-3 text-center text-xs text-ink-3 leading-relaxed">
            Нет аккаунта?{' '}
            <Link href="/register" className="font-bold text-ink underline">
              Зарегистрироваться
            </Link>
          </p>

          {telegramBotName() && (
            <div className="mt-6 border-t border-line pt-5">
              <p className="text-center text-[11px] uppercase tracking-wider font-semibold text-ink-3">
                или
              </p>
              <div ref={widgetRef} className="mt-3 flex justify-center" />
            </div>
          )}
        </form>
        )}
      </div>
    </main>
  );
}

