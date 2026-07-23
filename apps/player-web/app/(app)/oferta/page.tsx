'use client';

import Link from 'next/link';
import { Card } from '@/components/card';
import { ChevLIcon, ChevRIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { LEGAL_DOCS, LEGAL_ORDER } from '@/data/legal';

export default function OfertaPage() {
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
        <h1 className="serif m-0 text-[40px] font-semibold text-ink leading-none">Оферта</h1>
        <p className="text-[13px] text-ink-3 mt-3 leading-relaxed">
          Документы, с которыми игрок соглашается при регистрации.
        </p>
      </div>

      <div className="px-5 pt-4 flex flex-col gap-2.5">
        {LEGAL_ORDER.map((slug) => {
          const doc = LEGAL_DOCS[slug]!;
          return (
            <Link key={slug} href={`/legal/${slug}`} className="block">
              <Card padding={16}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[14px] font-semibold text-ink leading-snug">
                    {doc.title}
                  </span>
                  <ChevRIcon size={16} className="shrink-0 text-ink-3" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </ScrollScreen>
  );
}
