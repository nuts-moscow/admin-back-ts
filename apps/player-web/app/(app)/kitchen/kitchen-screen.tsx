'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/components/card';
import { ChevRIcon } from '@/components/icons';
import { Pill } from '@/components/pill';
import { ScrollScreen } from '@/components/scroll-screen';
import { KITCHEN } from '@/data/kitchen';
import { formatNumberRu } from '@/lib/format';

export function KitchenScreen() {
  const [cat, setCat] = useState(0);
  const [cart, setCart] = useState<Record<string, number>>({});
  const cartCount = Object.values(cart).reduce((s, n) => s + n, 0);

  const total = useMemo(() => {
    let s = 0;
    for (const c of KITCHEN) {
      for (const item of c.items) {
        const q = cart[item.name] ?? 0;
        s += q * item.price;
      }
    }
    return s;
  }, [cart]);

  const currentCategory = KITCHEN[cat] ?? KITCHEN[0];
  if (!currentCategory) return null;

  return (
    <ScrollScreen paddingBottom={cartCount > 0 ? 160 : 100}>
      <div className="px-5 pt-3.5">
        <div className="flex justify-between items-end">
          <div>
            <div className="text-[11px] uppercase tracking-widest font-semibold text-ink-3 mb-1">
              Бар · Кухня
            </div>
            <h1 className="serif m-0 text-[40px] font-semibold text-ink leading-none">Меню</h1>
          </div>
          <div
            className="inline-flex items-center gap-1.5"
            style={{
              padding: '8px 12px',
              borderRadius: 20,
              background: 'rgba(27,22,18,0.06)',
            }}
          >
            <span
              className="uppercase font-bold"
              style={{
                fontSize: 10,
                color: 'var(--ink-3)',
                letterSpacing: 0.4,
              }}
            >
              Стол
            </span>
            <span className="mono text-[13px] font-bold text-ink">—</span>
          </div>
        </div>
      </div>

      <div className="px-5 pt-3 pb-4 flex gap-2 overflow-x-auto scroll">
        {KITCHEN.map((c, i) => (
          <button
            key={c.cat}
            onClick={() => setCat(i)}
            className="border-0 rounded-full font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap"
            style={{
              padding: '8px 14px',
              background: cat === i ? 'var(--ink)' : 'rgba(27,22,18,0.06)',
              color: cat === i ? 'var(--paper)' : 'var(--ink-2)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          >
            {c.cat}
          </button>
        ))}
      </div>

      <div className="px-5 flex flex-col gap-2.5">
        {currentCategory.items.map((it) => {
          const qty = cart[it.name] ?? 0;
          return (
            <Card key={it.name} padding={0} className="overflow-hidden">
              <div className="flex">
                <div
                  className="flex items-center justify-center border-r border-line-2 flex-shrink-0"
                  style={{
                    width: 84,
                    background:
                      'repeating-linear-gradient(45deg, var(--bg-3) 0 8px, var(--bg-2) 8px 16px)',
                  }}
                >
                  <span
                    className="mono text-center"
                    style={{
                      fontSize: 9,
                      color: 'var(--ink-3)',
                      opacity: 0.6,
                      padding: 6,
                      lineHeight: 1.2,
                    }}
                  >
                    фото
                    <br />
                    блюда
                  </span>
                </div>
                <div className="flex-1 p-3.5">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-1.5">
                        <div className="serif text-[17px] font-semibold leading-tight">
                          {it.name}
                        </div>
                        {it.tag && <Pill tone="gold">{it.tag}</Pill>}
                      </div>
                      <div className="text-[11px] text-ink-3 mt-1 leading-relaxed">
                        {it.desc}
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center mt-2.5">
                    <div className="mono serif text-[18px] font-bold text-ink">{it.price} ₽</div>
                    {qty === 0 ? (
                      <button
                        type="button"
                        onClick={() =>
                          setCart((c) => ({ ...c, [it.name]: 1 }))
                        }
                        className="border-0 rounded-full cursor-pointer font-bold uppercase tracking-wider"
                        style={{
                          background: 'var(--ink)',
                          color: 'var(--paper)',
                          padding: '6px 14px',
                          fontSize: 11,
                          fontFamily: 'inherit',
                        }}
                      >
                        В заказ
                      </button>
                    ) : (
                      <div
                        className="flex items-center gap-2"
                        style={{
                          background: 'var(--ink)',
                          borderRadius: 999,
                          padding: 4,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setCart((c) => {
                              const n = { ...c };
                              const v = n[it.name] ?? 0;
                              if (v > 1) n[it.name] = v - 1;
                              else delete n[it.name];
                              return n;
                            })
                          }
                          className="w-6 h-6 rounded-full border-0 cursor-pointer"
                          style={{
                            background: 'rgba(251,245,233,0.15)',
                            color: 'var(--paper)',
                            fontSize: 16,
                            lineHeight: 1,
                            fontFamily: 'inherit',
                          }}
                        >
                          −
                        </button>
                        <span
                          className="mono"
                          style={{
                            minWidth: 14,
                            textAlign: 'center',
                            color: 'var(--paper)',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCart((c) => ({ ...c, [it.name]: (c[it.name] ?? 0) + 1 }))
                          }
                          className="w-6 h-6 rounded-full border-0 cursor-pointer"
                          style={{
                            background: 'var(--gold)',
                            color: 'var(--ink)',
                            fontSize: 16,
                            lineHeight: 1,
                            fontWeight: 700,
                            fontFamily: 'inherit',
                          }}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {cartCount > 0 && (
        <div
          className="absolute left-3 right-3 flex items-center justify-between"
          style={{
            bottom: 86,
            background: 'var(--ink)',
            color: 'var(--paper)',
            borderRadius: 18,
            padding: '12px 16px',
            boxShadow: '0 12px 30px -10px rgba(27,22,18,0.4)',
            zIndex: 65,
          }}
        >
          <div>
            <div
              className="uppercase font-bold"
              style={{
                fontSize: 10,
                color: 'rgba(251,245,233,0.55)',
                letterSpacing: 0.6,
              }}
            >
              {cartCount} позиции
            </div>
            <div className="serif text-[20px] font-semibold mt-px">{formatNumberRu(total)} ₽</div>
          </div>
          <button
            type="button"
            disabled
            title="Оплата на кассе клуба"
            className="border-0 rounded-[12px] cursor-not-allowed font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
            style={{
              background: 'var(--gold)',
              color: 'var(--ink)',
              padding: '10px 16px',
              fontSize: 12,
              fontFamily: 'inherit',
              opacity: 0.85,
            }}
          >
            Скоро <ChevRIcon size={14} className="text-ink" />
          </button>
        </div>
      )}
    </ScrollScreen>
  );
}
