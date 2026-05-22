'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type {
  PlayerMeProfile,
  PlayerSeasonRatingEntry,
  PlayerTournamentSummary,
} from '@admin/schemas';
import { Card } from '@/components/card';
import { BuildingIcon, ChevRIcon, DocIcon, QuestionIcon, SupportIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { SectionTitle } from '@/components/section-title';
import { CLUB_INFO } from '@/data/club-info';
import { formatNumberRu, formatSeconds, formatTournamentDate } from '@/lib/format';

interface HomeScreenProps {
  me: PlayerMeProfile;
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  leaders: PlayerSeasonRatingEntry[];
}

export function HomeScreen({ me, active, upcoming, leaders }: HomeScreenProps) {
  const firstName = (me.name ?? me.nickname).split(' ')[0] ?? me.nickname;
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
        <SectionTitleWithLink href="/schedule" action="Все">
          Сейчас идёт
        </SectionTitleWithLink>
        <div className="px-5 flex flex-col gap-3">
          {active.length === 0 && (
            <Card padding={14}>
              <div className="text-sm text-ink-3 text-center py-3">
                Сейчас нет активных турниров
              </div>
            </Card>
          )}
          {active.slice(0, 2).map((t, i) => (
            <ActiveTournamentCard key={t.id} t={t} primary={i === 0} />
          ))}
        </div>
      </div>

      <div className="mt-7">
        <SectionTitleWithLink href="/schedule" action="Открыть">
          Ближайшие турниры
        </SectionTitleWithLink>
        <div className="grid grid-cols-2 gap-2.5 px-5">
          <Card padding={0} className="overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-line-2">
              <div className="text-[10px] uppercase font-bold text-ink-3 tracking-wider">
                Расписание
              </div>
              <div className="serif text-base font-semibold mt-px">Эта неделя</div>
            </div>
            <div className="py-1.5">
              {upcoming.slice(0, 4).map((u, i, arr) => {
                const fd = formatTournamentDate(u.date);
                return (
                  <Link
                    key={u.id}
                    href={`/tournaments/${u.id}`}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : 'none' }}
                  >
                    <div className="text-center min-w-[28px]">
                      <div className="text-[9px] text-ink-3 font-semibold">{fd.day}</div>
                      <div className="serif text-sm font-bold leading-none">
                        {fd.date.split('.')[0]}
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-ink truncate">{u.name}</div>
                      <div className="mono text-[10px] text-ink-3 mt-px">
                        {fd.time} · {formatNumberRu(u.buyin)}
                      </div>
                    </div>
                  </Link>
                );
              })}
              {upcoming.length === 0 && (
                <div className="text-center text-[11px] text-ink-3 py-4">Нет турниров</div>
              )}
            </div>
          </Card>

          <Card padding={0} className="overflow-hidden">
            <div className="px-3 pt-3 pb-2 border-b border-line-2">
              <div className="text-[10px] uppercase font-bold text-ink-3 tracking-wider">
                Лидеры
              </div>
              <div className="serif text-base font-semibold mt-px">Сезон</div>
            </div>
            <div className="py-1.5">
              {leaders.slice(0, 5).map((p, i, arr) => (
                <div
                  key={`${p.rank}-${p.playerId}`}
                  className="flex items-center gap-2 px-2.5 py-1.5"
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
                    <div className="text-[11px] font-bold text-ink truncate">{p.name ?? p.nickname}</div>
                    <div className="mono text-[9.5px] text-ink-3">
                      {formatNumberRu(p.points)} pts
                    </div>
                  </div>
                </div>
              ))}
              {leaders.length === 0 && (
                <div className="text-center text-[11px] text-ink-3 py-4">Сезон не начат</div>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="mt-7 px-5">
        <div className="grid grid-cols-2 gap-2.5">
          <QuickTile icon={<BuildingIcon size={20} className="text-paper" />} title={CLUB_INFO.about.title} sub={CLUB_INFO.about.sub} dark />
          <QuickTile icon={<SupportIcon size={20} className="text-ink" />} title={CLUB_INFO.support.title} sub={CLUB_INFO.support.sub} />
          <QuickTile icon={<QuestionIcon size={20} className="text-ink" />} title={CLUB_INFO.qa.title} sub={CLUB_INFO.qa.sub} />
          <QuickTile icon={<DocIcon size={20} className="text-ink" />} title={CLUB_INFO.oferta.title} sub={CLUB_INFO.oferta.sub} />
        </div>
      </div>

      <div className="h-4" />
    </ScrollScreen>
  );
}

