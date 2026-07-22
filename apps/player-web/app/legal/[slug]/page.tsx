'use client';

import { notFound, useParams } from 'next/navigation';
import { LEGAL_DOCS } from '@/data/legal';

export default function LegalDocPage() {
  const params = useParams<{ slug: string }>();
  const doc = LEGAL_DOCS[params.slug];
  if (!doc) notFound();

  return (
    <main className="min-h-dvh px-6 py-10 flex justify-center">
      <article className="w-full max-w-2xl">
        <button
          type="button"
          onClick={() => window.close()}
          className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-6"
        >
          ← Закрыть
        </button>
        <h1 className="cinzel text-xl text-ink font-semibold leading-snug">{doc.title}</h1>
        <div className="mt-5 flex flex-col gap-3.5">
          {doc.paragraphs.map((p, i) => (
            <p key={i} className="text-[13px] leading-relaxed text-ink-2">
              {p}
            </p>
          ))}
        </div>
      </article>
    </main>
  );
}
