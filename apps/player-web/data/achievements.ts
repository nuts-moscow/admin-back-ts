/** Static achievement catalog — v1 has no backend progress tracking. */
export interface AchievementMeta {
  id: string;
  name: string;
  desc: string;
  /** v1: hard-coded — true if "earned" in the mock. */
  got: boolean;
  /** 0..1 progress for unearned. */
  prog: number;
}

export const ACHIEVEMENTS: AchievementMeta[] = [
  { id: 'first', name: 'Первая раздача', desc: 'Сыграть первый турнир', got: true, prog: 1 },
  { id: 'ft', name: 'Финалист', desc: 'Дойти до финального стола', got: true, prog: 1 },
  { id: 'win', name: 'Чемпион', desc: 'Выиграть турнир', got: true, prog: 1 },
  { id: 'streak', name: 'В ударе', desc: 'ITM 5 турниров подряд', got: true, prog: 1 },
  { id: 'major', name: 'Мажор', desc: 'Топ-3 в Sunday Major', got: true, prog: 1 },
  { id: 'rake', name: 'Завсегдатай', desc: '50 турниров за сезон', got: false, prog: 0.64 },
  { id: 'elo23', name: 'ELO 2 300', desc: 'Достичь рейтинга 2 300', got: false, prog: 0.92 },
  { id: 'crusher', name: 'Раздавил', desc: 'Победа с буст-ином +500%', got: false, prog: 0.4 },
  { id: 'hero', name: 'Геройский колл', desc: 'Hero call за столом', got: false, prog: 0 },
  { id: 'iron', name: 'Железный', desc: '12 часов за сессию', got: true, prog: 1 },
  { id: 'silver', name: 'Серебро сезона', desc: 'Топ-3 рейтинга', got: true, prog: 1 },
  { id: 'gold', name: 'Золото сезона', desc: '#1 рейтинга', got: false, prog: 0 },
];
