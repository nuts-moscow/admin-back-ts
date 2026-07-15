'use client';

import Link from 'next/link';
import type { PlayerTournamentSummary } from '@admin/schemas';
import { Card } from '@/components/card';
import { ChevRIcon } from '@/components/icons';
import { formatNumberRu, formatSeconds, formatTournamentDate } from '@/lib/format';
import { useLevelCountdown } from '@/lib/use-level-countdown';
import { useTournamentRegistration } from '@/lib/use-tournament-registration';

/**
 * Tournament card used on Home ("Сейчас идёт" / "Ближайший турнир") and Schedule
 * ("Сейчас в игре"). For in-progress tournaments it shows live stats + the clock;
 * for a not-yet-started (registration_open) tournament it shows entry / starting
 * stack / registered count plus a register button — same footprint either way.
 * Pass `primary` for the dark hero variant; `onChanged` refreshes after register.
 */
export function ActiveTournamentCard({
  t,
  primary = false,
  onChanged,
}: {
  t: PlayerTournamentSummary;
  primary?: boolean;
  onChanged?: () => void;
}) {
  const fd = formatTournamentDate(t.date);
  const dim = primary ? 'rgba(251,245,233,0.6)' : 'var(--ink-3)';
  const levelTimeRemainingSec = useLevelCountdown(t.levelTimeRemainingSec);
  const isUpcoming = t.status === 'registration_open';
  const { registered, busy, toggle } = useTournamentRegistration(t.id, t.isRegistered, onChanged);

  function onRegisterClick(e: React.MouseEvent | React.KeyboardEvent) {
    // The whole card is a link to the tournament; keep the button from navigating.
    e.preventDefault();
    e.stopPropagation();
    toggle();
  }
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
        {primary && <div className="grain" style={{ opacity: 0.15, mixBlendMode: 'screen' }} />}
        <div className="p-4 relative">
          <div className="flex justify-between items-start mb-3.5 gap-3">
            <div className="flex-1 min-w-0">
              {/* Metadata row: date / time / status as space-separated chunks. */}
              <div
                className="flex items-center gap-3 text-[10px] font-bold uppercase flex-wrap"
                style={{ letterSpacing: 1, color: dim }}
              >
                <span>
                  {fd.day} {fd.date.split('.')[0]}
                </span>
                <span>{fd.time}</span>
                <span className="inline-flex items-center gap-1.5">
                  {t.status === 'in_progress' && <span className="live-dot" />}
                  <span>
                    {t.status === 'in_progress'
                      ? t.breakActive
                        ? 'Перерыв'
                        : `Идёт уровень ${t.currentLevelNo ?? '—'}`
                      : t.status === 'registration_open'
                        ? 'Регистрация открыта'
                        : 'Поздняя регистрация'}
                  </span>
                </span>
              </div>
              <div
                className="serif mt-1.5"
                style={{
                  fontSize: 22,
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
              className="mt-1"
              style={{ color: primary ? 'rgba(251,245,233,0.5)' : 'var(--ink-3)' }}
            />
          </div>

          {/* Stat rows: flex pack-left with uniform gap. Adjacent cells get
              the same horizontal spacing regardless of content width. */}
          <div
            className={
              // Upcoming: 3 equal columns aligned left / center / right so the
              // values sit flush to their edges. In-progress packs 4 stats left.
              isUpcoming
                ? 'grid grid-cols-3 gap-x-2 py-3 overflow-hidden'
                : 'flex flex-nowrap gap-x-4 py-3 overflow-hidden'
            }
            style={{
              borderTop: primary ? '1px solid rgba(251,245,233,0.12)' : '1px solid var(--line-2)',
              borderBottom: primary ? '1px solid rgba(251,245,233,0.12)' : '1px solid var(--line-2)',
            }}
          >
            <MiniStat label="Орг. взнос" v={formatNumberRu(t.buyin)} primary={primary} />
            {isUpcoming ? (
              <>
                <MiniStat
                  label="Старт. стек"
                  v={formatNumberRu(t.startingStack)}
                  primary={primary}
                  align="center"
                />
                <MiniStat
                  label="Игроки"
                  v={String(t.registeredCount)}
                  primary={primary}
                  align="right"
                />
              </>
            ) : (
              <>
                <MiniStat
                  label="Игроки"
                  // "в игре / вошедшие": alive + eliminated (без не пришедших по записи)
                  v={`${t.aliveCount}/${t.aliveCount + t.eliminatedCount}`}
                  primary={primary}
                />
                <MiniStat label="Средний стэк" v={formatNumberRu(t.averageStack)} primary={primary} />
                <MiniStat
                  label="Блайнды"
                  v={
                    t.currentBlinds
                      ? `${t.currentBlinds.smallBlind}/${t.currentBlinds.bigBlind}`
                      : '—'
                  }
                  primary={primary}
                />
              </>
            )}
          </div>

          {isUpcoming ? (
            <div className="mt-3">
              <span
                role="button"
                tabIndex={0}
                onClick={onRegisterClick}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onRegisterClick(e);
                }}
                aria-disabled={busy}
                className="flex items-center justify-center rounded-lg font-bold uppercase tracking-wider cursor-pointer select-none"
                style={{
                  padding: '9px 12px',
                  fontSize: 12,
                  background: registered ? 'transparent' : 'var(--gold)',
                  color: registered ? (primary ? 'var(--paper)' : 'var(--ink)') : 'var(--ink)',
                  border: registered
                    ? `1px solid ${primary ? 'rgba(251,245,233,0.3)' : 'var(--line)'}`
                    : 'none',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? '…' : registered ? 'Отменить запись' : 'Записаться'}
              </span>
            </div>
          ) : (
            <div className="flex flex-nowrap gap-x-4 mt-3 overflow-hidden">
              <MiniStat label="Старт. стек" v={formatNumberRu(t.startingStack)} primary={primary} />
              <MiniStat
                label="Поздняя регистрация"
                v={t.lateRegistrationClosed ? 'Закрыта' : 'Открыта'}
                primary={primary}
              />
              <MiniStat
                label="Текущий уровень"
                v={formatSeconds(levelTimeRemainingSec)}
                gold
                primary={primary}
              />
            </div>
          )}
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
  align = 'left',
}: {
  label: string;
  v: React.ReactNode;
  primary?: boolean;
  gold?: boolean;
  align?: 'left' | 'center' | 'right';
}) {
  return (
    <div style={{ textAlign: align }}>
      <div
        className="font-bold uppercase"
        style={{
          fontSize: 8.5,
          letterSpacing: 0.3,
          whiteSpace: 'nowrap',
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
