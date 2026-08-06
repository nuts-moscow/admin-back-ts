/**
 * How a rule counts. Four shapes, and every rule in the catalogue resolves
 * through one of them — a rule that needs a fifth shape is a change to this
 * union, never a branch beside the catalogue.
 */
export type CountingKind =
  /** How many units satisfied the predicate. «Финалист» — five final tables. */
  | "occurrence"
  /** The sum of a numeric metric across units. «Охотник» — ten knockouts. */
  | "total"
  /** The best a single unit produced. «Меткий» — seven knockouts in one tournament. */
  | "unit_max"
  /** The current run of consecutive units satisfying the predicate. «Постоянник». */
  | "streak";

/**
 * What a rule counts over. Most rules count tournaments; the MVP family counts
 * seasons, which is what lets «Неудержимый» be an ordinary streak instead of a
 * special case.
 */
export type CountingUnit = "tournament" | "season";

/**
 * The window the count runs in. A seasonal rule restarts from zero every
 * season; a lifetime rule never does.
 */
export type CountingScope = "lifetime" | "season";

/**
 * The per-unit facts a rule may read. Predicates answer yes or no for one
 * unit; metrics answer a number.
 */
export type UnitPredicate =
  /** The player took part at all. */
  | "played"
  /** The player finished in the rating zone — earned placement points. */
  | "rating_zone"
  /** Finished in the top three. */
  | "podium"
  /** Finished first. */
  | "win"
  /** Finished at the final table. */
  | "final_table"
  /** The player led this season on points. Only meaningful per season. */
  | "season_leader";

export type UnitMetric =
  /** Knockouts, floored to whole ones before any comparison. */
  "knockouts";

export interface AchievementRule {
  /** Stable identity. Never reused, never removed — awards point at it. */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Grouping for the profile, in the club's own words. */
  readonly group: string;
  readonly kind: CountingKind;
  readonly unit: CountingUnit;
  readonly scope: CountingScope;
  /** Present for occurrence and streak rules. */
  readonly predicate?: UnitPredicate;
  /** Present for total and unit_max rules. */
  readonly metric?: UnitMetric;
  /** How much of it closes the rule. */
  readonly threshold: number;
  /**
   * A withdrawn rule stays in the catalogue: awards point at it, and awards
   * are permanent. Retired rules render for whoever holds them and are
   * offered to nobody else.
   */
  readonly retired?: true;
}

/** Where a player stands against one rule. */
export interface AchievementProgress {
  readonly ruleId: string;
  /** Floored, and the same number the profile shows. */
  readonly reached: number;
  readonly threshold: number;
  readonly closed: boolean;
}
