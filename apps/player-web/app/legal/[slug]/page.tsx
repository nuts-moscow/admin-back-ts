'use client';

import { notFound, useParams, useRouter, useSearchParams } from 'next/navigation';
import { LEGAL_DOCS } from '@/data/legal';

export default function LegalDocPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const doc = LEGAL_DOCS[params.slug];
  if (!doc) notFound();

  // Opened in a new tab from the registration checkboxes (marked with
  // ?standalone=1 on that link) → close it; navigated in-app from the
  // Оферта list → go back. Used to guess from window.history.length, but
  // that's an unreliable signal — some browsers report >1 even for a
  // freshly opened tab, sending router.back() nowhere useful in it.
  function onBack() {
    if (searchParams.get('standalone') === '1') {
      window.close();
    } else {
      router.back();
    }
  }

  return (
    <main className="min-h-dvh px-6 py-10 flex justify-center">
      <article className="w-full max-w-2xl">
        <button
          type="button"
          onClick={onBack}
          className="text-[11px] uppercase tracking-wider font-semibold text-ink-3 mb-6"
        >
          ← Назад
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