function SectionTitleWithLink({
  children,
  href,
  action,
}: {
  children: React.ReactNode;
  href: string;
  action: string;
}) {
  const router = useRouter();
  return (
    <SectionTitle action={action} onAction={() => router.push(href)}>
      {children}
    </SectionTitle>
  );
}

function ActiveTournamentCard({ t, primary }: { t: PlayerTournamentSummary; primary?: boolean }) {
  return (
    <Link href={`/tournaments/${t.id}`} className="block">
      <Card
        padding={0}
        className="overflow-hidden"
        style={{
          background: primary ? 'var(--ink)' : 'var(--paper)',
          border: primary ? '1px solid var(--ink)' : '1px solid var(--line-2)',
          color: primary ? 'var(--paper)' : 'var(--ink)',
        }}
      >
        {primary && (
          <div className="grain" style={{ opacity: 0.15, mixBlendMode: 'screen' }} />
        )}
        <div className="p-4 relative">
          <div className="flex justify-between items-start mb-3.5">
            <div>
              <div
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase"
                style={{
                  letterSpacing: 1,
                  color: primary ? 'rgba(251,245,233,0.6)' : 'var(--ink-3)',
                }}
              >
                {t.status === 'in_progress' && <span className="live-dot" />}
                {t.status === 'in_progress'
                  ? `Идёт · уровень ${t.currentLevelNo ?? '—'}`
                  : 'Late reg'}
              </div>
              <div
                className="serif mt-1.5"
                style={{
                  fontSize: 24,
                  fontWeight: 600,
                  lineHeight: 1.1,
                  color: primary ? 'var(--paper)' : 'var(--ink)',
                }}
              >
                {t.name}
              </div>
            </div>
            <ChevRIcon
              size={18}
              style={{ color: primary ? 'rgba(251,245,233,0.5)' : 'var(--ink-3)' }}
            />
          </div>

          <div
            className="grid grid-cols-4 gap-2 py-3"
            style={{
              borderTop: primary ? '1px solid rgba(251,245,233,0.12)' : '1px solid var(--line-2)',
              borderBottom: primary ? '1px solid rgba(251,245,233,0.12)' : '1px solid var(--line-2)',
            }}
          >
            <MiniStat label="Бай-ин" v={formatNumberRu(t.buyin)} primary={primary} />
            <MiniStat label="Игроки" v={`${t.aliveCount}/${t.registeredCount}`} primary={primary} />
            <MiniStat label="AVG" v={formatNumberRu(t.averageStack)} primary={primary} />
            <MiniStat
              label="Блайнды"
              v={t.currentBlinds ? `${t.currentBlinds.smallBlind}/${t.currentBlinds.bigBlind}` : '—'}
              primary={primary}
            />
          </div>

          <div className="grid grid-cols-3 gap-2 mt-3">
            <MiniStat
              label="Старт. стек"
              v={formatNumberRu(t.startingStack)}
              primary={primary}
            />
            <MiniStat
              label="Late reg"
              v={t.lateRegistrationClosed ? 'Закрыта' : 'Открыта'}
              primary={primary}
            />
            <MiniStat
              label="Текущий уровень"
              v={formatSeconds(t.levelTimeRemainingSec)}
              gold
              primary={primary}
            />
          </div>
        </div>
      </Card>
    </Link>
  );
}

function MiniStat({
  label,
  v,
  primary,
  gold,
}: {
  label: string;
  v: React.ReactNode;
  primary?: boolean;
  gold?: boolean;
}) {
  return (
    <div>
      <div
        className="font-bold uppercase"
        style={{
          fontSize: 9,
          letterSpacing: 0.6,
          color: primary ? 'rgba(251,245,233,0.5)' : 'var(--ink-3)',
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 13,
          fontWeight: gold ? 700 : 600,
          color: gold
            ? primary
              ? 'var(--gold)'
              : 'var(--gold-2)'
            : primary
              ? 'var(--paper)'
              : 'var(--ink)',
          marginTop: 2,
        }}
      >
        {v}
      </div>
    </div>
  );
}

function QuickTile({
  icon,
  title,
  sub,
  dark,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  dark?: boolean;
}) {
  return (
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
}
