'use client';

import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { AvatarUpload, type SubmissionState } from '@/components/avatar-upload';
import { apiBaseUrl, fetchPlayerApi, getStoredToken } from '@/lib/api';

interface Props {
  name: string;
  /** The published address from the profile payload; null means initials. */
  avatarUrl: string | null;
  /** Refetches the profile — the published avatar can change without this component knowing. */
  onChanged?: () => void;
}

/**
 * The avatar block on the player's own profile: what is published, and where
 * their submission stands.
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
export function ProfileAvatar({ name, avatarUrl, onChanged }: Props) {
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
    let revoked: string | null = null;
    const token = getStoredToken();
    void fetch(`${apiBaseUrl()}/api/player/avatar/pending`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'omit',
    })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (!blob) return;
        revoked = URL.createObjectURL(blob);
        setPendingSrc(revoked);
      })
      .catch(() => undefined);

    return () => {
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [submission]);

  async function removeOwn() {
    await fetchPlayerApi('/api/player/avatar', { method: 'DELETE' });
    onChanged?.();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <Avatar name={name} size={84} ring src={avatarUrl} />

      {submission?.state === 'pending' ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {pendingSrc ? <Avatar name={name} size={44} src={pendingSrc} /> : null}
          <span style={{ fontSize: 13, opacity: 0.75 }}>Фото на проверке</span>
        </div>
      ) : null}

      {submission?.state === 'refused' ? (
        // Impersonal on purpose: the club did not accept it, not a named person.
        <span style={{ fontSize: 13, opacity: 0.75 }}>Фото не принято</span>
      ) : null}

      <AvatarUpload
        onSubmitted={(next) => {
          setSubmission(next);
        }}
      />

      {avatarUrl ? (
        <button type="button" onClick={() => void removeOwn()}>
          Убрать фото
        </button>
      ) : null}
    </div>
  );
}
