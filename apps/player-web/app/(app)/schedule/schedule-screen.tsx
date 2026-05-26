'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import type { PlayerTournamentHistoryEntry, PlayerTournamentSummary } from '@admin/schemas';
import { Card } from '@/components/card';
import { ChevRIcon, UsersIcon } from '@/components/icons';
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
}: {
  active: PlayerTournamentSummary[];
  upcoming: PlayerTournamentSummary[];
  history: PlayerTournamentHistoryEntry[];
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
              className="flex-1 px-3 py-2 border-0 rounded-[9px] cursor-pointer text-xs font-bold uppercase tracking-wider"
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
                {active.map((t) => (
                  <Link key={t.id} href={`/tournaments/${t.id}`}>
                    <Card padding={14}>
                      <div className="flex justify-between items-start gap-2.5">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="live-dot" />
                            <span
                              className="font-bold uppercase"
                              style={{
                                fontSize: 10,
                                letterSpacing: 1,
                                color: 'var(--crimson)',
                              }}
                            >
                              {t.status === 'in_progress'
                                ? `Идёт · L${t.currentLevelNo ?? '—'}`
                                : 'Поздняя регистрация'}
                            </span>
                          </div>
                          <div className="serif text-[19px] font-semibold leading-tight">
                            {t.name}
                          </div>
                        </div>
                        <ChevRIcon size={16} style={{ color: 'var(--ink-3)' }} />
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-3">
                        <KV k="Игроки" v={`${t.aliveCount}/${t.registeredCount}`} />
                        <KV k="Средний стэк" v={formatNumberRu(t.averageStack)} />
                        <KV
                          k="Блайнды"
                          v={
                            t.currentBlinds
                              ? `${t.currentBlinds.smallBlind}/${t.currentBlinds.bigBlind}`
                              : '—'
                          }
                        />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </>
          )}

          <SectionTitle>Ближайшие</SectionTitle>
          <div className="px-5 flex flex-col gap-2.5">
            {upcoming.map((u) => (
              <UpcomingCard key={u.id} u={u} />
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
              <Card key={h.tournamentId} padding={14}>
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
                    <div
                      className="serif font-bold"
                      style={{
                        fontSize: 18,
                        color:
                          h.place != null && h.place <= 3 ? 'var(--gold-2)' : 'var(--ink)',
                      }}
                    >
                      #{h.place ?? '—'}
                      <span className="text-xs text-ink-3"> / {h.fieldSize}</span>
                    </div>
                    <div
                      className="mono mt-0.5"
                      style={{
                        fontSize: 11,
                        color: h.pointsDelta >= 0 ? 'var(--green)' : 'var(--crimson)',
                      }}
                    >
                      {h.pointsDelta >= 0 ? '+' : ''}
                      {formatNumberRu(h.pointsDelta)} pts
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-line-2">
                  <span className="text-[11px] text-ink-3">Приз</span>
                  <span
                    className="mono"
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: h.prize == null ? 'var(--ink-3)' : 'var(--green)',
                    }}
                  >
                    {h.prize == null ? '—' : formatRub(h.prize)}
                  </span>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}
    </ScrollScreen>
  );
}

function UpcomingCard({ u }: { u: PlayerTournamentSummary }) {
  const router = useRouter();
  const fd = formatTournamentDate(u.date);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState(false);

  async function register() {
    setError(null);
    try {
      await fetchPlayerApi(`/api/player/tournaments/${u.id}/register`, {
        method: 'POST',
        body: {},
      });
      setRegistered(true);
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка');
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
          <div className="flex justify-between items-center mt-2.5 pt-2.5 border-t border-line-2">
            <div className="text-[11px] text-ink-3 inline-flex items-center gap-1">
              <UsersIcon size={12} />
              <span>{u.registeredCount} записались</span>
            </div>
            <button
              type="button"
              disabled={pending || registered}
              onClick={register}
              className="border-0 rounded-lg px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider cursor-pointer disabled:opacity-60"
              style={{
                background: registered ? 'var(--green)' : 'var(--ink)',
                color: 'var(--paper)',
                fontFamily: 'inherit',
              }}
            >
              {registered ? 'Записаны' : pending ? '…' : 'Записаться'}
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
