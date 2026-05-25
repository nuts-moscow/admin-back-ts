import type { ReactNode } from 'react';

type Tone = 'default' | 'dark' | 'live' | 'gold' | 'soft';

const TONES: Record<Tone, { bg: string; c: string }> = {
  default: { bg: 'rgba(27,22,18,0.06)', c: 'var(--ink-2)' },
  dark: { bg: 'var(--ink)', c: 'var(--paper)' },
  live: { bg: 'rgba(122,46,46,0.12)', c: 'var(--crimson)' },
  gold: { bg: 'rgba(181,138,60,0.16)', c: 'var(--gold-2)' },
  soft: { bg: 'rgba(255,255,255,0.5)', c: 'var(--ink-2)' },
};

export function Pill({
  children,
  tone = 'default',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  const t = TONES[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        borderRadius: 999,
        background: t.bg,
        color: t.c,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.3,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </span>
  );
}
