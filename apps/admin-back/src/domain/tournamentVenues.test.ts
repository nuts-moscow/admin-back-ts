import { describe, expect, test } from "bun:test";
import { getTournamentVenue, PlayerTournamentSummary, TOURNAMENT_VENUES, TournamentVenueId } from "@admin/schemas";

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
