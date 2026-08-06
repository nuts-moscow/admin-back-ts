import { describe, expect, test } from "bun:test";
import { AVATAR_MAX_AGE_SECONDS } from "./AvatarMediaService";

const MEDIA_SERVICE = await Bun.file(
  new URL("./AvatarMediaService.ts", import.meta.url).pathname
).text();
const MEDIA_ROUTE = await Bun.file(
  new URL("../routes/PlayerAvatarMediaRoute.ts", import.meta.url).pathname
).text();
const PLAYER_ROUTE = await Bun.file(
  new URL("../routes/PlayerAvatarRoute.ts", import.meta.url).pathname
).text();
const MODERATION_ROUTE = await Bun.file(
  new URL("../routes/AvatarModerationRoute.ts", import.meta.url).pathname
).text();


/** Source with comments stripped: these assertions are about code, not prose. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("the published read side", () => {
  test("it reads the store and knows nothing about submissions", () => {
    // This is what makes "the approved avatar keeps showing while a
    // replacement waits" structural rather than careful: there is no path from
    // here to a waiting picture.
    expect(code(MEDIA_SERVICE)).not.toMatch(/[Ss]ubmission/);
    expect(code(MEDIA_ROUTE)).not.toMatch(/[Ss]ubmission|pending/i);
  });

  test("the cache is bounded to an hour, so a takedown reaches loaded screens", () => {
    expect(AVATAR_MAX_AGE_SECONDS).toBe(3600);
    expect(MEDIA_ROUTE).toMatch(/max-age=\$\{AVATAR_MAX_AGE_SECONDS\}/);
    expect(MEDIA_ROUTE).not.toMatch(/immutable/);
  });

  test("the address is the capability: no bearer, served from /public/", () => {
    expect(MEDIA_ROUTE).toMatch(/"\/public\/avatars\/:address"/);
    expect(MEDIA_ROUTE).not.toMatch(/authCtx|playerAuthCtx/);
  });
});

describe("the waiting read side", () => {
  test("every route serving a pending picture authenticates the caller", () => {
    for (const route of [PLAYER_ROUTE, MODERATION_ROUTE]) {
      const pending = route.slice(route.indexOf("pending"));
      expect(pending).toMatch(/ctxOf\(req\)|adminOf\(req\)/);
      expect(pending).toMatch(/private, no-store/);
    }
  });

  test("no pending picture is served from a public path", () => {
    expect(PLAYER_ROUTE).not.toMatch(/"\/public\//);
    expect(MODERATION_ROUTE).not.toMatch(/"\/public\//);
  });
});
