'use client';

import type { PlayerLoginResponse } from '@admin/schemas';
import { apiBaseUrl, fetchPlayerApi, setStoredToken } from './api';
import { REQUIRED_CONSENTS } from '@/data/legal';

/**
 * What the widget hands back: a flat bag of strings with a signature over all
 * of them. It is passed on untouched — every field is part of what was signed,
 * so picking fields out here would break the proof the backend has to redo.
 */
export type TelegramPayload = Record<string, string>;

/** The bot the widget belongs to. Public by nature: it is the bot's @name. */
export function telegramBotName(): string | null {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT || null;
}

const WIDGET_SRC = 'https://telegram.org/js/telegram-widget.js?22';

/**
 * Mounts Telegram's own button into `container`. The widget insists on a
 * global callback, so one is installed under a name tied to this mount and
 * removed with it — two screens can offer the button without fighting.
 *
 * Returns a teardown, or null when no bot is configured, in which case the
 * caller should render nothing: a button that cannot work is worse than none.
 */
export function mountTelegramWidget(
  container: HTMLElement,
  onAuth: (payload: TelegramPayload) => void,
  options: { size?: 'large' | 'medium' | 'small'; requestAccess?: boolean } = {},
): (() => void) | null {
  const bot = telegramBotName();
  if (!bot) return null;

  const callbackName = `onTelegramAuth_${Math.random().toString(36).slice(2)}`;
  (window as unknown as Record<string, unknown>)[callbackName] = (user: unknown) => {
    if (!user || typeof user !== 'object') return;
    const payload: TelegramPayload = {};
    for (const [key, value] of Object.entries(user as Record<string, unknown>)) {
      if (value != null) payload[key] = String(value);
    }
    onAuth(payload);
  };

  const script = document.createElement('script');
  script.async = true;
  script.src = WIDGET_SRC;
  script.setAttribute('data-telegram-login', bot);
  script.setAttribute('data-size', options.size ?? 'large');
  script.setAttribute('data-onauth', `${callbackName}(user)`);
  if (options.requestAccess) script.setAttribute('data-request-access', 'write');
  container.appendChild(script);

  return () => {
    delete (window as unknown as Record<string, unknown>)[callbackName];
    container.replaceChildren();
  };
}

/**
 * The three answers signing in by Telegram can have. `unbound` is not an
 * error: the payload proved itself and simply belongs to nobody here yet, and
 * everything the fork screen does hangs off telling it apart from a failure.
 */
export type TelegramSignInOutcome =
  | { status: 'signed-in'; session: PlayerLoginResponse }
  | { status: 'unbound' }
  | { status: 'unavailable' };

export async function signInWithTelegram(
  payload: TelegramPayload,
): Promise<TelegramSignInOutcome> {
  const res = await fetch(`${apiBaseUrl()}/api/player-auth/telegram`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload }),
    credentials: 'omit',
  });

  if (res.status === 409) return { status: 'unbound' };
  if (res.status === 404) return { status: 'unavailable' };

  const data = (await res.json().catch(() => null)) as PlayerLoginResponse | null;
  if (!res.ok || !data || typeof data.token !== 'string') {
    throw new Error('Не удалось войти через телеграм');
  }
  setStoredToken(data.token);
  return { status: 'signed-in', session: data };
}

/**
 * The deliberate act, and the only call here that creates anything. Consents
 * travel with it because an account without them must not exist — the same
 * rule the mail signup obeys.
 */
export async function openAccountWithTelegram(
  payload: TelegramPayload,
  nickname: string,
): Promise<PlayerLoginResponse> {
  const res = await fetch(`${apiBaseUrl()}/api/player-auth/telegram/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, nickname: nickname.trim(), consents: REQUIRED_CONSENTS }),
    credentials: 'omit',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : 'Не удалось создать аккаунт';
    throw new Error(message);
  }
  if (!data || typeof data.token !== 'string') throw new Error('Bad response');
  setStoredToken(data.token);
  return data as PlayerLoginResponse;
}

/** Installed from inside: this call only works with a live session. */
export function bindTelegram(payload: TelegramPayload): Promise<void> {
  return fetchPlayerApi('/api/player-auth/telegram/bind', {
    method: 'POST',
    body: { payload },
  }).then(() => undefined);
}

export function unbindTelegram(): Promise<void> {
  return fetchPlayerApi('/api/player-auth/telegram/bind', { method: 'DELETE' }).then(
    () => undefined,
  );
}
