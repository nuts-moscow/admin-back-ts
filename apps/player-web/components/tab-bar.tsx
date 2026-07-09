'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ForkIcon, HomeIcon, TrophyIcon, UserIcon } from './icons';

const TABS: Array<{ href: string; label: string; icon: React.ElementType; match: (p: string) => boolean }> = [
  // Schedule now lives on the home screen, so tournament pages fold under Главная.
  { href: '/', label: 'Главная', icon: HomeIcon, match: (p) => p === '/' || p.startsWith('/tournaments') },
  { href: '/rating', label: 'Рейтинг', icon: TrophyIcon, match: (p) => p.startsWith('/rating') },
  { href: '/kitchen', label: 'Кухня', icon: ForkIcon, match: (p) => p.startsWith('/kitchen') },
  { href: '/profile', label: 'Профиль', icon: UserIcon, match: (p) => p.startsWith('/profile') },
];

export function TabBar() {
  const pathname = usePathname() ?? '/';
  return (
    <nav
      className="absolute left-3 right-3"
      style={{
        bottom: `max(14px, env(safe-area-inset-bottom))`,
        borderRadius: 28,
        background: 'rgba(251,245,233,0.85)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid rgba(27,22,18,0.08)',
        boxShadow: '0 12px 30px -10px rgba(27,22,18,0.25)',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '10px 6px 12px',
        zIndex: 70,
      }}
    >
      {TABS.map((t) => {
        const active = t.match(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className="flex-1 flex flex-col items-center gap-[3px] py-1 relative"
            style={{ color: active ? 'var(--ink)' : 'var(--ink-3)' }}
          >
            {active && (
              <div
                style={{
                  position: 'absolute',
                  top: -10,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 22,
                  height: 3,
                  borderRadius: 2,
                  background: 'var(--ink)',
                }}
              />
            )}
            <Icon size={20} />
            <span
              className="uppercase"
              style={{
                fontSize: 9.5,
                fontWeight: active ? 700 : 500,
                letterSpacing: 0.3,
              }}
            >
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
