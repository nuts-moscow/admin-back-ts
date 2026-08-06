import { describe, expect, test } from "bun:test";
import { AvatarModerationService } from "./AvatarModerationService";

const IMAGE = Buffer.from("the same twelve bytes");
const OTHER = Buffer.from("a different picture");

describe("AvatarModerationService.addressFor", () => {
  test("two players sending identical bytes get different addresses", () => {
    expect(AvatarModerationService.addressFor(1, IMAGE)).not.toBe(
      AvatarModerationService.addressFor(2, IMAGE)
    );
  });

  test("a new picture is a new address, so caches turn over on their own", () => {
    expect(AvatarModerationService.addressFor(1, IMAGE)).not.toBe(
      AvatarModerationService.addressFor(1, OTHER)
    );
  });

  test("the same picture from the same player is the same address", () => {
    expect(AvatarModerationService.addressFor(7, IMAGE)).toBe(
      AvatarModerationService.addressFor(7, IMAGE)
    );
  });

  test("the address is not derivable from the player id alone", () => {
    const address = AvatarModerationService.addressFor(42, IMAGE);
    expect(address).not.toContain("42");
    expect(address.length).toBeGreaterThan(20);
    // base64url: nothing that needs escaping in a path segment.
    expect(address).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("AvatarModerationService.fingerprintFor", () => {
  test("the fingerprint is of the picture, not of the player — a refusal is about the image", () => {
    expect(AvatarModerationService.fingerprintFor(IMAGE)).toBe(
      AvatarModerationService.fingerprintFor(Buffer.from("the same twelve bytes"))
    );
    expect(AvatarModerationService.fingerprintFor(IMAGE)).not.toBe(
      AvatarModerationService.fingerprintFor(OTHER)
    );
  });

  test("it is a hash, not the picture: fixed width, no bytes carried", () => {
    const big = AvatarModerationService.fingerprintFor(Buffer.alloc(500_000, 7));
    expect(big).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("AvatarModerationService.newSubmissionId", () => {
  test("every submission gets its own identity, so a verdict can name one", () => {
    const ids = new Set(Array.from({ length: 50 }, () => AvatarModerationService.newSubmissionId()));
    expect(ids.size).toBe(50);
  });
});

describe("the gate's shape", () => {
  const SOURCE = Bun.file(new URL("./AvatarModerationService.ts", import.meta.url).pathname);
  const INTAKE = Bun.file(new URL("./AvatarIntakeService.ts", import.meta.url).pathname);
  const MEDIA = Bun.file(new URL("./AvatarMediaService.ts", import.meta.url).pathname);

  test("the intake cannot reach the published store's write", async () => {
    // The structural half of avatar-awaits-approval: not "does not call it",
    // but has no way to. The intake imports the queue and the store's erase for
    // self-removal; the publishing write is named only in the gate.
    const intake = await INTAKE.text();
    expect(intake).not.toMatch(/publishWithClient/);
    expect((await SOURCE.text()).match(/publishWithClient/g)?.length).toBe(1);
  });

  test("only the gate publishes", async () => {
    const media = await MEDIA.text();
    expect(media).not.toMatch(/publishWithClient/);
    expect(media).not.toMatch(/Submission/);
  });

  test("every verdict is guarded by the submission's identity", async () => {
    const source = await SOURCE.text();
    // Both branches check the id, and both bail to `stale` rather than acting.
    expect(source).toMatch(/current\.submissionId !== submissionId/);
    expect(source.match(/reason: "stale"/g)?.length).toBeGreaterThanOrEqual(4);
  });

  test("publish and queue-clear happen in one transaction", async () => {
    const source = await SOURCE.text();
    expect(source).toMatch(/withTransaction/);
    const body = source.slice(source.indexOf("withTransaction"), source.indexOf("if (outcome.ok)"));
    expect(body).toMatch(/clearWithClient/);
    expect(body).toMatch(/publishWithClient/);
  });
});
