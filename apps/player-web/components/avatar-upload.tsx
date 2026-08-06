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
    <div className="flex flex-col gap-1 min-w-0">
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

      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="border-0 cursor-pointer font-bold uppercase self-start"
        style={{
          background: 'rgba(251,245,233,0.1)',
          borderRadius: 999,
          padding: '4px 10px',
          fontSize: 9,
          letterSpacing: 0.5,
          color: 'rgba(251,245,233,0.7)',
          fontFamily: 'inherit',
        }}
      >
        {busy ? 'Отправляем…' : 'Загрузить фото'}
      </button>

      {/* The notice sits with the control, before anything is sent: uploading is
          the consent, so the words have to be readable at the moment of it. */}
      <p className="text-[11px] m-0" style={{ color: 'rgba(251,245,233,0.5)' }}>
        Фото проверит администратор — оно появится в профиле после этого.
      </p>

      {error ? (
        <p role="alert" className="text-[11px] m-0" style={{ color: '#e0876f' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
