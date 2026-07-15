'use client';

import Link from 'next/link';
import { useState } from 'react';
import type {
  PlayerMeProfile,
  PlayerSeasonRatingEntry,
  PlayerTournamentSummary,
} from '@admin/schemas';
import { ActiveTournamentCard } from '@/components/active-tournament-card';
import { Card } from '@/components/card';
import { BuildingIcon, DocIcon, QuestionIcon, SupportIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { SectionTitle } from '@/components/section-title';
import { CLUB_INFO } from '@/data/club-info';
import { formatNumberRu, formatPoints, formatSeconds, formatTournamentDate } from '@/lib/format';
import { useTournamentRegistration } from '@/lib/use-tournament-registration';

interface HomeScreenProps {
  me: PlayerMeProfile;
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  leaders: PlayerSeasonRatingEntry[];
  onChanged?: () => void;
}

export function HomeScreen({ me, active, upcoming, leaders, onChanged }: HomeScreenProps) {
  const firstName = (me.name ?? me.nickname).split(' ')[0] ?? me.nickname;
  const [supportOpen, setSupportOpen] = useState(false);

  // When nothing is live, promote the nearest upcoming (open-registration)
  // tournament into the hero slot, and drop it from the schedule list below.
  const promotedUpcoming = active.length === 0 ? (upcoming[0] ?? null) : null;
  const heroCards = active.length > 0 ? active.slice(0, 2) : promotedUpcoming ? [promotedUpcoming] : [];
  const upcomingList = promotedUpcoming ? upcoming.slice(1) : upcoming;
  const heroTitle = promotedUpcoming ? 'Ближайший турнир' : 'Сейчас идёт';

  return (
    <ScrollScreen>
      <div className="px-5 pt-1 pb-1">
        <h1 className="serif text-[26px] font-bold text-ink leading-tight m-0">
          Добрый вечер,
          <br />
          {firstName}
        </h1>
      </div>

      <div className="mt-5">
        <SectionTitle>{heroTitle}</SectionTitle>
        <div className="px-5 flex flex-col gap-3">
          {heroCards.length === 0 && (
            <Card padding={14}>
              <div className="text-sm text-ink-3 text-center py-3">
                Сейчас нет активных турниров
              </div>
            </Card>
          )}
          {heroCards.map((t, i) => (
            <ActiveTournamentCard key={t.id} t={t} primary={i === 0} onChanged={onChanged} />
          ))}
        </div>
      </div>

      <div className="mt-7">
        <SectionTitle>Ближайшие турниры</SectionTitle>
        {/* Stacked full-width: schedule on top, season leaders below. Each card
            sizes to its own content (no equal-height matching between them). */}
        <div className="flex flex-col gap-2.5 px-5">
          <Card padding={0} className="overflow-hidden flex flex-col">
            <div className="px-3 pt-3 pb-2 border-b border-line-2">
              <div className="text-[10px] uppercase font-bold text-ink-3 tracking-wider">
                Расписание
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              {upcomingList.slice(0, 5).map((u, i, arr) => (
                <ScheduleRow
                  key={u.id}
                  u={u}
                  withBorder={i < arr.length - 1}
                  onChanged={onChanged}
                />
              ))}
              {upcomingList.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-[11px] text-ink-3">
                  Нет турниров
                </div>
              )}
            </div>
          </Card>

          <Card padding={0} className="overflow-hidden flex flex-col">
            <div className="px-3 pt-3 pb-2 border-b border-line-2">
              <div className="text-[10px] uppercase font-bold text-ink-3 tracking-wider">
                Лидеры сезона
              </div>
            </div>
            <div className="flex-1 flex flex-col">
              {leaders.slice(0, 6).map((p, i, arr) => (
                <Link
                  key={`${p.rank}-${p.playerId}`}
                  href={`/players/${p.playerId}`}
                  className="flex-1 flex items-center gap-2 px-2.5 min-h-[44px]"
                  style={{
                    borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : 'none',
                    background: p.isMe ? 'rgba(181,138,60,0.10)' : 'transparent',
                  }}
                >
                  <div
                    className="mono font-bold"
                    style={{
                      fontSize: 11,
                      minWidth: 14,
                      color: p.rank <= 3 ? 'var(--gold-2)' : 'var(--ink-3)',
                    }}
                  >
                    {p.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold text-ink truncate">{p.nickname}</div>
                    <div className="mono text-[9.5px] text-ink-3">
                      {formatPoints(p.points)}
                    </div>
                  </div>
                </Link>
              ))}
              {leaders.length === 0 && (
                <div className="flex-1 flex items-center justify-center text-[11px] text-ink-3">
                  Сезон не начат
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-7 px-5">
        <div className="grid grid-cols-2 gap-2.5">
          <QuickTile icon={<BuildingIcon size={20} className="text-paper" />} title={CLUB_INFO.about.title} sub={CLUB_INFO.about.sub} dark href="/about" />
          <QuickTile icon={<SupportIcon size={20} className="text-ink" />} title={CLUB_INFO.support.title} sub={CLUB_INFO.support.sub} onClick={() => setSupportOpen(true)} />
          <QuickTile icon={<QuestionIcon size={20} className="text-ink" />} title={CLUB_INFO.qa.title} sub={CLUB_INFO.qa.sub} href="/qa" />
          <QuickTile icon={<DocIcon size={20} className="text-ink" />} title={CLUB_INFO.oferta.title} sub={CLUB_INFO.oferta.sub} />
        </div>
      </div>

      <div className="h-4" />

      {supportOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: 'rgba(27,22,18,0.45)' }}
          onClick={() => setSupportOpen(false)}
        >
          {/* Centered dialog: tap a channel or the backdrop/Отмена to dismiss. */}
          <div
            className="w-full max-w-sm rounded-2xl px-4 pt-4 pb-3"
            style={{ background: 'var(--paper)', boxShadow: '0 18px 44px -12px rgba(27,22,18,0.45)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="serif text-[18px] font-semibold mb-1">Саппорт</div>
            <div className="text-[11px] text-ink-3 mb-3">Напишите нам, где удобнее</div>
            {CLUB_INFO.support.links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-lg px-3.5 py-3 mb-2"
                style={{ background: 'rgba(27,22,18,0.05)' }}
              >
                <span className="text-[14px] font-semibold text-ink">{l.label}</span>
                <span className="text-[11px]" style={{ color: 'var(--gold-2)' }}>
                  {l.href.replace('https://', '')}
                </span>
              </a>
            ))}
            <button
              type="button"
              onClick={() => setSupportOpen(false)}
              className="w-full border-0 rounded-lg py-3 mt-1 text-[13px] font-bold uppercase tracking-wider cursor-pointer"
              style={{ background: 'transparent', color: 'var(--ink-3)', fontFamily: 'inherit' }}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </ScrollScreen>
  );
}

/**
 * One row in the "Ближайшие турниры" schedule list: date / name / entry, plus a
 * register-toggle button on the right. The whole row links to the tournament;
 * the button suppresses that navigation and flips registration in place.
 */
function ScheduleRow({
  u,
  withBorder,
  onChanged,
}: {
  u: PlayerTournamentSummary;
  withBorder: boolean;
  onChanged?: () => void;
}) {
  const fd = formatTournamentDate(u.date);
  const { registered, busy, toggle } = useTournamentRegistration(u.id, u.isRegistered, onChanged);

  function onRegisterClick(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }

  return (
    <Link
      href={`/tournaments/${u.id}`}
      className="flex-1 flex items-center gap-2.5 px-3 py-2 min-h-[56px]"
      style={{
        borderBottom: withBorder ? '1px solid var(--line-2)' : 'none',
        // Registered rows: gold left accent + soft tint (same signal the
        // leaders list uses for "это я"). Transparent 3px border always, so
        // toggling registration doesn't shift the row.
        borderLeft: `3px solid ${registered ? 'var(--gold-2)' : 'transparent'}`,
        background: registered ? 'rgba(181,138,60,0.10)' : 'transparent',
      }}
    >
      {/* Stacked date column — day-of-week and number grouped, no gap. */}
      <div className="shrink-0 text-center min-w-[28px]">
        <div
          className="font-semibold uppercase text-ink-3 leading-none"
          style={{ fontSize: 10, letterSpacing: 0.5 }}
        >
          {fd.day}
        </div>
        <div className="serif text-base font-bold leading-none text-ink mt-0.5">
          {fd.date.split('.')[0]}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold text-ink leading-tight">{u.name}</div>
        <div className="mono text-[10px] text-ink-3 flex gap-2 mt-0.5 leading-none">
          <span>{fd.time}</span>
          <span>{formatNumberRu(u.buyin)}</span>
        </div>
      </div>
      <span
        role="button"
        tabIndex={0}
        onClick={onRegisterClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onRegisterClick(e);
        }}
        aria-disabled={busy}
        className="relative shrink-0 flex items-center justify-center rounded-md font-bold uppercase cursor-pointer select-none"
        style={{
          padding: '6px 10px',
          fontSize: 10,
          letterSpacing: 0.5,
          background: registered ? 'transparent' : 'var(--gold)',
          color: 'var(--ink)',
          border: registered ? '1px solid var(--line)' : '1px solid transparent',
          opacity: busy ? 0.7 : 1,
          transition: 'background 0.25s ease, border-color 0.25s ease, opacity 0.15s ease',
        }}
      >
        {/* The longest label sizes the button invisibly in every state, so
            toggling never changes its footprint. */}
        <span style={{ visibility: 'hidden' }}>Записаться</span>
        <span className="absolute inset-0 flex items-center justify-center">
          {busy ? '…' : registered ? 'Отменить' : 'Записаться'}
        </span>
      </span>
    </Link>
  );
}

function QuickTile({
  icon,
  title,
  sub,
  dark,
  href,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  dark?: boolean;
  /** When set, the tile navigates there. */
  href?: string;
  /** Alternative to href: the tile acts as a button (e.g. opens a sheet). */
  onClick?: () => void;
}) {
  const tile = (
    <div
      className="rounded-md p-3.5 pb-4 relative overflow-hidden cursor-pointer flex flex-col justify-between"
      style={{
        background: dark ? 'var(--ink)' : 'var(--paper)',
        color: dark ? 'var(--paper)' : 'var(--ink)',
        border: dark ? '1px solid var(--ink)' : '1px solid var(--line-2)',
        boxShadow: '0 6px 14px -10px rgba(27,22,18,0.18)',
        minHeight: 90,
      }}
    >
      <div
        className="rounded-[10px] flex items-center justify-center"
        style={{
          width: 36,
          height: 36,
          background: dark ? 'rgba(251,245,233,0.1)' : 'rgba(27,22,18,0.05)',
        }}
      >
        {icon}
      </div>
      <div>
        <div className="serif text-[18px] font-semibold leading-tight">{title}</div>
        <div
          className="mt-0.5"
          style={{
            fontSize: 11,
            color: dark ? 'rgba(251,245,233,0.55)' : 'var(--ink-3)',
          }}
        >
          {sub}
        </div>
      </div>
    </div>
  );
  if (onClick) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onClick();
        }}
      >
        {tile}
      </div>
    );
  }
  if (href) {
    // External targets (Telegram, maps) leave the app in a new tab; internal
    // routes go through the client router.
    if (href.startsWith('http')) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className="block">
          {tile}
        </a>
      );
    }
    return (
      <Link href={href} className="block">
        {tile}
      </Link>
    );
  }
  return tile;
}
