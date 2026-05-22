'use client';

import { ChevRIcon } from './icons';

export function SectionTitle({
  children,
  action,
  onAction,
}: {
  children: React.ReactNode;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between px-5 pb-2.5">
      <h2 className="serif text-[22px] font-semibold text-ink m-0">{children}</h2>
      {action && (
        <button
          type="button"
          onClick={onAction}
          className="bg-transparent border-0 p-0 text-xs font-semibold uppercase tracking-wider text-ink-2 inline-flex items-center gap-1 cursor-pointer"
        >
          {action} <ChevRIcon size={12} />
        </button>
      )}
    </div>
  );
}
