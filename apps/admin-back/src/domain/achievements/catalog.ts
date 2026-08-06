import type { AchievementRule } from "./types";

/**
 * Every achievement the club recognises, and the only place any of them is
 * described. The player app holds no list of its own.
 *
 * Nine of the thirty-five the club listed are deliberately absent: the five
 * format achievements need a tournament format the schema does not have, the
 * three referral ones need to know who brought whom, and the royal flush needs
 * hand-level data an offline room never produces. A rule that can never close
 * teaches players not to trust the ones that can.
 */
export const ACHIEVEMENT_CATALOG: readonly AchievementRule[] = [
  // — Первые шаги —
  {
    id: "first-tournament",
    name: "Новый игрок",
    description: "Сыграл первый турнир в клубе",
    group: "Первые шаги",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "played",
    threshold: 1,
  },
  {
    id: "played-5",
    name: "Дебютант",
    description: "Сыграл 5 турниров",
    group: "Первые шаги",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "played",
    threshold: 5,
  },
  {
    id: "played-20",
    name: "Свой человек",
    description: "Сыграл 20 турниров",
    group: "Первые шаги",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "played",
    threshold: 20,
  },

  // — Активность. Подряд по всем рейтинговым турнирам клуба: пропуск любого
  //   рвёт серию, включая тот, куда игрока не звали.
  {
    id: "streak-3",
    name: "Постоянник",
    description: "Посетил 3 турнира подряд",
    group: "Активность",
    kind: "streak",
    unit: "tournament",
    scope: "lifetime",
    predicate: "played",
    threshold: 3,
  },
  {
    id: "streak-7",
    name: "Верный NUTS",
    description: "Посетил 7 турниров подряд",
    group: "Активность",
    kind: "streak",
    unit: "tournament",
    scope: "lifetime",
    predicate: "played",
    threshold: 7,
  },
  {
    id: "streak-15",
    name: "Легенда клуба",
    description: "Посетил 15 турниров подряд",
    group: "Активность",
    kind: "streak",
    unit: "tournament",
    scope: "lifetime",
    predicate: "played",
    threshold: 15,
  },

  // — Результаты —
  {
    id: "first-blood",
    name: "Первая кровь",
    description: "Попал в рейтинговую зону впервые",
    group: "Результаты",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "rating_zone",
    threshold: 1,
  },
  {
    id: "podium",
    name: "Подиум",
    description: "Занял место в топ-3",
    group: "Результаты",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "podium",
    threshold: 1,
  },
  {
    id: "champion",
    name: "Чемпион",
    description: "Выиграл турнир",
    group: "Результаты",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "win",
    threshold: 1,
  },
  {
    id: "double-season",
    name: "Дубль",
    description: "Выиграл 2 турнира за сезон",
    group: "Результаты",
    kind: "occurrence",
    unit: "tournament",
    scope: "season",
    predicate: "win",
    threshold: 2,
  },
  {
    id: "hat-trick-season",
    name: "Хет-трик",
    description: "Выиграл 3 турнира за сезон",
    group: "Результаты",
    kind: "occurrence",
    unit: "tournament",
    scope: "season",
    predicate: "win",
    threshold: 3,
  },

  // — Баунти, накопительно. Дробные доли складываются и округляются вниз
  //   ровно один раз, при сравнении с порогом.
  {
    id: "knockouts-10",
    name: "Охотник",
    description: "Сделал 10 баунти",
    group: "Баунти",
    kind: "total",
    unit: "tournament",
    scope: "lifetime",
    metric: "knockouts",
    threshold: 10,
  },
  {
    id: "knockouts-30",
    name: "Наёмник",
    description: "Сделал 30 баунти",
    group: "Баунти",
    kind: "total",
    unit: "tournament",
    scope: "lifetime",
    metric: "knockouts",
    threshold: 30,
  },
  {
    id: "knockouts-100",
    name: "Терминатор",
    description: "Сделал 100 баунти",
    group: "Баунти",
    kind: "total",
    unit: "tournament",
    scope: "lifetime",
    metric: "knockouts",
    threshold: 100,
  },

  // — Баунти за один турнир —
  {
    id: "knockouts-7-in-one",
    name: "Меткий",
    description: "7 баунти за турнир",
    group: "Баунти",
    kind: "unit_max",
    unit: "tournament",
    scope: "lifetime",
    metric: "knockouts",
    threshold: 7,
  },
  {
    id: "knockouts-12-in-one",
    name: "Снайпер",
    description: "12 баунти за турнир",
    group: "Баунти",
    kind: "unit_max",
    unit: "tournament",
    scope: "lifetime",
    metric: "knockouts",
    threshold: 12,
  },
  {
    id: "knockouts-20-in-one",
    name: "Машина смерти",
    description: "20 баунти за турнир",
    group: "Баунти",
    kind: "unit_max",
    unit: "tournament",
    scope: "lifetime",
    metric: "knockouts",
    threshold: 20,
  },

  // — Сезонная активность. Прогресс обнуляется со сменой сезона; уже
  //   выданная награда остаётся.
  {
    id: "season-played-5",
    name: "Старт сезона",
    description: "Посетил 5 игр за сезон",
    group: "Сезон",
    kind: "occurrence",
    unit: "tournament",
    scope: "season",
    predicate: "played",
    threshold: 5,
  },
  {
    id: "season-played-10",
    name: "На волне",
    description: "Посетил 10 игр за сезон",
    group: "Сезон",
    kind: "occurrence",
    unit: "tournament",
    scope: "season",
    predicate: "played",
    threshold: 10,
  },
  {
    id: "season-played-15",
    name: "Игрок сезона",
    description: "Посетил 15 игр за сезон",
    group: "Сезон",
    kind: "occurrence",
    unit: "tournament",
    scope: "season",
    predicate: "played",
    threshold: 15,
  },

  // — MVP и производные. Считаются по сезонам, а не по турнирам: это и
  //   делает «Неудержимого» обычной серией, а не особым случаем. Закрывает
  //   их SeasonSettlement — единственное правило, сравнивающее игроков.
  {
    id: "season-mvp",
    name: "MVP сезона",
    description: "Наибольшее количество очков по итогам сезона",
    group: "Сезон",
    kind: "occurrence",
    unit: "season",
    scope: "lifetime",
    predicate: "season_leader",
    threshold: 1,
  },
  {
    id: "mvp-streak-2",
    name: "Неудержимый",
    description: "2 раза подряд наибольшее количество очков по итогам сезона",
    group: "Сезон",
    kind: "streak",
    unit: "season",
    scope: "lifetime",
    predicate: "season_leader",
    threshold: 2,
  },
  {
    id: "mvp-streak-3",
    name: "Легендарный регуляр",
    description: "3 раза подряд наибольшее количество очков по итогам сезона",
    group: "Сезон",
    kind: "streak",
    unit: "season",
    scope: "lifetime",
    predicate: "season_leader",
    threshold: 3,
  },

  // — Финальные столы. Финальный стол — топ-10 поля; определение живёт в
  //   RatingFactStore, здесь только имя метрики.
  {
    id: "final-tables-5",
    name: "Финалист",
    description: "Попал на финальный стол 5 раз",
    group: "Финальные столы",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "final_table",
    threshold: 5,
  },
  {
    id: "final-tables-20",
    name: "Вечный финалист",
    description: "Попал на финальный стол 20 раз",
    group: "Финальные столы",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "final_table",
    threshold: 20,
  },
  {
    id: "final-tables-50",
    name: "Мастер финалки",
    description: "Попал на финальный стол 50 раз",
    group: "Финальные столы",
    kind: "occurrence",
    unit: "tournament",
    scope: "lifetime",
    predicate: "final_table",
    threshold: 50,
  },
];

/** The rules a player who holds none of them is offered. */
export function activeRules(): readonly AchievementRule[] {
  return ACHIEVEMENT_CATALOG.filter((r) => r.retired !== true);
}

export function ruleById(id: string): AchievementRule | undefined {
  return ACHIEVEMENT_CATALOG.find((r) => r.id === id);
}
