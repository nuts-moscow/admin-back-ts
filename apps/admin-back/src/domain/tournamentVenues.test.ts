import { describe, expect, test } from "bun:test";
import { getTournamentVenue, CustomTournamentVenue, TournamentVenueSelection, PlayerTournamentSummary, TOURNAMENT_VENUES, TournamentVenueId } from "@admin/schemas";

describe("tournament venues", () => {
  test("old player API payloads retain the original location", () => {
    expect(PlayerTournamentSummary.pick({ venueId: true }).safeParse({}).success).toBe(true);
    expect(getTournamentVenue(undefined).id).toBe("mansarda");
    expect(getTournamentVenue(null).mapsUrl).toContain("83750617761");
  });

  test("Everest points to the supplied address and map, not the default venue", () => {
    const venue = getTournamentVenue("everest-mansion");
    expect(venue.name).toBe("Everest Mansion");
    expect(venue.address).toBe("Житная ул., 4");
    expect(venue.mapsUrl).toBe("https://yandex.ru/maps/org/everest_mansion/176812133557/?ll=37.622343%2C55.730223&z=16");
    expect(TOURNAMENT_VENUES).toHaveLength(2);
  });

  test("invalid writes cannot silently choose the default venue", () => {
    for (const value of [null, "", "unknown", 1, {}, "https://example.com"]) {
      expect(TournamentVenueId.safeParse(value).success).toBe(false);
    }
  });
});


describe("custom tournament venues", () => {
  const custom = { name: "Гостевая площадка", address: "Москва, Тестовая ул., 1", mapsUrl: "https://example.com/maps?place=1" };

  test("keeps custom details on the tournament, outside the shared catalogue", () => {
    const parsed = TournamentVenueSelection.parse({ venueId: "custom", customVenue: { ...custom, name: ` ${custom.name} ` } });
    expect(getTournamentVenue(parsed.venueId, parsed.customVenue)).toEqual({ id: "custom", ...custom });
    expect(TOURNAMENT_VENUES.map(v => v.id)).toEqual(["mansarda", "everest-mansion"]);
    expect(PlayerTournamentSummary.pick({ venueId: true, customVenue: true }).parse(parsed)).toEqual(parsed);
  });

  test("all three fields are required and bounded", () => {
    for (const key of ["name", "address", "mapsUrl"] as const) {
      expect(CustomTournamentVenue.safeParse({ ...custom, [key]: "   " }).success).toBe(false);
      const incomplete: Record<string, unknown> = { ...custom }; delete incomplete[key];
      expect(CustomTournamentVenue.safeParse(incomplete).success).toBe(false);
    }
    expect(CustomTournamentVenue.safeParse({ ...custom, name: "a".repeat(151) }).success).toBe(false);
    expect(CustomTournamentVenue.safeParse({ ...custom, address: "a".repeat(301) }).success).toBe(false);
    expect(CustomTournamentVenue.safeParse({ ...custom, mapsUrl: "https://example.com/" + "a".repeat(2048) }).success).toBe(false);
    expect(TournamentVenueSelection.safeParse({ venueId: "custom" }).success).toBe(false);
    expect(TournamentVenueSelection.safeParse({ venueId: "custom", customVenue: null }).success).toBe(false);
  });

  test("only full http(s) links can reach player links and window.open", () => {
    for (const mapsUrl of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/map", "//example.com", "example.com", "https://", "ftp://example.com"]) {
      expect(CustomTournamentVenue.safeParse({ ...custom, mapsUrl }).success).toBe(false);
    }
    expect(CustomTournamentVenue.safeParse({ ...custom, mapsUrl: "http://example.com/map" }).success).toBe(true);
  });
});
