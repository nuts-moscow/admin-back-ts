'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PlayerTournamentHistoryEntry, PlayerTournamentSummary } from '@admin/schemas';
import { ActiveTournamentCard } from '@/components/active-tournament-card';
import { Card } from '@/components/card';
import { KV } from '@/components/kv';
import { ScrollScreen } from '@/components/scroll-screen';
import { SectionTitle } from '@/components/section-title';
import { fetchPlayerApi } from '@/lib/api';
import { formatNumberRu, formatRub, formatTournamentDate } from '@/lib/format';

type Tab = 'upcoming' | 'history';

export function ScheduleScreen({
  active,
  upcoming,
  history,
  onChanged,
}: {
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  history: PlayerTournamentHistoryEntry[];
  onChanged?: () => void;
}) {
  const [tab, setTab] = useState<Tab>('upcoming');

  return (
    <ScrollScreen>
      <div className="px-5 pt-3.5">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-ink-3 mb-1">
          Турниры
        </div>
        <h1 className="serif m-0 text-[40px] font-semibold text-ink leading-none">
          Расписание
        </h1>
      </div>

      <div className="px-5 pt-3.5 pb-3.5">
        <div className="flex gap-1 bg-[rgba(27,22,18,0.06)] rounded-xl p-1">
          {([
            { id: 'upcoming', l: 'Расписание' },
            { id: 'history', l: 'История игр' },
          ] as const).map((x) => (
            <button
              key={x.id}
              onClick={() => setTab(x.id)}
              className="flex-1 px-3 py-2 border-0 rounded-full cursor-pointer text-xs font-bold uppercase tracking-wider"
              style={{
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

      {tab === 'upcoming' && (
        <>
          {active.length > 0 && (
            <>
              <SectionTitle>Сейчас в игре</SectionTitle>
              <div className="px-5 flex flex-col gap-2.5">
                {active.map((t, i) => (
                  <ActiveTournamentCard key={t.id} t={t} primary={i === 0} />
                ))}
              </div>
            </>
          )}

          <SectionTitle>Ближайшие</SectionTitle>
          <div className="px-5 flex flex-col gap-2.5">
            {upcoming.map((u) => (
              <UpcomingCard key={u.id} u={u} onChanged={onChanged} />
            ))}
            {upcoming.length === 0 && (
              <Card padding={14}>
                <div className="text-sm text-ink-3 text-center py-3">
                  Расписание пустое
                </div>
              </Card>
            )}
          </div>
        </>
      )}

      {tab === 'history' && (
        <>
          <SectionTitle>История игр</SectionTitle>
          <div className="px-5 flex flex-col gap-2.5">
            {history.length === 0 && (
              <Card padding={14}>
                <div className="text-sm text-ink-3 text-center py-3">
                  Ещё нет сыгранных турниров
                </div>
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
                        {formatTournamentDate(new Date(h.date).getTime()).date} · орг. взнос{' '}
                        {formatNumberRu(h.buyin)}
                      </div>
                      <div className="serif text-[17px] font-semibold leading-tight mt-1">
                        {h.name}
                      </div>
                    </div>
                    <div className="text-right">
                      {(() => {
                        /* Backend `placement` is elimination order from start
                           (1 = first bust, N = winner). Invert for display
                           so the user sees their actual finishing place. */
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
        </>
      )}
    </ScrollScreen>
  );
}

function UpcomingCard({
  u,
  onChanged,
}: {
  u: PlayerTournamentSummary;
  onChanged?: () => void;
}) {
  const fd = formatTournamentDate(u.date);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Server truth is `u.isRegistered`; `optimistic` flips the button instantly on
  // click and is cleared once a refresh brings the server value into agreement.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const registered = optimistic ?? u.isRegistered;

  useEffect(() => {
    setOptimistic(null);
  }, [u.isRegistered]);

  async function toggle() {
    const next = !registered;
    setError(null);
    setBusy(true);
    setOptimistic(next);
    try {
      if (next) {
        await fetchPlayerApi(`/api/player/tournaments/${u.id}/register`, {
          method: 'POST',
          body: {},
        });
      } else {
        await fetchPlayerApi(`/api/player/tournaments/${u.id}/register`, {
          method: 'DELETE',
        });
      }
      // Re-fetch so u.isRegistered and the player count reflect the change;
      // polling covers registrations by others.
      onChanged?.();
    } catch (err) {
      setOptimistic(null); // revert to server truth on failure
      setError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card padding={0} className="overflow-hidden">
      <div className="flex">
        <div
          className="w-16 bg-bg-3 py-3 px-2 flex flex-col items-center justify-center border-r border-line-2"
        >
          <div className="text-[10px] text-ink-3 font-bold tracking-wider">{fd.day}</div>
          <div className="serif text-[26px] font-bold leading-none">
            {fd.date.split('.')[0]}
          </div>
          <div className="mono text-[11px] text-ink-2 mt-1 font-semibold">{fd.time}</div>
        </div>
        <div className="flex-1 p-3">
          <div className="serif text-[17px] font-semibold leading-tight">{u.name}</div>
          <div className="grid grid-cols-2 gap-x-2.5 gap-y-1.5 mt-2.5">
            <KV k="Орг. взнос" v={formatRub(u.buyin)} />
            <KV k="Стек" v={formatNumberRu(u.startingStack)} />
            <KV k="Поздняя регистрация" v={u.lateRegistrationClosed ? 'Закрыта' : 'Открыта'} />
            <KV k="Игроков" v={String(u.registeredCount)} />
          </div>
          <div className="flex justify-end items-center mt-2.5 pt-2.5 border-t border-line-2">
            <button
              type="button"
              disabled={busy}
              onClick={toggle}
              className="border-0 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60"
              style={{
                background: registered ? 'transparent' : 'var(--ink)',
                color: registered ? 'var(--ink)' : 'var(--paper)',
                border: registered ? '1px solid var(--line)' : 'none',
                fontFamily: 'inherit',
              }}
            >
              {busy ? '…' : registered ? 'Отменить запись' : 'Записаться'}
            </button>
          </div>
          {error && (
            <div className="mt-2 text-[11px] text-crimson" role="alert">
              {error}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
