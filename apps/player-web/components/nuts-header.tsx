'use client';

import { useEffect, useRef, type RefObject } from 'react';

interface NUTSHeaderProps {
  scrollRef: RefObject<HTMLDivElement | null>;
  dark?: boolean;
}

/**
 * Telegram-style sticky header: blur layer always on, tint fades in with scroll,
 * bottom edge dissolves via mask. Pure CSS — no JS framework dependencies.
 */
export function NUTSHeader({ scrollRef, dark = false }: NUTSHeaderProps) {
  const tintRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scrollRef.current;
    const tint = tintRef.current;
    if (!el || !tint) return;
    const RANGE = 80;
    const update = () => {
      const t = Math.min(1, Math.max(0, el.scrollTop / RANGE));
      tint.style.opacity = String(t);
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    return () => el.removeEventListener('scroll', update);
  }, [scrollRef]);

  const tintGrad = dark
    ? 'linear-gradient(to bottom, rgba(27,22,18,0.96) 0%, rgba(27,22,18,0.92) 55%, rgba(27,22,18,0) 100%)'
    : 'linear-gradient(to bottom, rgba(244,236,221,0.96) 0%, rgba(244,236,221,0.92) 55%, rgba(244,236,221,0) 100%)';

  return (
    <>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 76,
          zIndex: 5,
          pointerEvents: 'none',
          backdropFilter: 'blur(22px) saturate(180%)',
          WebkitBackdropFilter: 'blur(22px) saturate(180%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, #000 0, #000 70%, transparent 100%)',
          maskImage:
            'linear-gradient(to bottom, #000 0, #000 70%, transparent 100%)',
        }}
      >
        <div
          ref={tintRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: tintGrad,
            opacity: 0,
            willChange: 'opacity',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          padding: '20px 20px 12px',
          paddingTop: 'max(20px, env(safe-area-inset-top))',
          zIndex: 6,
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <div
          className="cinzel"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            color: dark ? 'var(--paper)' : 'var(--ink)',
            lineHeight: 1,
          }}
        >
          NUTS Family
        </div>
      </div>
    </>
  );
}
