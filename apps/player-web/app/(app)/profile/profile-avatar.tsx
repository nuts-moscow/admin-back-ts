'use client';

import { useCallback, useEffect, useState } from 'react';
import { AvatarUpload, type SubmissionState } from '@/components/avatar-upload';
import { apiBaseUrl, fetchPlayerApi, getStoredToken } from '@/lib/api';

interface Props {
  /** True when the player has a published avatar — only then is there anything to remove. */
  hasAvatar: boolean;
  /** Refetches the profile: an approval changes the published avatar without this block knowing. */
  onChanged?: () => void;
}

/**
 * Where the player's submission stands, and how to send a new one.
 *
 * This is a block of its own, below the identity row, rather than something
 * wrapped around the avatar itself: the circle up there is overlaid with the
 * medal badge and sits in a fixed-height flex row, so anything taller than the
 * avatar pushes the nickname off the screen.
 *
 * Waiting is invisible everywhere else by design — every screen keeps drawing
 * the approved picture — so without this the feature would read as broken to
 * the one person who used it. Three states, and the third is the absence of a
 * state: once published it is simply their avatar.
 *
 * The state is read from the backend on every mount rather than remembered in
 * the browser: a verdict arrives while nobody is looking, and a reload must
 * show it.
 */
export function ProfileAvatarPanel({ hasAvatar, onChanged }: Props) {
  const [submission, setSubmission] = useState<SubmissionState | null>(null);
  const [pendingSrc, setPendingSrc] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchPlayerApi<{ submission: SubmissionState }>('/api/player/avatar');
      setSubmission(data.submission);
    } catch {
      setSubmission({ state: 'none' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The waiting picture is behind an authenticated route, so it cannot be an
  // `<img src>` — the browser would send no token. Fetch it and hold a blob URL.
  useEffect(() => {
    if (submission?.state !== 'pending') {
      setPendingSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    const token = getStoredToken();
    void fetch(`${apiBaseUrl()}/api/player/avatar/pending`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'omit',
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        objectUrl = URL.createObjectURL(blob);
        setPendingSrc(objectUrl);
      })
      .catch(() => undefined);

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [submission]);

  async function removeOwn() {
    await fetchPlayerApi('/api/player/avatar', { method: 'DELETE' });
    onChanged?.();
  }

  return (
    <div className="mt-3 flex items-center gap-3">
      {submission?.state === 'pending' && pendingSrc ? (
        // A thumbnail, not a second avatar: what is waiting, at a size that
        // cannot be mistaken for what is published.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pendingSrc}
          alt=""
          width={36}
          height={36}
          style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : null}

      <div className="flex-1 min-w-0">
        {submission?.state === 'pending' ? (
          <div className="text-[11px]" style={{ color: 'rgba(251,245,233,0.6)' }}>
            Фото на проверке
          </div>
        ) : null}
        {submission?.state === 'refused' ? (
          // Impersonal on purpose: the club did not accept it, not a named person.
          <div className="text-[11px]" style={{ color: 'rgba(251,245,233,0.6)' }}>
            Фото не принято
          </div>
        ) : null}

        <AvatarUpload onSubmitted={setSubmission} />
      </div>

      {hasAvatar ? (
        <button
          type="button"
          onClick={() => void removeOwn()}
          className="border-0 cursor-pointer font-bold uppercase"
          style={{
            background: 'rgba(251,245,233,0.1)',
            borderRadius: 999,
            padding: '4px 10px',
            fontSize: 9,
            letterSpacing: 0.5,
            color: 'rgba(251,245,233,0.7)',
            fontFamily: 'inherit',
            flexShrink: 0,
          }}
        >
          Убрать
        </button>
      ) : null}
    </div>
  );
}
