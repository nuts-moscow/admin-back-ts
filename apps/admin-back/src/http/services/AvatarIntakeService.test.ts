import { describe, expect, test } from "bun:test";
import { AvatarIntakeService, type IntakeDeps } from "./AvatarIntakeService";
import { MAX_UPLOAD_BYTES } from "./ImageNormalizer";

const NORMALIZED = Buffer.from("normalized webp bytes");
const SUBMITTED_AT = new Date("2026-08-05T10:00:00Z");

interface Trace {
  rateChecked: number;
  normalized: number;
  refusalChecked: number;
  held: number;
  heldPlayerIds: number[];
}

function deps(over: Partial<IntakeDeps> = {}): { deps: IntakeDeps; trace: Trace } {
  const trace: Trace = {
    rateChecked: 0,
    normalized: 0,
    refusalChecked: 0,
    held: 0,
    heldPlayerIds: [],
  };
  const base: IntakeDeps = {
    async withinRateLimit() {
      trace.rateChecked++;
      return true;
    },
    async normalize() {
      trace.normalized++;
      return { ok: true, image: NORMALIZED, contentType: "image/webp" };
    },
    async wasRefused() {
      trace.refusalChecked++;
      return false;
    },
    async hold(input) {
      trace.held++;
      trace.heldPlayerIds.push(input.playerId);
      return { submissionId: input.submissionId, submittedAt: SUBMITTED_AT };
    },
  };
  return { deps: { ...base, ...over }, trace };
}

const PICTURE = new Uint8Array([1, 2, 3, 4]);

describe("AvatarIntakeService.upload", () => {
  test("an accepted upload leaves a waiting submission and publishes nothing", async () => {
    const { deps: d, trace } = deps();
    const outcome = await new AvatarIntakeService(d).upload(11, PICTURE);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.submission.state).toBe("pending");
    expect(trace.held).toBe(1);
    expect(trace.heldPlayerIds).toEqual([11]);
  });

  test("the submission is held for the caller, whoever the body names", async () => {
    const { deps: d, trace } = deps();
    // The route never passes a body-supplied id at all; this pins the service's
    // half of that promise — it writes under exactly the id it was given.
    await new AvatarIntakeService(d).upload(11, PICTURE);
    expect(trace.heldPlayerIds).toEqual([11]);
  });

  test("over the rate limit: refused before anything is decoded or enqueued", async () => {
    const { deps: d, trace } = deps({ withinRateLimit: async () => false });
    const outcome = await new AvatarIntakeService(d).upload(11, PICTURE);

    expect(outcome).toMatchObject({ ok: false, status: 429 });
    expect(trace.normalized).toBe(0);
    expect(trace.held).toBe(0);
  });

  test("over the size ceiling: refused before even the rate counter is touched", async () => {
    const { deps: d, trace } = deps();
    const outcome = await new AvatarIntakeService(d).upload(
      11,
      new Uint8Array(MAX_UPLOAD_BYTES + 1)
    );

    expect(outcome).toMatchObject({ ok: false, status: 413 });
    expect(trace.rateChecked).toBe(0);
    expect(trace.normalized).toBe(0);
    expect(trace.held).toBe(0);
  });

  test("a file the sandbox refuses never reaches the queue", async () => {
    const { deps: d, trace } = deps({ normalize: async () => ({ ok: false }) });
    const outcome = await new AvatarIntakeService(d).upload(11, PICTURE);

    expect(outcome).toMatchObject({ ok: false, status: 400 });
    expect(trace.held).toBe(0);
  });

  test("a picture already refused for this player never reaches an admin again", async () => {
    const { deps: d, trace } = deps({ wasRefused: async () => true });
    const outcome = await new AvatarIntakeService(d).upload(11, PICTURE);

    expect(outcome).toMatchObject({ ok: false, status: 409 });
    expect(trace.held).toBe(0);
  });

  test("the refusal is checked against the normalized bytes, not the file as sent", async () => {
    // Otherwise re-encoding the same photo would walk it straight back into the
    // queue, and the memory would be worth nothing.
    const seenFingerprints: string[] = [];
    const { deps: d } = deps({
      async wasRefused(_playerId, fingerprint) {
        seenFingerprints.push(fingerprint);
        return false;
      },
    });
    await new AvatarIntakeService(d).upload(11, PICTURE);

    const { createHash } = await import("node:crypto");
    expect(seenFingerprints).toEqual([createHash("sha256").update(NORMALIZED).digest("hex")]);
  });

  test("each upload gets its own submission identity", async () => {
    const ids: string[] = [];
    const { deps: d } = deps({
      async hold(input) {
        ids.push(input.submissionId);
        return { submissionId: input.submissionId, submittedAt: SUBMITTED_AT };
      },
    });
    const svc = new AvatarIntakeService(d);
    await svc.upload(11, PICTURE);
    await svc.upload(11, PICTURE);

    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });
});

describe("the upload path's shape", () => {
  test("nothing in it waits on a verdict or calls out over the network", async () => {
    const source = await Bun.file(
      new URL("./AvatarIntakeService.ts", import.meta.url).pathname
    ).text();
    expect(source).not.toMatch(/\bfetch\(/);
    // It borrows two pure helpers from the gate and never the gate itself:
    // there is no object here that could be asked for a decision.
    expect(source).not.toMatch(/\bavatarModerationService\b/);
    expect(source).not.toMatch(/\.decide\(/);
  });
});
