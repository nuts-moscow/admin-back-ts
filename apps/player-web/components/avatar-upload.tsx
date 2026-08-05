'use client';

import { useRef, useState } from 'react';
import { apiBaseUrl, getStoredToken } from '@/lib/api';

export type SubmissionState =
  | { state: 'none' }
  | { state: 'pending'; submissionId: string; submittedAt: string }
  | { state: 'refused' };

interface Props {
  onSubmitted: (submission: SubmissionState) => void;
}

/**
 * The pick-and-upload control.
 *
 * The notice is the point of this component being separate: before a single
 * byte leaves the phone, the player is told who is going to look at the picture
 * and that it will not appear until they do. Uploading is the consent, so the
 * words have to come first — not in a document nobody opens, and not after.
 */
export function AvatarUpload({ onSubmitted }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('image', file);
      const token = getStoredToken();
      // FormData, so no JSON helper here — the browser sets the multipart boundary.
      const res = await fetch(`${apiBaseUrl()}/api/player/avatar`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
        credentials: 'omit',
      });
      const data = (await res.json().catch(() => null)) as
        | { submission?: SubmissionState; error?: string }
        | null;

      if (!res.ok || !data?.submission) {
        setError(data?.error ?? 'Не удалось загрузить фото');
        return;
      }
      onSubmitted(data.submission);
    } catch {
      setError('Не удалось загрузить фото');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>
        Фото проверит администратор клуба — оно появится в профиле только после этого.
      </p>

      <input
        ref={input}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void send(file);
        }}
      />

      <button type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? 'Отправляем…' : 'Загрузить фото'}
      </button>

      {error ? (
        <p role="alert" style={{ fontSize: 13, color: 'var(--danger, #b00)', margin: 0 }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
