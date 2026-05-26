'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type {
  PlayerMyTournamentState,
  PlayerTournamentDetail,
  PlayerTournamentPlayer,
  PlayerTournamentTable,
} from '@admin/schemas';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { ChevLIcon, PauseIcon, PlayIcon } from '@/components/icons';
import { KV } from '@/components/kv';
import { ScrollScreen } from '@/components/scroll-screen';
import { formatNumberRu, formatSeconds } from '@/lib/format';

type Tab = 'overview' | 'players' | 'tables';

interface Props {
  detail: PlayerTournamentDetail;
  players: PlayerTournamentPlayer[];
  tables: PlayerTournamentTable[];
  myState: PlayerMyTournamentState | null;
}

export function TournamentScreen({ detail, players, tables, myState }: Props) {
  const [view, setView] = useState<Tab>('overview');
  const [running, setRunning] = useState(true);
  const [s, setS] = useState<number>(detail.levelTimeRemainingSec ?? 0);

  useEffect(() => {
    setS(detail.levelTimeRemainingSec ?? 0);
  }, [detail.levelTimeRemainingSec]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setS((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [running]);

  const levelTotal = (detail.currentBlinds?.durationMin ?? 20) * 60;
  const pct = Math.max(0, Math.min(100, (s / levelTotal) * 100));

  return (
    <ScrollScreen dark>
      <div
        className="relative overflow-hidden"
        style={{
          background: 'var(--ink)',
          color: 'var(--paper)',
          padding: '88px 20px 20px',
          paddingTop: 'max(88px, calc(env(safe-area-inset-top) + 64px))',
          borderBottomLeftRadius: 26,
          borderBottomRightRadius: 26,
        }}
      >
        <div className="grain" style={{ opacity: 0.18, mixBlendMode: 'screen' }} />
        <div className="flex justify-between items-center relative">
          <Link
            href="/schedule"
            className="inline-flex items-center gap-1 font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(251,245,233,0.1)',
              borderRadius: 20,
              padding: '6px 12px 6px 8px',
              color: 'var(--paper)',
              fontSize: 11,
            }}
          >
            <ChevLIcon size={12} className="text-paper" /> Назад
          </Link>
          {detail.status === 'in_progress' && (
            <div className="inline-flex items-center gap-1.5">
              <span className="live-dot" />
              <span
                className="font-bold uppercase"
                style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  color: 'rgba(251,245,233,0.7)',
                }}
              >
                LIVE
              </span>
            </div>
          )}
        </div>

        <div className="serif relative mt-3.5" style={{ fontSize: 28, fontWeight: 600, lineHeight: 1.05 }}>
          {detail.name}
        </div>

        <div className="mt-4 relative">
          <div className="flex justify-between items-end mb-2">
            <div>
              <div
                className="uppercase font-bold"
                style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  color: 'rgba(251,245,233,0.5)',
                }}
              >
                Уровень {detail.currentLevelNo ?? '—'}
              </div>
              <div className="mono mt-0.5" style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
                {detail.currentBlinds
                  ? `${detail.currentBlinds.smallBlind} / ${detail.currentBlinds.bigBlind}`
                  : '— / —'}
                {detail.currentBlinds && detail.currentBlinds.ante > 0 && (
                  <span style={{ color: 'rgba(251,245,233,0.5)' }}>
                    {' '}
                    · ante {detail.currentBlinds.ante}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right">
              <div
                className="uppercase font-bold"
                style={{
                  fontSize: 10,
                  letterSpacing: 1,
                  color: 'rgba(251,245,233,0.5)',
                }}
              >
                След. блайнды
              </div>
              <div className="mono mt-0.5" style={{ fontSize: 13, color: 'rgba(251,245,233,0.85)', fontWeight: 600 }}>
                {detail.nextBlinds
                  ? `${detail.nextBlinds.smallBlind} / ${detail.nextBlinds.bigBlind}`
                  : '—'}
              </div>
            </div>
          </div>
          <div
            className="flex justify-between items-center"
            style={{
              fontFamily: 'var(--font-mono), ui-monospace, monospace',
              fontSize: 64,
              fontWeight: 600,
              letterSpacing: -1,
              lineHeight: 1,
              color: 'var(--paper)',
            }}
          >
            <span>{formatSeconds(s)}</span>
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className="w-11 h-11 rounded-full flex items-center justify-center cursor-pointer"
              style={{
                background: 'rgba(251,245,233,0.1)',
                border: '1px solid rgba(251,245,233,0.2)',
                color: 'var(--paper)',
              }}
              aria-label={running ? 'Пауза' : 'Запустить'}
            >
              {running ? <PauseIcon size={16} className="text-paper" /> : <PlayIcon size={16} className="text-paper" />}
            </button>
          </div>
          <div
            className="rounded-sm mt-3 overflow-hidden"
            style={{ height: 3, background: 'rgba(251,245,233,0.1)' }}
          >
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                background: 'var(--gold)',
                transition: 'width 1s linear',
              }}
            />
          </div>
        </div>

        <div
          className="mt-4 relative grid grid-cols-4 gap-2"
          style={{
            padding: 12,
            borderRadius: 14,
            background: 'rgba(251,245,233,0.06)',
            border: '1px solid rgba(251,245,233,0.08)',
          }}
        >
          <DarkStat label="Игроки" v={String(detail.aliveCount)} sub={`из ${detail.registeredCount}`} />
          <DarkStat label="Средний стэк" v={formatNumberRu(detail.averageStack)} sub="фишек" />
          <DarkStat
            label="Стэк"
            v={formatNumberRu(detail.startingStack)}
            sub="старт"
          />
          <DarkStat
            label="Выбыли"
            v={String(detail.eliminatedCount)}
            sub="игр."
          />
        </div>
      </div>

      <div className="px-5 pt-4">
        <Card padding={14} className="bg-bg-3">
          <div className="flex items-center gap-3">
            <Avatar name={myState ? 'Вы' : '?'} ring size={44} />
            <div className="flex-1">
              <div
                className="uppercase font-bold"
                style={{
                  fontSize: 10,
                  letterSpacing: 0.6,
                  color: 'var(--ink-3)',
                }}
              >
                Моё положение
              </div>
              <div className="serif text-[22px] font-semibold mt-0.5">
                {myState
                  ? `Стол ${myState.table ?? '—'} · место ${myState.seat ?? '—'}`
                  : 'Не зарегистрированы'}
              </div>
            </div>
            <div className="text-right">
              <div
                className="uppercase font-bold"
                style={{
                  fontSize: 10,
                  letterSpacing: 0.6,
                  color: 'var(--ink-3)',
                }}
              >
                Мой стек
              </div>
              <div
                className="mono serif"
                style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: 'var(--gold-2)',
                }}
              >
                {formatNumberRu(myState?.stack)}
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="px-5 pt-3.5 pb-3">
        <div
          className="flex gap-1 rounded-xl p-1"
          style={{ background: 'rgba(27,22,18,0.06)' }}
        >
          {([
            { id: 'overview', l: 'Обзор' },
            { id: 'players', l: 'Игроки' },
            { id: 'tables', l: 'Столы' },
          ] as const).map((x) => (
            <button
              key={x.id}
              onClick={() => setView(x.id)}
              className="flex-1 border-0 rounded-[9px] cursor-pointer font-bold uppercase tracking-wider"
              style={{
                padding: '8px 12px',
                fontSize: 11.5,
                background: view === x.id ? 'var(--paper)' : 'transparent',
                color: view === x.id ? 'var(--ink)' : 'var(--ink-3)',
                boxShadow: view === x.id ? '0 1px 3px rgba(27,22,18,0.08)' : 'none',
                fontFamily: 'inherit',
              }}
            >
              {x.l}
            </button>
          ))}
        </div>
      </div>

      {view === 'overview' && (
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
              Структура турнира
            </div>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-2.5">
              <KV k="Орг. взнос" v={formatNumberRu(detail.buyin)} />
              <KV k="Стартовый стек" v={formatNumberRu(detail.startingStack)} />
              <KV
                k="Поздняя регистрация"
                v={detail.lateRegistrationClosed ? 'Закрыта' : 'Открыта'}
              />
              <KV
                k="Ре-ентри"
                v={
                  detail.structure
                    ? detail.structure.freezeOutEnabled
                      ? 'Нет'
                      : String(detail.structure.maxReentries)
                    : '—'
                }
              />
            </div>
          </Card>
          <Card padding={14}>
            <div className="flex justify-between items-center mb-2">
              <div
                className="uppercase font-bold"
                style={{
                  fontSize: 10,
                  letterSpacing: 0.6,
                  color: 'var(--ink-3)',
                }}
              >
                Распределение игроков
              </div>
              <div className="mono text-[11px] font-semibold text-ink">
                {detail.aliveCount}/{detail.registeredCount}
              </div>
            </div>
            <PlayerBar reg={detail.registeredCount} alive={detail.aliveCount} />
          </Card>
        </div>
      )}

      {view === 'players' && (
        <div className="px-5">
          <Card padding={0}>
            {players.map((p, i) => (
              <div
                key={`${p.playerId}-${i}`}
                className="flex items-center gap-2.5 px-3 py-2.5"
                style={{
                  borderBottom: i < players.length - 1 ? '1px solid var(--line-2)' : 'none',
                  background: p.isMe ? 'rgba(181,138,60,0.10)' : 'transparent',
                  opacity: p.status === 'out' ? 0.4 : 1,
                }}
              >
                <Avatar name={p.nickname} size={32} ring={p.isMe} />
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink">{p.nickname}</div>
                  <div className="mono text-[10.5px] text-ink-3 mt-0.5">
                    {p.status === 'out' ? `выбыл · #${p.place ?? '—'}` : `Стол ${p.table ?? '—'}`}
                  </div>
                </div>
                <div className="text-right">
                  <div
                    className="mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: p.status === 'out' ? 'var(--ink-3)' : 'var(--ink)',
                    }}
                  >
                    {p.status === 'out' ? '—' : formatNumberRu(p.stack)}
                  </div>
                </div>
              </div>
            ))}
            {players.length === 0 && (
              <div className="text-center text-[11px] text-ink-3 py-6">Никто не зарегистрирован</div>
            )}
          </Card>
        </div>
      )}

      {view === 'tables' && (
        <div className="px-5">
          <div className="grid grid-cols-3 gap-2">
            {tables.map((tb) => (
              <div
                key={tb.table}
                className="rounded-[14px] flex flex-col items-center justify-center p-2 cursor-pointer"
                style={{
                  aspectRatio: '1',
                  background: tb.mine ? 'var(--ink)' : 'var(--paper)',
                  color: tb.mine ? 'var(--paper)' : 'var(--ink)',
                  border: tb.mine ? '1px solid var(--gold)' : '1px solid var(--line-2)',
                }}
              >
                <div
                  className="uppercase font-semibold"
                  style={{
                    fontSize: 9,
                    letterSpacing: 0.6,
                    opacity: 0.5,
                  }}
                >
                  Стол
                </div>
                <div className="serif text-[28px] font-bold leading-none">T{tb.table}</div>
                <div
                  className="mono mt-1 font-semibold"
                  style={{
                    fontSize: 10,
                    color: tb.mine ? 'var(--gold)' : 'var(--ink-3)',
                  }}
                >
                  {tb.playersCount} игр.
                </div>
                {tb.mine && (
                  <div
                    className="uppercase font-bold mt-0.5"
                    style={{
                      fontSize: 8,
                      letterSpacing: 0.6,
                      color: 'var(--gold)',
                    }}
                  >
                    Мой
                  </div>
                )}
              </div>
            ))}
            {tables.length === 0 && (
              <div className="col-span-3 text-center text-[11px] text-ink-3 py-6">Столы не назначены</div>
            )}
          </div>
        </div>
      )}
    </ScrollScreen>
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
        <div
          className="mono"
          style={{ fontSize: 9, color: 'rgba(251,245,233,0.4)' }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

function PlayerBar({ reg, alive }: { reg: number; alive: number }) {
  const pct = reg > 0 ? (alive / reg) * 100 : 0;
  return (
    <div
      className="rounded-[5px] overflow-hidden flex"
      style={{ height: 10, background: 'rgba(122,46,46,0.18)' }}
    >
      <div style={{ width: `${pct}%`, background: 'var(--green)' }} />
    </div>
  );
}
