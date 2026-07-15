'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PlayerPublicProfile, PlayerTournamentHistoryEntry } from '@admin/schemas';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { ChevLIcon, MedalIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { currentSeasonLabel, formatNumberRu, formatPoints, formatTournamentDate } from '@/lib/format';

interface Props {
  profile: PlayerPublicProfile;
  history: PlayerTournamentHistoryEntry[];
}

/**
 * Read-only public view of another player: identity + season stats + game
 * history. Mirrors the own-profile visuals minus private data and actions.
 */
export function PublicProfileScreen({ profile, history }: Props) {
  const router = useRouter();

  const medalColor =
    profile.medal === 'gold'
      ? 'var(--gold)'
      : profile.medal === 'silver'
        ? '#B8B0A0'
        : profile.medal === 'bronze'
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
        <div className="flex justify-start relative">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex items-center gap-1 cursor-pointer font-semibold uppercase tracking-wider"
            style={{
              background: 'rgba(251,245,233,0.1)',
              border: 0,
              borderRadius: 20,
              padding: '6px 12px 6px 8px',
              color: 'var(--paper)',
              fontSize: 11,
              fontFamily: 'inherit',
            }}
          >
            <ChevLIcon size={12} className="text-paper" /> Назад
          </button>
        </div>

        <div className="flex items-center gap-3.5 mt-2 relative">
          <div className="relative">
            <Avatar name={profile.name ?? profile.nickname} size={84} ring />
            {profile.medal !== 'none' && (
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
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div
              className="mono font-semibold"
              style={{ fontSize: 11, color: 'var(--gold)', letterSpacing: 0.4 }}
            >
              @{profile.nickname}
            </div>
            <div className="serif text-[26px] font-semibold leading-tight mt-0.5">
              {profile.name ?? profile.nickname}
            </div>
            <div className="text-[11px] mt-1" style={{ color: 'rgba(251,245,233,0.6)' }}>
              Рейтинг: {profile.rank != null ? `#${profile.rank}` : '—'} ·{' '}
              {formatPoints(profile.points)}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pt-3.5 flex flex-col gap-2.5">
        <Card padding={14}>
          <div
            className="uppercase font-bold mb-2.5"
            style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--ink-3)' }}
          >
            Сезон · {profile.season?.label ?? currentSeasonLabel()}
          </div>
          <div className="grid grid-cols-2 gap-3.5">
            <Stat label="Турниров" value={String(profile.playedTournaments)} />
            <Stat label="Побед" value={String(profile.wins)} />
            <Stat label="Финалов" value={String(profile.finalTables)} sub="столов" />
            <Stat label="Очки" value={formatNumberRu(profile.points)} />
            <Stat label="Нокауты" value={formatNumberRu(Math.round(profile.bountyCount))} />
            <Stat label="Рейтинговая зона" value={`${profile.itm}%`} />
          </div>
        </Card>

        <div
          className="uppercase font-bold mt-1.5 px-1"
          style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--ink-3)' }}
        >
          История игр
        </div>
        {history.length === 0 ? (
          <Card padding={14}>
            <div className="text-sm text-ink-3 text-center py-3">История пуста</div>
          </Card>
        ) : (
          <Card padding={0}>
            {history.map((h, i, arr) => {
              // Backend `place` is elimination order (1 = first bust); invert.
              const displayPlace =
                h.place != null && h.fieldSize > 0 ? h.fieldSize - h.place + 1 : null;
              return (
                <Link
                  key={h.tournamentId}
                  href={`/tournaments/${h.tournamentId}`}
                  className="block"
                >
                  <div
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    style={{
                      borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : 'none',
                    }}
                  >
                    <div className="min-w-0">
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
                      <div className="text-[13px] font-semibold text-ink truncate leading-tight mt-0.5">
                        {h.name}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div
                        className="serif font-bold"
                        style={{
                          fontSize: 15,
                          color:
                            displayPlace != null && displayPlace <= 3
                              ? 'var(--gold-2)'
                              : 'var(--ink)',
                        }}
                      >
                        {displayPlace ?? '—'}
                        <span className="text-[10px] text-ink-3"> / {h.fieldSize}</span>
                      </div>
                      <div
                        className="mono"
                        style={{
                          fontSize: 10,
                          color: h.pointsDelta >= 0 ? 'var(--green)' : 'var(--crimson)',
                        }}
                      >
                        {h.pointsDelta >= 0 ? '+' : ''}
                        {formatNumberRu(h.pointsDelta)}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}
      </div>

      <div className="h-4" />
    </ScrollScreen>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div
        className="uppercase font-bold"
        style={{ fontSize: 10, letterSpacing: 0.6, color: 'var(--ink-3)' }}
      >
        {label}
      </div>
      <div
        className="serif"
        style={{ fontSize: 22, fontWeight: 600, lineHeight: 1.05, marginTop: 2 }}
      >
        {value}
      </div>
      {sub && <div className="text-[11px] text-ink-3 mt-0.5">{sub}</div>}
    </div>
  );
}
