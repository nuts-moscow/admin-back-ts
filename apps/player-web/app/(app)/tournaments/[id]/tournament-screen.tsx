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
import { ChevLIcon, MedalIcon } from '@/components/icons';
import { KV } from '@/components/kv';
import { ScrollScreen } from '@/components/scroll-screen';
import { fetchPlayerApi } from '@/lib/api';
import { formatNumberRu, formatSeconds, formatTournamentDate } from '@/lib/format';
import { useLevelCountdown } from '@/lib/use-level-countdown';

type Tab = 'overview' | 'players';

interface Props {
  detail: PlayerTournamentDetail;
  players: PlayerTournamentPlayer[];
  tables: PlayerTournamentTable[];
  myState: PlayerMyTournamentState | null;
  /** Refetches the page data at once — called after register/cancel succeeds. */
  onChanged?: () => void;
}

export function TournamentScreen({ detail, players, tables, myState, onChanged }: Props) {
  const [view, setView] = useState<Tab>('overview');
  const s = useLevelCountdown(detail.levelTimeRemainingSec);

  // Progress bar denominator: the current step's duration — a break has no
  // currentBlinds, so the dedicated field covers both step kinds.
  const levelTotal =
    (detail.currentStepDurationMin ?? detail.currentBlinds?.durationMin ?? 20) * 60;
  const pct = Math.max(0, Math.min(100, (s / levelTotal) * 100));

  // Completed tournaments drop the live clock/blinds/register header and the
  // Обзор/Игроки tabs: instead we show the player's own result, then the final
  // standings list directly.
  const isCompleted = detail.status === 'completed';

  // Field size for inverting elimination order → finishing place. `registeredCount`
  // comes from live Redis state, which is cleared once a tournament completes (→ 0),
  // so fall back to the max `place` in the durable standings. For a live tournament
  // every `place` ≤ registeredCount, so this is a no-op there.
  const fieldSize = Math.max(
    detail.registeredCount,
    ...players.map((p) => p.place ?? 0),
  );

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
            href="/"
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

        {(() => {
          const fd = formatTournamentDate(detail.date);
          return (
            <div className="relative mt-2.5">
              <span
                className="inline-flex items-center uppercase font-bold rounded-full"
                style={{
                  fontSize: 12,
                  letterSpacing: 0.8,
                  padding: '5px 12px',
                  background: 'rgba(181,138,60,0.15)',
                  border: '1px solid rgba(181,138,60,0.35)',
                  color: 'var(--gold)',
                }}
              >
                {fd.day} {fd.date} · {fd.time}
              </span>
            </div>
          );
        })()}

        {isCompleted ? (
          <MyResultPanel r={detail.myResult} />
        ) : (
          <>
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
                {detail.breakActive ? 'Перерыв' : `Уровень ${detail.currentLevelNo ?? '—'}`}
              </div>
              <div className="mono mt-0.5" style={{ fontSize: 13, color: 'var(--gold)', fontWeight: 600 }}>
                {detail.breakActive
                  ? 'До конца перерыва'
                  : detail.currentBlinds
                    ? `${detail.currentBlinds.smallBlind} / ${detail.currentBlinds.bigBlind}`
                    : '— / —'}
                {!detail.breakActive && detail.currentBlinds && detail.currentBlinds.ante > 0 && (
                  <span style={{ color: 'rgba(251,245,233,0.5)' }}>
                    {'  '}ante {detail.currentBlinds.ante}
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
                {detail.nextStepIsBreak
                  ? 'Перерыв'
                  : detail.nextBlinds
                    ? `${detail.nextBlinds.smallBlind} / ${detail.nextBlinds.bigBlind}`
                    : '—'}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div
              style={{
                fontFamily: 'var(--font-mono), ui-monospace, monospace',
                fontSize: 64,
                fontWeight: 600,
                letterSpacing: -1,
                lineHeight: 1,
                color: 'var(--paper)',
              }}
            >
              {formatSeconds(s)}
            </div>
            <RegisterButton
              tournamentId={detail.id}
              initiallyRegistered={myState != null}
              lateRegClosed={detail.lateRegistrationClosed}
              onChanged={onChanged}
            />
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

        {/*
          justify-between spreads the 4 stats so the visual gap between each
          adjacent pair is equal, regardless of how wide each stat's content
          actually is. Equal-width grid columns made ИГРОКИ leave a big hole
          before СРЕДНИЙ СТЭК; this fixes that.
        */}
        <div
          className="mt-4 relative flex flex-nowrap justify-between overflow-hidden"
          style={{
            padding: 12,
            borderRadius: 14,
            background: 'rgba(251,245,233,0.06)',
            border: '1px solid rgba(251,245,233,0.08)',
          }}
        >
          <DarkStat
            label="Игроки"
            // «ещё в игре или в записи / всего записалось» — записавшиеся,
            // но не вошедшие, считаются в обеих частях; выбывшие уходят
            // только из числителя.
            v={`${detail.registeredCount - detail.eliminatedCount} / ${detail.registeredCount}`}
          />
          <DarkStat label="Средний стэк" v={formatNumberRu(detail.averageStack)} />
          <DarkStat label="Стартовый стэк" v={formatNumberRu(detail.startingStack)} />
          {/*
            Before the game starts it's plain registration ("Запись на игру"),
            not LATE registration — that concept only applies once play is under
            way. Once in_progress/completed we show the late-reg status. Backend
            only exposes lateRegistrationClosed (boolean); to make this a live
            countdown, add late_registration_closes_at to PlayerTournamentDetail.
          */}
          {detail.status === 'registration_open' ? (
            <DarkStat label="Запись на игру" v="Открыта" />
          ) : (
            <DarkStat
              label="Поздняя регистрация"
              v={detail.lateRegistrationClosed ? 'Закрыта' : 'Открыта'}
            />
          )}
        </div>
          </>
        )}
      </div>

      {!isCompleted && (
        <div className="px-5 pt-4 pb-3">
          <div
            className="flex gap-1 rounded-xl p-1"
            style={{ background: 'rgba(27,22,18,0.06)' }}
          >
            {([
              { id: 'overview', l: 'Обзор' },
              { id: 'players', l: 'Игроки' },
            ] as const).map((x) => (
              <button
                key={x.id}
                onClick={() => setView(x.id)}
                className="flex-1 border-0 rounded-full cursor-pointer font-bold uppercase tracking-wider"
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
      )}

      {!isCompleted && view === 'overview' && (
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
                k="Ограничение по повторным входам до:"
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
        </div>
      )}

      {(isCompleted || view === 'players') && (
        <div className={isCompleted ? 'px-5 pt-4' : 'px-5'}>
          <Card padding={0}>
            {/* Column header */}
            <div
              className="px-3 py-2 uppercase font-bold text-ink-3"
              style={{
                fontSize: 10,
                letterSpacing: 0.6,
                borderBottom: '1px solid var(--line-2)',
              }}
            >
              {isCompleted ? 'Итоговые места' : 'Место'}
            </div>
            {/* Active players (place === null) at the top — my own active
                row pinned first among them. Among the eliminated, sort by
                display ASC: first-to-bust (#1) just below the active
                section, then #2, #3, …, runner-up at the very bottom —
                pinning never reshuffles standings. */}
            {[...players]
              .sort((a, b) => {
                if (a.place === null && b.place === null)
                  return (b.isMe ? 1 : 0) - (a.isMe ? 1 : 0);
                if (a.place === null) return -1;
                if (b.place === null) return 1;
                return b.place - a.place;
              })
              .map((p, i, sorted) => {
                /* Eliminated → inverted order from the start of the
                   tournament (#1 = first to bust). Sole remaining alive
                   player → автоматически "1" (1st place, the de-facto
                   winner). Multiple still in game → no number yet. */
                const displayPlace =
                  p.status === 'out' && p.place != null
                    ? fieldSize - p.place + 1
                    : p.status !== 'out' && detail.aliveCount === 1
                      ? 1
                      : null;
                return (
                  <Link
                    key={`${p.playerId}-${i}`}
                    href={`/players/${p.playerId}`}
                    className="flex items-center gap-2.5 px-3 py-2.5"
                    style={{
                      borderBottom: i < sorted.length - 1 ? '1px solid var(--line-2)' : 'none',
                      // "Me" row: strong gold tint + gold left accent so it's
                      // unmistakable in a long list. Transparent 3px border on
                      // every row keeps content aligned.
                      borderLeft: `3px solid ${p.isMe ? 'var(--gold-2)' : 'transparent'}`,
                      background: p.isMe ? 'rgba(181,138,60,0.22)' : 'transparent',
                      opacity: p.status === 'out' ? 0.4 : 1,
                    }}
                  >
                    <div
                      className="serif font-bold text-ink shrink-0 text-center"
                      style={{
                        fontSize: 22,
                        lineHeight: 1,
                        minWidth: 32,
                      }}
                    >
                      {displayPlace ?? ''}
                    </div>
                    {/* Top-3 finishers get a small medal badge attached to
                        the bottom-right of the avatar — gold / silver / bronze. */}
                    {(() => {
                      const medalColor =
                        displayPlace === 1
                          ? '#D4A645'
                          : displayPlace === 2
                            ? '#B8B0A0'
                            : displayPlace === 3
                              ? '#A87750'
                              : null;
                      return (
                        <div className="relative shrink-0">
                          <Avatar name={p.nickname} size={32} ring={p.isMe} />
                          {medalColor != null && (
                            <div
                              className="flex items-center justify-center"
                              style={{
                                position: 'absolute',
                                bottom: -2,
                                right: -2,
                                width: 16,
                                height: 16,
                                borderRadius: '50%',
                                background: `radial-gradient(circle at 35% 30%, ${medalColor}ee, ${medalColor}88)`,
                                border: '1.5px solid var(--paper)',
                                color: 'var(--paper)',
                                boxShadow:
                                  'inset 0 -1px 2px rgba(0,0,0,0.2), 0 1px 2px rgba(0,0,0,0.15)',
                              }}
                            >
                              <MedalIcon size={10} />
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex-1 min-w-0 flex items-center gap-2">
                      <div
                        className="text-[13px] font-semibold truncate"
                        style={{ color: p.isMe ? 'var(--gold-2)' : 'var(--ink)' }}
                      >
                        {p.nickname}
                      </div>
                      {p.isMe && (
                        <span
                          className="shrink-0 uppercase font-bold"
                          style={{
                            fontSize: 9,
                            letterSpacing: 0.5,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'var(--gold)',
                            color: 'var(--ink)',
                          }}
                        >
                          Вы
                        </span>
                      )}
                      {p.status === 'registered' && (
                        <span
                          className="shrink-0 uppercase font-bold"
                          style={{
                            fontSize: 9,
                            letterSpacing: 0.5,
                            padding: '2px 6px',
                            borderRadius: 999,
                            background: 'rgba(27,22,18,0.07)',
                            border: '1px solid var(--line-2)',
                            color: 'var(--ink-3)',
                          }}
                        >
                          Запись
                        </span>
                      )}
                    </div>
                  </Link>
                );
              })}
            {players.length === 0 && (
              <div className="text-center text-[11px] text-ink-3 py-6">Никто не зарегистрирован</div>
            )}
          </Card>
        </div>
      )}

    </ScrollScreen>
  );
}

function RegisterButton({
  tournamentId,
  initiallyRegistered,
  lateRegClosed,
  onChanged,
}: {
  tournamentId: number;
  initiallyRegistered: boolean;
  lateRegClosed: boolean;
  onChanged?: () => void;
}) {
  const [registered, setRegistered] = useState(initiallyRegistered);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Server truth arrives with every poll/refetch — let it reconcile the
  // local flip (e.g. a registration cancelled from another device).
  useEffect(() => {
    setRegistered(initiallyRegistered);
  }, [initiallyRegistered]);

  // Hide entirely when late registration has closed AND player isn't already
  // signed up — they can still see (and cancel) an existing registration.
  if (lateRegClosed && !registered) return null;

  async function toggle() {
    setError(null);
    setPending(true);
    try {
      if (registered) {
        await fetchPlayerApi(`/api/player/tournaments/${tournamentId}/register`, {
          method: 'DELETE',
        });
        setRegistered(false);
      } else {
        await fetchPlayerApi(`/api/player/tournaments/${tournamentId}/register`, {
          method: 'POST',
          body: {},
        });
        setRegistered(true);
      }
      // Refetch the page data at once — the roster and counters must not
      // wait out the 15s poll tick.
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        className="relative rounded-full font-bold uppercase tracking-wider cursor-pointer disabled:cursor-default text-center"
        style={{
          padding: '10px 16px',
          fontSize: 12,
          // Cancel: subtle dark transparent; Register: cream paper button.
          background: registered ? 'rgba(251,245,233,0.1)' : 'var(--paper)',
          color: registered ? 'var(--paper)' : 'var(--ink)',
          border: `1px solid ${registered ? 'rgba(251,245,233,0.2)' : 'transparent'}`,
          fontFamily: 'inherit',
          opacity: pending ? 0.6 : 1,
          transition:
            'background 0.25s ease, color 0.25s ease, border-color 0.25s ease, opacity 0.15s ease',
        }}
      >
        {/* The longest label sizes the button invisibly in both states, so
            toggling swaps only colors and never the footprint; the actual
            label is centered on top. */}
        <span style={{ visibility: 'hidden' }}>Отменить запись</span>
        <span className="absolute inset-0 flex items-center justify-center">
          {pending ? '…' : registered ? 'Отменить запись' : 'Записаться'}
        </span>
      </button>
      {error && (
        <div className="text-[10px] text-crimson max-w-[140px] text-right">
          {error}
        </div>
      )}
    </div>
  );
}

function MyResultPanel({ r }: { r: PlayerTournamentDetail['myResult'] }) {
  const panelStyle = {
    padding: 14,
    borderRadius: 14,
    background: 'rgba(251,245,233,0.06)',
    border: '1px solid rgba(251,245,233,0.08)',
  } as const;

  if (!r) {
    return (
      <div className="mt-4 relative" style={panelStyle}>
        <div className="text-[13px]" style={{ color: 'rgba(251,245,233,0.6)' }}>
          Вы не участвовали в этом турнире.
        </div>
      </div>
    );
  }

  const isWinner = r.place === 1;
  const isTop3 = r.place != null && r.place <= 3;

  return (
    <div className="mt-4 relative" style={panelStyle}>
      <div
        className="uppercase font-bold"
        style={{ fontSize: 10, letterSpacing: 0.6, color: 'rgba(251,245,233,0.5)' }}
      >
        Мой результат
      </div>

      <div className="flex items-end gap-7 mt-2">
        <div>
          <div
            className="serif font-bold leading-none"
            style={{ fontSize: 34, color: isTop3 ? 'var(--gold)' : 'var(--paper)' }}
          >
            {r.place ?? '—'}
          </div>
          <div className="mono mt-1" style={{ fontSize: 10, color: 'rgba(251,245,233,0.5)' }}>
            место из {r.fieldSize}
          </div>
        </div>
        <div>
          <div
            className="serif font-bold leading-none"
            style={{ fontSize: 34, color: r.points >= 0 ? 'var(--gold)' : 'var(--crimson)' }}
          >
            {r.points >= 0 ? '+' : ''}
            {formatNumberRu(r.points)}
          </div>
          <div className="mono mt-1" style={{ fontSize: 10, color: 'rgba(251,245,233,0.5)' }}>
            баллов
          </div>
        </div>
      </div>

      <div
        className="mt-3.5 pt-3 flex flex-col gap-2"
        style={{ borderTop: '1px solid rgba(251,245,233,0.1)' }}
      >
        <ResultRow
          k="Кого выбил"
          v={r.knockouts.length > 0 ? r.knockouts.map((k) => k.nickname).join(', ') : '—'}
        />
        <ResultRow
          k="Меня выбил"
          v={
            isWinner
              ? '🏆 Победитель'
              : r.eliminatedBy.length > 0
                ? r.eliminatedBy.map((k) => k.nickname).join(', ')
                : '—'
          }
        />
      </div>
    </div>
  );
}

function ResultRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span
        className="uppercase font-bold shrink-0"
        style={{ fontSize: 9.5, letterSpacing: 0.6, color: 'rgba(251,245,233,0.5)' }}
      >
        {k}
      </span>
      <span
        className="text-[13px] font-semibold text-right"
        style={{ color: 'var(--paper)' }}
      >
        {v}
      </span>
    </div>
  );
}

function DarkStat({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div>
      {/* nowrap on the label so it stays on one line and the cell is sized
          by its natural width — the parent uses flex-nowrap, so all 4 stats
          pack into a single row. */}
      <div
        className="uppercase font-bold"
        style={{
          fontSize: 8.5,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
          color: 'rgba(251,245,233,0.5)',
        }}
      >
        {label}
      </div>
      <div
        className="serif"
        style={{
          fontSize: 17,
          fontWeight: 600,
          color: 'var(--paper)',
          lineHeight: 1.1,
          marginTop: 2,
          whiteSpace: 'nowrap',
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

