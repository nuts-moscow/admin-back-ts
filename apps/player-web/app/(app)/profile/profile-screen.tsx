'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PlayerMeProfile, PlayerTournamentHistoryEntry } from '@admin/schemas';
import { ACHIEVEMENTS } from '@/data/achievements';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { LogoutIcon, MedalIcon, TrophyIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { logoutPlayer } from '@/lib/auth';
import { formatJoinedAt, formatNumberRu, formatTournamentDate } from '@/lib/format';

type Tab = 'stats' | 'achievements' | 'history';

interface Props {
  me: PlayerMeProfile;
  history: PlayerTournamentHistoryEntry[];
}

export function ProfileScreen({ me, history }: Props) {
  const [tab, setTab] = useState<Tab>('stats');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  async function logout() {
    await logoutPlayer();
    startTransition(() => {
      router.replace('/login');
      router.refresh();
    });
  }

  const medalColor =
    me.medal === 'gold'
      ? 'var(--gold)'
      : me.medal === 'silver'
        ? '#B8B0A0'
        : me.medal === 'bronze'
          ? '#A87750'
          : 'var(--ink-3)';

  return (
    <ScrollScreen dark>
      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          padding: '88px 20px 24px',
          paddingTop: 'max(88px, calc(env(safe-area-inset-top) + 64px))',
          borderBottomLeftRadius: 26,
          borderBottomRightRadius: 26,
        }}
      >
        <div className="grain" style={{ opacity: 0.18, mixBlendMode: 'screen' }} />
        <div className="flex justify-end relative">
          <button
            type="button"
            onClick={logout}
            disabled={pending}
            className="inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(251,245,233,0.1)',
              border: 0,
              borderRadius: 20,
              padding: '6px 12px',
              color: 'var(--paper)',
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            <LogoutIcon size={12} className="text-paper" /> Выйти
          </button>
        </div>

        <div className="flex items-center gap-3.5 mt-2 relative">
          <div className="relative">
            <Avatar name={me.name ?? me.nickname} size={84} ring />
            <div
              className="flex items-center justify-center"
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: medalColor,
                border: '2px solid var(--ink)',
              }}
            >
              <MedalIcon size={16} className="text-ink" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="mono font-semibold" style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 0.4 }}>
              @{me.nickname}
            </div>
            <div className="serif text-[26px] font-semibold leading-tight mt-0.5">
              {me.name ?? me.nickname}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'rgba(251,245,233,0.6)' }}>
              В клубе с {formatJoinedAt(me.joinedAt)}
            </div>
          </div>
        </div>

        <div
          className="mt-4 grid grid-cols-4 gap-2"
          style={{
            padding: 14,
            borderRadius: 14,
            background: 'rgba(251,245,233,0.06)',
            border: '1px solid rgba(251,245,233,0.08)',
          }}
        >
          <DarkStat label="Рейтинг" v={me.rank != null ? `#${me.rank}` : '—'} sub={`${formatNumberRu(me.points)} pts`} />
          <DarkStat label="ELO" v={String(me.eloLite.value)} sub={`пик ${me.eloLite.peak}`} />
          <DarkStat label="ITM" v={`${me.itm}%`} sub={`${me.playedTournaments} турн.`} />
          <DarkStat label="Бонти" v={formatNumberRu(me.bountyCount)} sub="за сезон" />
        </div>

        <div className="flex gap-2 mt-3 relative">
          <div
            className="flex-1 flex items-center gap-2.5"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(181,138,60,0.18)',
              border: '1px solid rgba(181,138,60,0.3)',
            }}
          >
            <div className="serif" style={{ fontSize: 28, fontWeight: 700, color: 'var(--gold)', lineHeight: 1 }}>
              {me.freeEntryCount}
            </div>
            <div>
              <div className="uppercase font-bold" style={{ fontSize: 10, color: 'var(--gold)', letterSpacing: 0.6 }}>
                Бесплатных
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(251,245,233,0.7)' }}>
                входов
              </div>
            </div>
          </div>
          <div
            className="flex-1 flex items-center gap-2.5"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: 'rgba(251,245,233,0.06)',
              border: '1px solid rgba(251,245,233,0.12)',
            }}
          >
            <div className="serif" style={{ fontSize: 28, fontWeight: 700, color: 'var(--paper)', lineHeight: 1 }}>
              {me.freeReentryCount}
            </div>
            <div>
              <div className="uppercase font-bold" style={{ fontSize: 10, color: 'rgba(251,245,233,0.6)', letterSpacing: 0.6 }}>
                Ре-ентри
              </div>
              <div className="text-[11px]" style={{ color: 'rgba(251,245,233,0.5)' }}>
                доступно
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-3.5 pb-3">
        <div className="flex gap-1 bg-[rgba(27,22,18,0.06)] rounded-xl p-1">
          {([
            { id: 'stats', l: 'Статистика' },
            { id: 'achievements', l: 'Ачивки' },
            { id: 'history', l: 'История' },
          ] as const).map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className="flex-1 px-2 py-2 border-0 rounded-full cursor-pointer font-bold uppercase tracking-wider"
              style={{
                fontSize: 11.5,
                background: tab === x.id ? 'var(--paper)' : 'transparent',
                color: tab === x.id ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: tab === x.id ? '0 1px 3px rgba(27,22,18,0.08)' : 'none',
                fontFamily: 'inherit',
              }}
            >
              {x.l}
            </button>
          ))}
        </div>
      </div>

      {tab === 'stats' && (
        <div className="px-5 flex flex-col gap-2.5">
          <Card padding={14}>
            <div
              className="uppercase font-bold mb-2.5"
              style={{
                fontSize: 10,
                letterSpacing: 0.6,
                color: 'var(--ink-3)',
              }}
            >
              Сезон
            </div>
            <div className="grid grid-cols-2 gap-3.5">
              <Stat label="Турниров" value={String(me.playedTournaments)} />
              <Stat label="Побед" value={String(me.wins)} />
              <Stat label="Финалов" value={String(me.finalTables)} sub="столов" />
              <Stat label="Очки" value={formatNumberRu(me.points)} />
            </div>
          </Card>

          <Card padding={14}>
            <div
              className="uppercase font-bold mb-2.5"
              style={{
                fontSize: 10,
                letterSpacing: 0.6,
                color: 'var(--ink-3)',
              }}
            >
              ELO-lite
            </div>
            <div className="flex items-baseline gap-3">
              <div className="serif text-[36px] font-bold leading-none">{me.eloLite.value}</div>
              <div className="text-xs text-ink-3">пик {me.eloLite.peak}</div>
            </div>
            <div
              className="mono mt-1.5"
              style={{
                fontSize: 11,
                color: me.eloLite.change30d >= 0 ? 'var(--green)' : 'var(--crimson)',
              }}
            >
              {me.eloLite.change30d >= 0 ? '+' : ''}
              {me.eloLite.change30d} за 30 дней
            </div>
          </Card>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="px-5">
          <div className="grid grid-cols-3 gap-2.5">
            {ACHIEVEMENTS.map((a) => (
              <AchievementTile key={a.id} a={a} />
            ))}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="px-5 flex flex-col gap-2.5">
          {history.length === 0 && (
            <Card padding={14}>
              <div className="text-sm text-ink-3 text-center py-3">История пуста</div>
            </Card>
          )}
          {history.map((h) => (
            <Link key={h.tournamentId} href={`/tournaments/${h.tournamentId}`} className="block">
              <Card padding={14}>
                <div className="flex justify-between items-start">
                  <div>
                    <div
                      className="mono"
                      style={{
                        fontSize: 10,
                        color: 'var(--ink-3)',
                        fontWeight: 600,
                        letterSpacing: 0.4,
                      }}
                    >
                      {formatTournamentDate(new Date(h.date).getTime()).date}
                    </div>
                    <div className="serif text-[17px] font-semibold leading-tight mt-1">{h.name}</div>
                  </div>
                  <div className="text-right">
                    {(() => {
                      /* Backend `placement` is elimination order from start
                         (1 = first bust, N = winner). Invert for display. */
                      const displayPlace =
                        h.place != null && h.fieldSize > 0
                          ? h.fieldSize - h.place + 1
                          : null;
                      return (
                        <div
                          className="serif font-bold"
                          style={{
                            fontSize: 18,
                            color:
                              displayPlace != null && displayPlace <= 3
                                ? 'var(--gold-2)'
                                : 'var(--ink)',
                          }}
                        >
                          {displayPlace ?? '—'}
                          <span className="text-xs text-ink-3"> / {h.fieldSize}</span>
                        </div>
                      );
                    })()}
                    <div
                      className="mono mt-0.5"
                      style={{
                        fontSize: 11,
                        color: h.pointsDelta >= 0 ? 'var(--green)' : 'var(--crimson)',
                      }}
                    >
                      {h.pointsDelta >= 0 ? '+' : ''}
                      {formatNumberRu(h.pointsDelta)} баллов
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </ScrollScreen>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div
        className="uppercase font-bold"
        style={{
          fontSize: 10,
          letterSpacing: 0.6,
          color: 'var(--ink-3)',
        }}
      >
        {label}
      </div>
      <div className="serif" style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.05, marginTop: 2 }}>
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  );
}

function DarkStat({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div>
      <div
        className="uppercase font-bold"
        style={{
          fontSize: 9,
          letterSpacing: 0.6,
          color: 'rgba(251,245,233,0.5)',
        }}
      >
        {label}
      </div>
      <div
        className="serif"
        style={{
          fontSize: 19,
          fontWeight: 600,
          color: 'var(--paper)',
          lineHeight: 1.1,
          marginTop: 2,
        }}
      >
        {v}
      </div>
      {sub && (
        <div className="mono" style={{ fontSize: 9, color: 'rgba(251,245,233,0.4)' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

interface AchievementMeta {
  id: string;
  name: string;
  desc: string;
  got: boolean;
  prog: number;
}

function AchievementTile({ a }: { a: AchievementMeta }) {
  return (
    <div
      className="rounded-[14px] border border-line-2 flex flex-col items-center text-center relative"
      style={{
        padding: '14px 10px 12px',
        background: a.got ? 'var(--paper)' : 'rgba(255,255,255,0.35)',
        opacity: a.got ? 1 : 0.7,
        minHeight: 130,
      }}
    >
      <div
        className="flex items-center justify-center"
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background: a.got
            ? 'linear-gradient(135deg, var(--gold) 0%, var(--gold-2) 100%)'
            : 'rgba(27,22,18,0.05)',
          color: a.got ? 'var(--paper)' : 'var(--ink-3)',
          boxShadow: a.got ? 'inset 0 -2px 4px rgba(0,0,0,0.15)' : 'none',
        }}
      >
        <TrophyIcon size={22} />
      </div>
      <div
        className="font-bold mt-2 leading-tight"
        style={{
          fontSize: 11,
          color: a.got ? 'var(--ink)' : 'var(--ink-3)',
        }}
      >
        {a.name}
      </div>
      <div className="text-ink-3 mt-0.5 leading-tight" style={{ fontSize: 9.5 }}>
        {a.desc}
      </div>
      {!a.got && a.prog > 0 && (
        <div className="w-full mt-auto pt-2">
          <div className="h-[3px] bg-[rgba(27,22,18,0.08)] rounded-sm overflow-hidden">
            <div style={{ height: '100%', width: `${a.prog * 100}%`, background: 'var(--gold)' }} />
          </div>
          <div className="mono text-ink-3 mt-0.5" style={{ fontSize: 9 }}>
            {Math.round(a.prog * 100)}%
          </div>
        </div>
      )}
    </div>
  );
}
