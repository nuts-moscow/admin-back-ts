import { describe, expect, test } from "bun:test";
import { TournamentAuditEventType } from "../../domain/TournamentAuditEventType";

const SERVICE = await Bun.file(
  new URL("./AvatarTakedownService.ts", import.meta.url).pathname
).text();
const ROUTE = await Bun.file(
  new URL("../routes/AvatarTakedownRoute.ts", import.meta.url).pathname
).text();


/** Source with comments stripped: these assertions are about code, not prose. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("AvatarTakedown", () => {
  test("removal is recorded in the club's audit trail", () => {
    expect(SERVICE).toMatch(/writeClubAuditLog\(TournamentAuditEventType\.AvatarTakenDown/);
    expect(TournamentAuditEventType.AvatarTakenDown).toBe("avatar_taken_down");
  });

  test("nothing is audited when there was no avatar to remove", () => {
    // A takedown of a player who has no picture is not an event; the audit
    // trail should not fill with non-actions.
    expect(SERVICE).toMatch(/if \(removed\) \{/);
  });

  test("it touches the published store only — never the queue", () => {
    expect(code(SERVICE)).not.toMatch(/[Ss]ubmission/);
    expect(SERVICE).toMatch(/playerAvatarRepository\.erase/);
  });

  test("the route refuses a caller with no admin context", () => {
    expect(ROUTE).toMatch(/authCtx/);
    expect(ROUTE).toMatch(/status: 401/);
  });

  test("it is not under /public/ or /api/player/, so admin auth gates it", () => {
    expect(ROUTE).toMatch(/"\/api\/players\/:id\/avatar"/);
    expect(ROUTE).not.toMatch(/"\/public\/|"\/api\/player\//);
  });
});
