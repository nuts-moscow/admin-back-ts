import { describe, expect, test } from "bun:test";
import { SeasonFinalService } from "./SeasonFinalService";

function repoReturning(value: { id: number; date: number } | null) {
  return { findFutureMonthFinal: async (_nowMs: number) => value };
}

describe("SeasonFinalService", () => {
  test("maps the nearest future flagged tournament to its date", async () => {
    const svc = new SeasonFinalService(repoReturning({ id: 3, date: 1_700_000_000_000 }));
    expect(await svc.getAnnouncement(0)).toEqual({ date: 1_700_000_000_000 });
  });

  test("returns an unannounced (null date) announcement when none is flagged", async () => {
    const svc = new SeasonFinalService(repoReturning(null));
    expect(await svc.getAnnouncement(0)).toEqual({ date: null });
  });

  test("passes nowMs through to the repository (future-only is the repo's job)", async () => {
    let seen = -1;
    const svc = new SeasonFinalService({
      findFutureMonthFinal: async (nowMs: number) => {
        seen = nowMs;
        return null;
      },
    });
    await svc.getAnnouncement(999);
    expect(seen).toBe(999);
  });
});
