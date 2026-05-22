'use client';

import { useRef, type ReactNode } from 'react';
import { NUTSHeader } from './nuts-header';

interface ScrollScreenProps {
  children: ReactNode;
  paddingBottom?: number;
  dark?: boolean;
  /** Top spacer height. Pass 0 when the first child is a dark hero filling from the top. */
  topInset?: number;
}

export function ScrollScreen({
  children,
  paddingBottom = 100,
  dark = false,
  topInset,
}: ScrollScreenProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inset = topInset != null ? topInset : dark ? 0 : 76;
  return (
    <div className="h-full relative">
      <NUTSHeader scrollRef={scrollRef} dark={dark} />
      <div
        ref={scrollRef}
        className="scroll"
        style={{ height: '100%', overflowY: 'auto', paddingBottom }}
      >
        {inset > 0 && <div style={{ height: inset }} />}
        {children}
      </div>
    </div>
  );
}
