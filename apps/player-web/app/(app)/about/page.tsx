'use client';

import Link from 'next/link';
import { Card } from '@/components/card';
import { ChevLIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { ABOUT_CLUB } from '@/data/club-info';

export default function AboutPage() {
  return (
    <ScrollScreen>
      <div className="px-5 pt-3.5">
        <Link
          href="/"
          className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider"
          style={{
            background: 'rgba(27,22,18,0.06)',
            borderRadius: 20,
            padding: '6px 12px 6px 8px',
            color: 'var(--ink)',
            fontSize: 11,
          }}
        >
          <ChevLIcon size={12} /> Назад
        </Link>
        <div className="text-[11px] uppercase tracking-widest font-semibold text-ink-3 mt-4 mb-1">
          Nuts Family
        </div>
        <h1 className="serif m-0 text-[40px] font-semibold text-ink leading-none">О клубе</h1>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-2.5">
        <Card padding={16}>
          <div className="text-[14px] leading-relaxed text-ink">{ABOUT_CLUB.intro}</div>
        </Card>

        <Card padding={16}>
          <div className="serif text-[17px] font-semibold mb-3">{ABOUT_CLUB.schedule.title}</div>
          <div className="flex flex-col gap-2">
            {ABOUT_CLUB.schedule.rows.map((r) => (
              <div key={r.name} className="flex items-baseline justify-between gap-3">
                <span className="mono text-[11px] text-ink-3 shrink-0">{r.day}</span>
                <span className="text-[13px] font-semibold text-right">{r.name}</span>
              </div>
            ))}
          </div>
        </Card>

        {ABOUT_CLUB.sections.map((s) => (
          <Card key={s.title} padding={16}>
            <div className="serif text-[17px] font-semibold mb-1.5">{s.title}</div>
            <div className="text-[13px] leading-relaxed" style={{ color: 'var(--ink-2)' }}>
              {s.text}
            </div>
          </Card>
        ))}

        <div className="text-[12px] text-ink-3 text-center py-2">{ABOUT_CLUB.address}</div>
      </div>
    </ScrollScreen>
  );
}
