export function formatNumberRu(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('ru-RU');
}

export function formatSeconds(s: number | null | undefined): string {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const ss = Math.max(0, s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function formatRub(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${n.toLocaleString('ru-RU')} ₽`;
}

const RU_MONTHS_SHORT = [
  'Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек',
];

const RU_DAY_OF_WEEK = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

export function formatTournamentDate(epochMs: number): {
  day: string;
  date: string;
  time: string;
} {
  const d = new Date(epochMs);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mins = String(d.getMinutes()).padStart(2, '0');
  return {
    day: RU_DAY_OF_WEEK[d.getDay()] ?? '',
    date: `${dd}.${mm}`,
    time: `${hh}:${mins}`,
  };
}

export function formatJoinedAt(iso: string): string {
  const d = new Date(iso);
  const m = RU_MONTHS_SHORT[d.getMonth()] ?? '';
  return `${m} ${d.getFullYear()}`;
}

/**
 * Current season label derived from today's date (UTC), matching the backend
 * `seasonLabel` format (e.g. "Июл '26"). Used as a fallback when the profile
 * payload doesn't carry `season`.
 */
export function currentSeasonLabel(): string {
  const d = new Date();
  const m = RU_MONTHS_SHORT[d.getUTCMonth()] ?? '?';
  return `${m} '${String(d.getUTCFullYear()).slice(-2)}`;
}
