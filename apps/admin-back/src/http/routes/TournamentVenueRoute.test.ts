import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { tournamentRoutes } from "./TournamentRoute";
import { TournamentService, type TournamentApiSummary } from "../services/TournamentService";
import { tournamentAuditLogRepository, tournamentRepository } from "../../postgres";
import type { TournamentRow } from "../../postgres/TournamentRepository";

const row: TournamentRow = {
  id: 42, name: "Открытый турнир", date: 1790960400, status: "registration_open",
  venueId: "everest-mansion", entryPrice: 1000, reentryPrice: 1000,
  ratingGuaranteeEnabled: false, ratingGuaranteeBonusPoints: 10,
  ratingPointsCoefficient: 1, ratingBountyCoefficient: 1, ratingBountyRebuyOnly: false,
  ratingTableId: 1, ratingEnabled: true, ratingSeasonYear: 2026, ratingSeasonMonth: 10,
  lateRegistrationClosed: false, monthFinal: false,
};
const restores: Array<() => void> = [];
afterEach(() => { for (const restore of restores.splice(0)) restore(); });

function request(body: unknown, id = "42") {
  return Object.assign(new Request(`http://localhost/api/tournaments/${id}/venue`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: { id } });
}

describe("tournament venue API", () => {
  test("catalogue contains both venues", async () => {
    const response = await tournamentRoutes()["/api/tournament-venues"].GET();
    expect(((await response.json()) as { venues: { id: string }[] }).venues.map((v: { id: string }) => v.id)).toEqual(["mansarda", "everest-mansion"]);
  });

  test("venue change uses the isolated repository operation and preserves open status", async () => {
    const update = spyOn(tournamentRepository, "updateVenue").mockResolvedValue(row);
    const genericUpdate = spyOn(TournamentService.prototype, "updateTournament");
    const audit = spyOn(tournamentAuditLogRepository, "append").mockResolvedValue(true);
    restores.push(() => update.mockRestore(), () => genericUpdate.mockRestore(), () => audit.mockRestore());
    const handler = tournamentRoutes()["/api/tournaments/:id/venue"].PATCH;
    const response = await handler(request({ venueId: "everest-mansion", status: "completed", monthFinal: true }) as Parameters<typeof handler>[0]);
    expect(response.status).toBe(200);
    const result = await response.json() as TournamentApiSummary;
    expect(result.venueId).toBe("everest-mansion");
    expect(result.status).toBe("registration_open");
    expect(result.monthFinal).toBe(false);
    expect(result.id).toBe(42);
    expect(update).toHaveBeenCalledWith(42, "everest-mansion");
    expect(genericUpdate).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid or missing venues and IDs before any write", async () => {
    const update = spyOn(tournamentRepository, "updateVenue");
    restores.push(() => update.mockRestore());
    const handler = tournamentRoutes()["/api/tournaments/:id/venue"].PATCH;
    for (const body of [{}, { venueId: null }, { venueId: "unknown" }, { venueId: 1 }]) {
      expect((await handler(request(body) as Parameters<typeof handler>[0])).status).toBe(400);
    }
    for (const id of ["0", "-1", "42oops", "1.5"]) {
      expect((await handler(request({ venueId: "mansarda" }, id) as Parameters<typeof handler>[0])).status).toBe(400);
    }
    expect(update).not.toHaveBeenCalled();
  });

  test("reports a missing tournament without an audit write", async () => {
    const update = spyOn(tournamentRepository, "updateVenue").mockResolvedValue(null);
    restores.push(() => update.mockRestore());
    const handler = tournamentRoutes()["/api/tournaments/:id/venue"].PATCH;
    expect((await handler(request({ venueId: "mansarda" }) as Parameters<typeof handler>[0])).status).toBe(404);
  });

  test("creation accepts an old client without venueId and the new Everest choice", async () => {
    const create = spyOn(TournamentService.prototype, "createTournament").mockResolvedValue({ ok: true, tournament: row });
    const audit = spyOn(tournamentAuditLogRepository, "append").mockResolvedValue(true);
    restores.push(() => create.mockRestore(), () => audit.mockRestore());
    const handler = tournamentRoutes()["/api/tournaments"].POST;
    for (const venueId of [undefined, "everest-mansion"] as const) {
      const body = { name: "Турнир", date: 1790960400, venueId,
        structure: { name: "Структура", playersLimit: 50, stackSize: 10000, freezeOutEnabled: false, blinds: [] } };
      const req = new Request("http://localhost/api/tournaments", { method: "POST", body: JSON.stringify(body) });
      expect((await handler(req as Parameters<typeof handler>[0])).status).toBe(201);
      expect(create.mock.calls.at(-1)?.[0].venueId).toBe(venueId);
    }
    const invalid = new Request("http://localhost/api/tournaments", { method: "POST", body: JSON.stringify({ name: "Турнир", date: 1, venueId: "bad" }) });
    expect((await handler(invalid as Parameters<typeof handler>[0])).status).toBe(400);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
