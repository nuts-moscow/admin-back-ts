'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { getStoredToken } from '@/lib/api';
import { loginPlayer } from '@/lib/auth';
import { LEGAL_DOCS } from '@/data/legal';
import {
  mountTelegramWidget,
  openAccountWithTelegram,
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

  // The proved-but-unbound payload, held while the person answers the one
  // question the system is forbidden to answer for them: is this a new player,
  // or someone the club already knows arriving by a new door.
  const [unbound, setUnbound] = useState<TelegramPayload | null>(null);
  const [nickname, setNickname] = useState('');
  const [consentPd, setConsentPd] = useState(false);
  const [consentAck, setConsentAck] = useState(false);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const consentGiven = consentPd && consentAck;

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

  async function onOpenAccount(e: React.FormEvent) {
    e.preventDefault();
    if (!unbound || submitting || !consentGiven) return;
    setError(null);
    setSubmitting(true);
    try {
      await openAccountWithTelegram(unbound, nickname);
      router.replace('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сетевая ошибка');
    } finally {
      setSubmitting(false);
    }
  }

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
          <form
            onSubmit={onOpenAccount}
            className="bg-paper border border-line-2 rounded-md p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_14px_-10px_rgba(27,22,18,0.18)]"
          >
            <p className="text-[13px] leading-relaxed text-ink-2">
              Телеграм подтверждён, но он пока ни к чему не привязан. Мы не
              угадываем: скажите сами, вы здесь впервые или уже играете в клубе.
            </p>

            <div className="mt-6 border-t border-line pt-5">
              <div className="text-xs uppercase tracking-wider font-semibold text-ink-3">
                Я здесь впервые
              </div>
              <label className="block mt-3">
                <span className="text-xs uppercase tracking-wider font-semibold text-ink-3">
                  Никнейм
                </span>
                <input
                  type="text"
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="mt-1 block w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink"
                />
              </label>

              <div className="mt-5 flex flex-col gap-3">
                <ConsentRow
                  checked={consentPd}
                  onChange={setConsentPd}
                  slug="consent-pd"
                  prefix="Я даю"
                  linkText={LEGAL_DOCS['consent-pd']!.short}
                />
                <ConsentRow
                  checked={consentAck}
                  onChange={setConsentAck}
                  slug="acknowledgment"
                  prefix="Я ознакомлен(а) с"
                  linkText={LEGAL_DOCS['acknowledgment']!.short}
                />
              </div>

              {error && (
                <div className="mt-4 text-sm text-crimson" role="alert">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !consentGiven || nickname.trim() === ''}
                className="mt-5 w-full rounded-md bg-ink text-paper py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
              >
                {submitting ? 'Создаём…' : 'Создать аккаунт'}
              </button>
            </div>

            <div className="mt-6 border-t border-line pt-5">
              <div className="text-xs uppercase tracking-wider font-semibold text-ink-3">
                Я уже играю в клубе
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-2">
                Тогда не создавайте второй аккаунт — войдите как обычно и
                привяжите телеграм в профиле, чтобы дальше входить одной
                кнопкой. Турнирная история останется на месте.
              </p>
              <button
                type="button"
                onClick={() => {
                  setUnbound(null);
                  setError(null);
                }}
                className="mt-4 w-full rounded-md border border-line-2 py-3 text-sm font-bold uppercase tracking-wider text-ink"
              >
                Войти как обычно
              </button>
            </div>
          </form>
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

function ConsentRow({
  checked,
  onChange,
  slug,
  prefix,
  linkText,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  slug: string;
  prefix: string;
  linkText: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink)]"
      />
      <span className="text-[12px] leading-snug text-ink-2">
        {prefix}{' '}
        <Link
          href={`/legal/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink underline"
          onClick={(e) => e.stopPropagation()}
        >
          {linkText}
        </Link>
      </span>
    </label>
  );
}
