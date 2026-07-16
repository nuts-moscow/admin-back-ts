'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type {
  HallOfFameEntry,
  PlayerSeason,
  PlayerSeasonRatingEntry,
} from '@admin/schemas';
import { Avatar } from '@/components/avatar';
import { Card } from '@/components/card';
import { ArrowDownIcon, ArrowUpIcon, TrophyIcon } from '@/components/icons';
import { ScrollScreen } from '@/components/scroll-screen';
import { fetchPlayerApi } from '@/lib/api';
import { formatNumberRu, formatPoints } from '@/lib/format';

type Tab = 'season' | 'hof';

interface Props {
  seasons: PlayerSeason[];
  initialEntries: PlayerSeasonRatingEntry[];
  hallOfFame: HallOfFameEntry[];
  initialYear: number;
  initialMonth: number;
}

export function RatingScreen({
  seasons,
  initialEntries,
  hallOfFame,
  initialYear,
  initialMonth,
}: Props) {
  const PAGE = 50;
  const [tab, setTab] = useState<Tab>('season');
  const [seasonKey, setSeasonKey] = useState(`${initialYear}-${initialMonth}`);
  const [entries, setEntries] = useState(initialEntries);
  const [loading, setLoading] = useState(false);
  // Infinite scroll: a full page means there may be more rows behind it.
  const [hasMore, setHasMore] = useState(initialEntries.length >= PAGE);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const currentSeasonLabel =
    seasons.find((s) => `${s.year}-${s.month}` === seasonKey)?.label ?? '';

  useEffect(() => {
    const [y, m] = seasonKey.split('-').map(Number);
    // Current season: reuse the server-rendered initial data — no refetch, and
    // crucially reset to it so switching back doesn't leave another season's rows.
    if (seasonKey === `${initialYear}-${initialMonth}`) {
      setEntries(initialEntries);
      setHasMore(initialEntries.length >= PAGE);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchPlayerApi<{ entries: PlayerSeasonRatingEntry[] }>(
      `/api/player/rating/season?year=${y}&month=${m}&limit=${PAGE}`,
    )
      .catch(() => ({ entries: [] }))
      .then((s) => {
        if (cancelled) return;
        setEntries(s.entries);
        setHasMore(s.entries.length >= PAGE);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [seasonKey, initialYear, initialMonth, initialEntries]);

  // Append the next page when the sentinel below the table scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || tab !== 'season') return;
    const obs = new IntersectionObserver((hits) => {
      if (!hits.some((h) => h.isIntersecting)) return;
      if (loading || loadingMore || !hasMore) return;
      const [y, m] = seasonKey.split('-').map(Number);
      const offset = entries.length;
      setLoadingMore(true);
      void fetchPlayerApi<{ entries: PlayerSeasonRatingEntry[] }>(
        `/api/player/rating/season?year=${y}&month=${m}&limit=${PAGE}&offset=${offset}`,
      )
        .catch(() => ({ entries: [] }))
        .then((s) => {
          // Guard against a backend that ignores `offset` (or any overlap):
          // only genuinely new players extend the list; an all-duplicate page
          // means no progress — stop asking.
          const seen = new Set(entries.map((e) => e.playerId));
          const fresh = s.entries.filter((e) => !seen.has(e.playerId));
          if (fresh.length === 0) {
            setHasMore(false);
          } else {
            setEntries((prev) => [...prev, ...fresh]);
            setHasMore(s.entries.length >= PAGE);
          }
          setLoadingMore(false);
        });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [tab, seasonKey, entries.length, hasMore, loading, loadingMore]);

  return (
    <ScrollScreen>
      <div className="px-5 pt-3.5">
        <div className="text-[11px] uppercase tracking-widest font-semibold text-ink-3 mb-1">
          Сезон · {currentSeasonLabel}
        </div>
        <h1 className="serif m-0 text-[40px] font-semibold text-ink leading-none">Рейтинг</h1>
      </div>

      <div className="px-5 pt-3 pb-3">
        <div className="flex gap-1 bg-[rgba(27,22,18,0.06)] rounded-xl p-1">
          {([
            { id: 'season', l: 'Сезон' },
            { id: 'hof', l: 'Зал славы' },
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

      {tab !== 'hof' && (
        <div className="px-5 pb-3.5">
          <div className="scroll flex gap-2 overflow-x-auto pb-1">
            {/* Descending by date: the current season first (leftmost). */}
            {[...seasons]
              .sort((a, b) => b.year - a.year || b.month - a.month)
              .map((s) => {
              const key = `${s.year}-${s.month}`;
              const active = key === seasonKey;
              return (
                <button
                  key={key}
                  onClick={() => setSeasonKey(key)}
                  className="rounded-full border font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1.5 flex-shrink-0"
                  style={{
                    padding: '8px 14px',
                    borderColor: active ? 'var(--ink)' : 'var(--line)',
                    background: active ? 'var(--ink)' : 'transparent',
                    color: active ? 'var(--paper)' : 'var(--ink-2)',
                    fontSize: 11.5,
                    fontFamily: 'inherit',
                  }}
                >
                  {s.isCurrent && !active && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: 'var(--green)',
                      }}
                    />
                  )}
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'season' && (
        <>
          {!loading && entries.length >= 3 && (
            <div className="px-5 pb-3.5">
              <Podium top3={entries.slice(0, 3)} seasonLabel={currentSeasonLabel} />
            </div>
          )}
          <div className="px-5">
            <Card padding={0}>
              <div
                className="grid gap-2.5 px-3.5 py-2.5 uppercase font-bold"
                style={{
                  gridTemplateColumns: '36px 1fr 60px 96px',
                  fontSize: 9,
                  color: 'var(--ink-3)',
                  letterSpacing: 0.6,
                  borderBottom: '1px solid var(--line-2)',
                  // Rows carry a 3px qualification accent — keep columns aligned.
                  borderLeft: '3px solid transparent',
                }}
              >
                <div />
                <div>Игрок</div>
                <div className="text-right">Баллы</div>
                <div className="text-center" style={{ whiteSpace: 'nowrap' }}>Рейтинговая зона</div>
              </div>
              {loading && (
                <div className="text-center text-[11px] text-ink-3 py-6">Загрузка…</div>
              )}
              {!loading && entries.map((p, i, arr) => {
                /* Season-final qualification: 1–3 medal colors, 4–27 a soft
                   gold accent — all 27 advance to the month's final. */
                const medal =
                  p.rank === 1
                    ? '#D4A645'
                    : p.rank === 2
                      ? '#B8B0A0'
                      : p.rank === 3
                        ? '#A87750'
                        : null;
                const qualifies = p.rank <= 27;
                return (
                <Link
                  key={`${p.rank}-${p.playerId}`}
                  href={`/players/${p.playerId}`}
                  className="grid items-center gap-2.5 px-3.5"
                  style={{
                    gridTemplateColumns: '36px 1fr 60px 96px',
                    padding: '11px 14px',
                    borderBottom: i < arr.length - 1 ? '1px solid var(--line-2)' : 'none',
                    borderLeft: `3px solid ${
                      medal ?? (qualifies ? 'rgba(181,138,60,0.35)' : 'transparent')
                    }`,
                    // The whole row is tinted, not just the accent stripe:
                    // medal rows in their metal, finalists in soft gold; the
                    // «me» row keeps the strongest tint either way.
                    background: p.isMe
                      ? 'rgba(181,138,60,0.18)'
                      : p.rank === 1
                        ? 'rgba(212,166,69,0.14)'
                        : p.rank === 2
                          ? 'rgba(184,176,160,0.18)'
                          : p.rank === 3
                            ? 'rgba(168,119,80,0.14)'
                            : qualifies
                              ? 'rgba(181,138,60,0.07)'
                              : 'transparent',
                  }}
                >
                  <div
                    className="mono font-bold"
                    style={{
                      fontSize: 13,
                      color: medal ?? (qualifies ? 'var(--gold-2)' : 'var(--ink)'),
                    }}
                  >
                    {p.rank}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar name={p.name ?? p.nickname} size={28} ring={p.isMe} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold text-ink truncate">
                        {p.name ?? p.nickname}
                      </div>
                      <div className="mono text-[10px] text-ink-3">{p.played} турн.</div>
                    </div>
                  </div>
                  <div className="mono text-right" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>
                    {formatNumberRu(p.points)}
                  </div>
                  <div className="mono text-center text-[11px] text-ink-2">
                    {p.itm}/{p.played}
                  </div>
                </Link>
                );
              })}
              {!loading && entries.length === 0 && (
                <div className="text-center text-[11px] text-ink-3 py-6">Нет данных</div>
              )}
            </Card>
            {!loading && hasMore && (
              <div ref={sentinelRef} className="text-center text-[11px] text-ink-3 py-3">
                {loadingMore ? 'Загрузка…' : ''}
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'hof' && (
        <>
          <div className="px-5 pb-3">
            <div className="text-xs text-ink-2 leading-relaxed">
              All-time hall: лучшие игроки в истории клуба Nuts Family.
            </div>
          </div>
          <div className="px-5 flex flex-col gap-2.5">
            {hallOfFame.map((h) => (
              <Card key={h.id} padding={0} className="overflow-hidden">
                <div className="flex">
                  <div
                    className="w-[70px] py-3.5 px-2 flex flex-col items-center justify-center"
                    style={{
                      background: 'var(--ink)',
                      color: 'var(--gold)',
                      borderRight: '1px solid var(--ink)',
                    }}
                  >
                    <div
                      className="uppercase font-bold"
                      style={{
                        fontSize: 9,
                        letterSpacing: 0.6,
                        opacity: 0.6,
                      }}
                    >
                      Сезон
                    </div>
                    <div className="serif text-[24px] font-bold leading-none">{h.year}</div>
                    <div className="mt-1.5">
                      <TrophyIcon size={18} className="text-gold" />
                    </div>
                  </div>
                  <div className="flex-1 p-3.5 flex items-center gap-3">
                    <Avatar name={h.name ?? h.nickname} size={48} ring />
                    <div className="flex-1 min-w-0">
                      <div
                        className="uppercase font-bold"
                        style={{
                          fontSize: 10,
                          letterSpacing: 0.6,
                          color: 'var(--gold-2)',
                        }}
                      >
                        {h.title}
                      </div>
                      <div className="serif text-[18px] font-semibold leading-tight mt-0.5">
                        {h.name ?? h.nickname}
                      </div>
                      <div className="mono text-[10.5px] text-ink-3 mt-1">{h.stat}</div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
            {hallOfFame.length === 0 && (
              <Card padding={14}>
                <div className="text-sm text-ink-3 text-center py-3">Зал славы пока пуст</div>
              </Card>
            )}
          </div>
        </>
      )}
    </ScrollScreen>
  );
}

function Podium({ top3, seasonLabel }: { top3: PlayerSeasonRatingEntry[]; seasonLabel: string }) {
  const [p1, p2, p3] = [top3[0], top3[1], top3[2]];
  if (!p1) return null;
  return (
    <Card
      padding={0}
      className="overflow-hidden"
      style={{ background: 'var(--ink)', color: 'var(--paper)' }}
    >
      <div className="grain" style={{ opacity: 0.18, mixBlendMode: 'screen' }} />
      <div className="p-4 pb-1.5 relative">
        <div className="flex justify-between items-center mb-2.5">
          <div className="serif text-[20px] font-semibold">Топ-3 сезона</div>
          <div
            className="uppercase font-bold"
            style={{
              fontSize: 10,
              letterSpacing: 0.6,
              color: 'var(--gold)',
            }}
          >
            {seasonLabel}
          </div>
        </div>
        <div className="flex items-end justify-around gap-2 mt-5">
          {p2 && <Pillar p={p2} place={2} height={78} gold="#9C8B6A" avatar={44} />}
          <Pillar p={p1} place={1} height={118} gold="#B58A3C" avatar={56} />
          {p3 && <Pillar p={p3} place={3} height={62} gold="#8B6F49" avatar={44} />}
        </div>
      </div>
    </Card>
  );
}

function Pillar({
  p,
  place,
  height,
  gold,
  avatar,
}: {
  p: PlayerSeasonRatingEntry;
  place: number;
  height: number;
  gold: string;
  avatar: number;
}) {
  return (
    <div className="flex-1 flex flex-col items-center">
      <Avatar name={p.name ?? p.nickname} size={avatar} ring />
      <div
        className="font-bold text-center truncate"
        style={{
          fontSize: place === 1 ? 12.5 : 11.5,
          color: 'var(--paper)',
          marginTop: 6,
          maxWidth: 86,
        }}
      >
        {p.name ?? p.nickname}
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--gold)', marginTop: 1 }}>
        {formatPoints(p.points)}
      </div>
      <div
        className="w-full mt-2 flex items-start justify-center pt-2"
        style={{
          height,
          background: `linear-gradient(180deg, ${gold} 0%, ${gold}aa 100%)`,
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          color: 'var(--ink)',
          boxShadow: place === 1 ? '0 0 24px rgba(181,138,60,0.35)' : 'none',
        }}
      >
        <span
          className="serif font-bold leading-none"
          style={{ fontSize: place === 1 ? 32 : 26 }}
        >
          {place}
        </span>
      </div>
    </div>
  );
}
