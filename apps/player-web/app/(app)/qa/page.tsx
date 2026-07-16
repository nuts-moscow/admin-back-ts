'use client';

import Link from 'next/link';
import { Card } from '@/components/card';
import { ChevLIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { QA_CLUB } from '@/data/club-info';

export default function QaPage() {
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
        <h1 className="serif m-0 text-[40px] font-semibold text-ink leading-none">Q & A</h1>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-2.5">
        {QA_CLUB.map((item) => (
          <Card key={item.q} padding={16}>
            <div className="serif text-[16px] font-semibold mb-1.5">❓ {item.q}</div>
            {item.href ? (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] leading-relaxed underline underline-offset-2"
                style={{ color: 'var(--gold-2)', textDecorationColor: 'rgba(181,138,60,0.5)' }}
              >
                {item.a}
              </a>
            ) : (
              <div
                className="text-[13px] leading-relaxed"
                style={{ color: 'var(--ink-2)', whiteSpace: 'pre-line' }}
              >
                {item.a}
              </div>
            )}
            {item.links && (
              <div className="flex flex-col gap-1 mt-1.5">
                {item.links.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] leading-relaxed underline underline-offset-2"
                    style={{ color: 'var(--gold-2)', textDecorationColor: 'rgba(181,138,60,0.5)' }}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </ScrollScreen>
  );
}
