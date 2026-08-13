'use client';

import Link from 'next/link';

/**
 * One legal document, its checkbox and the link that opens it. Registration
 * asks for two of these, and any future screen that gates on consent asks in
 * the same words.
 */
export function ConsentRow({
  checked,
  onChange,
  slug,
  prefix,
  linkText,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  slug: string;
  prefix: string;
  linkText: string;
}) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ink)]"
      />
      <span className="text-[12px] leading-snug text-ink-2">
        {prefix}{' '}
        <Link
          href={`/legal/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink underline"
          onClick={(e) => e.stopPropagation()}
        >
          {linkText}
        </Link>
      </span>
    </label>
  );
}
