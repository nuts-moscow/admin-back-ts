'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { requestPasswordReset, resetPassword } from '@/lib/auth';

function passwordIssue(password: string): string | null {
  if (password.length < 8) return 'Пароль — минимум 8 символов';
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Пароль должен содержать букву и цифру';
  }
  return null;
}

const FIELD =
  'mt-1 block w-full border-b border-line bg-transparent py-2 text-ink focus:outline-none focus:border-ink';
const LABEL = 'text-xs uppercase tracking-wider font-semibold text-ink-3';

/**
 * Recovering a forgotten password. Reachable without signing in — a player
 * who has forgotten their password has no grant to present.
 */
export default function PasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'ask' | 'set'>('ask');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onAsk(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      // The backend answers the same for a known and an unknown address, so
      // this screen must not claim the account exists.
      setStep('set');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Сетевая ошибка');
    } finally {
      setSubmitting(false);
    }
  }

  async function onSet(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const issue = passwordIssue(newPassword);
    if (issue) {
      setError(issue);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(email, code, newPassword);
      // Every grant is gone, this device's included: sign in again.
      router.replace('/login');
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
            Восстановление пароля
          </div>
        </div>

        <form
          onSubmit={step === 'ask' ? onAsk : onSet}
          className="bg-paper border border-line-2 rounded-md p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_14px_-10px_rgba(27,22,18,0.18)]"
        >
          {step === 'ask' ? (
            <>
              <label className="block">
                <span className={LABEL}>Почта</span>
                <input
                  type="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={FIELD}
                />
              </label>
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
                Если на этот адрес зарегистрирован аккаунт, на него придёт код.
              </p>
            </>
          ) : (
            <>
              <p className="text-[13px] leading-relaxed text-ink-2">
                Если аккаунт на <span className="font-semibold text-ink">{email}</span>{' '}
                существует, код уже отправлен. Он действует 10 минут.
              </p>

              <label className="block mt-5">
                <span className={LABEL}>Код из письма</span>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={FIELD}
                />
              </label>

              <label className="block mt-5">
                <span className={LABEL}>Новый пароль</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={FIELD}
                />
                <span className="mt-1 block text-[11px] text-ink-3">
                  Минимум 8 символов, буква и цифра
                </span>
              </label>

              <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
                После смены пароля вход на всех устройствах будет сброшен.
              </p>
            </>
          )}

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
            {submitting
              ? 'Отправляем…'
              : step === 'ask'
                ? 'Получить код'
                : 'Сменить пароль'}
          </button>

          <p className="mt-5 text-center text-xs text-ink-3 leading-relaxed">
            <Link href="/login" className="font-bold text-ink underline">
              Вернуться ко входу
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
