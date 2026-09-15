'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getStoredToken } from '@/lib/api';
import { beginSignup, checkNickname, completeSignup } from '@/lib/auth';
import { signupErrorMessage } from '@/lib/signupErrors';
import { LEGAL_DOCS } from '@/data/legal';

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
const CARD =
  'bg-paper border border-line-2 rounded-md p-6 shadow-[0_1px_0_rgba(255,255,255,0.6)_inset,0_6px_14px_-10px_rgba(27,22,18,0.18)]';

export default function RegisterPage() {
  const router = useRouter();
  // The address is claimed first and proved second; no account exists between
  // the two, so this is one screen with two faces rather than two routes.
  const [step, setStep] = useState<'claim' | 'prove'>('claim');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  // Advisory: what the club says about this name while it is being typed.
  const [nicknameHint, setNicknameHint] = useState<string | null>(null);
  const [consentPd, setConsentPd] = useState(false);
  const [consentAck, setConsentAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const consentGiven = consentPd && consentAck;

  useEffect(() => {
    if (getStoredToken()) {
      router.replace('/');
    }
  }, [router]);

  async function onClaim(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    const issue = passwordIssue(password);
    if (issue) {
      setError(issue);
      return;
    }
    if (!consentGiven) {
      setError('Для регистрации необходимо согласиться с обоими документами');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await beginSignup(email, password);
      setStep('prove');
    } catch (err) {
      setError(signupErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function onProve(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await completeSignup(email, code, nickname, password);
      router.replace('/');
    } catch (err) {
      setError(signupErrorMessage(err));
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
            Регистрация
          </div>
        </div>

        {/*
          Two form elements, not one with swapped children. A password manager
          binds what it saved to a particular form: while there is only one, the
          second submit reads to it as a correction of the first, and the code
          replaces the password it was asked to keep. On iOS that password was
          never in the player's head, so the account becomes unreachable to its
          owner while the database is perfectly fine.
        */}
        {step === 'claim' ? (
          <form onSubmit={onClaim} className={CARD}>
            <label className="block">
              <span className={LABEL}>Почта</span>
              <input
                type="email"
                // `username`, not `email`: this is the pairing a password
                // manager reads to bind the strong password to an account.
                autoComplete="username"
                autoCapitalize="none"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={FIELD}
              />
              <span className="mt-1 block text-[11px] text-ink-3">
                На неё придёт код подтверждения. Через неё же восстанавливается пароль
              </span>
            </label>

            <label className="block mt-5">
              <span className={LABEL}>Пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
              />
              <span className="mt-1 block text-[11px] text-ink-3">
                Минимум 8 символов, буква и цифра
              </span>
            </label>

            <div className="mt-6 flex flex-col gap-3">
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
            disabled={submitting || !consentGiven}
            className="mt-6 w-full rounded-md bg-ink text-paper py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            >
            {submitting ? 'Отправляем код…' : 'Получить код'}
            </button>
          </form>
        ) : (
          <form onSubmit={onProve} className={CARD}>
            <p className="text-[13px] leading-relaxed text-ink-2">
              Код отправлен на <span className="font-semibold text-ink">{email}</span>.
              Он действует 10 минут.
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
              <span className={LABEL}>Никнейм</span>
              <input
                type="text"
                autoComplete="nickname"
                required
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setNicknameHint(null);
                }}
                onBlur={async () => {
                  // On leaving the field, not on every keystroke: the point is
                  // to answer before the button, not to chatter at the server.
                  if (nickname.trim().length === 0) return;
                  try {
                    const verdict = await checkNickname(nickname);
                    setNicknameHint(verdict.available ? null : (verdict.error ?? null));
                  } catch {
                    // Advisory only — silence here costs nothing, the write decides.
                  }
                }}
                className={FIELD}
              />
            </label>
            {nicknameHint ? (
              <p className="mt-1 text-[11px] text-danger">{nicknameHint}</p>
            ) : (
              <p className="mt-1 text-[11px] leading-relaxed text-ink-3">
                Так вас будут видеть в клубе. Поменять можно в профиле.
              </p>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-ink-3">
              В письме нет ссылок — только код. Никто из клуба никогда не
              спросит его у вас.
            </p>

            <button
              type="button"
              onClick={() => {
                setStep('claim');
                setCode('');
                setNickname('');
                setNicknameHint(null);
                setError(null);
              }}
              className="mt-4 text-[12px] text-ink underline"
            >
              Изменить почту
            </button>
            {error && (
            <div className="mt-4 text-sm text-crimson" role="alert">
              {error}
            </div>
            )}

            <button
            type="submit"
            // Choosing a name is not optional, so the button says so rather
            // than letting someone press it and be refused. Only emptiness
            // blocks here: whether the name is free is advisory, and the
            // write is what decides it.
            disabled={submitting || nickname.trim().length === 0}
            className="mt-6 w-full rounded-md bg-ink text-paper py-3 text-sm font-bold uppercase tracking-wider disabled:opacity-60"
            >
            {submitting ? 'Создаём…' : 'Зарегистрироваться'}
            </button>
          </form>
        )}

        <p className="mt-5 text-center text-xs text-ink-3 leading-relaxed">
          Уже есть аккаунт?{' '}
          <Link href="/login" className="font-bold text-ink underline">
            Войти
          </Link>
        </p>
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
          href={`/legal/${slug}?standalone=1`}
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
