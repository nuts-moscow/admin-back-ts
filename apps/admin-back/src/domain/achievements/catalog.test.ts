import { describe, expect, test } from "bun:test";
import { ACHIEVEMENT_CATALOG, activeRules, ruleById } from "./catalog";
import type { CountingKind, CountingScope, CountingUnit } from "./types";

const KINDS: CountingKind[] = ["occurrence", "total", "unit_max", "streak"];
const UNITS: CountingUnit[] = ["tournament", "season"];
const SCOPES: CountingScope[] = ["lifetime", "season"];

/** Everything a rule may read about one tournament or one season. */
const KNOWN_PREDICATES = [
  "played",
  "rating_zone",
  "podium",
  "win",
  "final_table",
  "season_leader",
];
const KNOWN_METRICS = ["knockouts"];

describe("the catalogue is the single source", () => {
  test("it holds exactly the twenty-six recognised rules", () => {
    expect(ACHIEVEMENT_CATALOG).toHaveLength(26);
  });

  test("every rule carries a kind, a unit, a scope and a threshold", () => {
    for (const rule of ACHIEVEMENT_CATALOG) {
      expect(KINDS).toContain(rule.kind);
      expect(UNITS).toContain(rule.unit);
      expect(SCOPES).toContain(rule.scope);
      expect(rule.threshold).toBeGreaterThan(0);
      expect(rule.name.length).toBeGreaterThan(0);
      expect(rule.description.length).toBeGreaterThan(0);
    }
  });

  test("identities are unique", () => {
    const ids = ACHIEVEMENT_CATALOG.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("a rule says how it counts", () => {
  test("occurrence and streak rules name a predicate; total and max name a metric", () => {
    for (const rule of ACHIEVEMENT_CATALOG) {
      if (rule.kind === "occurrence" || rule.kind === "streak") {
        expect(rule.predicate).toBeDefined();
        expect(rule.metric).toBeUndefined();
      } else {
        expect(rule.metric).toBeDefined();
        expect(rule.predicate).toBeUndefined();
      }
    }
  });

  test("no rule reads a predicate or metric the scorer does not know", () => {
    for (const rule of ACHIEVEMENT_CATALOG) {
      if (rule.predicate) expect(KNOWN_PREDICATES).toContain(rule.predicate);
      if (rule.metric) expect(KNOWN_METRICS).toContain(rule.metric);
    }
  });

  test("only season-unit rules read the cross-player predicate", () => {
    // `season_leader` is decided by comparing players, which the scorer does
    // not do — settlement does. Letting a tournament-unit rule read it would
    // put that comparison back in the scorer by the back door.
    for (const rule of ACHIEVEMENT_CATALOG) {
      if (rule.predicate === "season_leader") expect(rule.unit).toBe("season");
    }
  });
});

describe("achievements without data are absent", () => {
  const absent = [
    "Double Nuts",
    "Mystery Man",
    "Специальный агент",
    "Звёздный путь",
    "Классик",
    "Командный игрок",
    "Посол NUTS",
    "амбасадор",
    "Роял-флеш",
  ];

  test("no rule describes something the system does not record", () => {
    const names = ACHIEVEMENT_CATALOG.map((r) => r.name.toLowerCase());
    for (const name of absent) {
      expect(names).not.toContain(name.toLowerCase());
    }
  });
});

describe("the catalogue only grows", () => {
  test("a retired rule stays in the catalogue and leaves the active list", () => {
    const retired = ACHIEVEMENT_CATALOG.filter((r) => r.retired === true);
    for (const rule of retired) {
      expect(ruleById(rule.id)).toBeDefined();
      expect(activeRules().map((r) => r.id)).not.toContain(rule.id);
    }
  });

  test("every active rule resolves by identity", () => {
    for (const rule of activeRules()) {
      expect(ruleById(rule.id)?.name).toBe(rule.name);
    }
  });
});
