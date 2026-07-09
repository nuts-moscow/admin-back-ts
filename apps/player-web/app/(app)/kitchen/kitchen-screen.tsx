'use client';

import { ScrollScreen } from '@/components/scroll-screen';

export function KitchenScreen() {
  return (
    <ScrollScreen>
      <div className="px-5 pt-3.5">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-ink-3 mb-1">
          Бар · Кухня
        </div>
      </div>

      <div className="px-5 py-24 text-center">
        <div className="serif text-[28px] font-semibold text-ink leading-tight">
          Скоро появится
        </div>
      </div>
    </ScrollScreen>
  );
}
