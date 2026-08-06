import { describe, expect, test } from "bun:test";
import sharp from "sharp";
import { imageNormalizer, MAX_UPLOAD_BYTES } from "./ImageNormalizer";

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 140, b: 60 } },
  })
    .png()
    .toBuffer();
}

describe("ImageNormalizer", () => {
  test("a wide photo comes back as a bounded square WebP", async () => {
    const result = await imageNormalizer.normalize(await png(900, 400));
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.contentType).toBe("image/webp");
    const meta = await sharp(result.image).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(256);
    expect(meta.height).toBe(256);
  });

  test("output is WebP whatever the input format was", async () => {
    const jpeg = await sharp({
      create: { width: 300, height: 300, channels: 3, background: { r: 10, g: 10, b: 10 } },
    })
      .jpeg()
      .toBuffer();

    const result = await imageNormalizer.normalize(jpeg);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((await sharp(result.image).metadata()).format).toBe("webp");
  });

  test("a file that is not an image is refused, not thrown", async () => {
    const result = await imageNormalizer.normalize(new TextEncoder().encode("#!/bin/sh\nrm -rf /"));
    expect(result.ok).toBe(false);
  });

  test("a truncated image is refused", async () => {
    const whole = await png(200, 200);
    const result = await imageNormalizer.normalize(whole.subarray(0, 40));
    expect(result.ok).toBe(false);
  });

  test("an empty body is refused without spawning anything", async () => {
    const result = await imageNormalizer.normalize(new Uint8Array(0));
    expect(result).toEqual({ ok: false, reason: "empty" });
  });

  test("a body over the upload ceiling is refused before the decoder is reached", async () => {
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    const result = await imageNormalizer.normalize(oversized);
    expect(result).toEqual({ ok: false, reason: "too large" });
  });

  test("a decompression bomb is refused on the declared pixel budget, not on file size", async () => {
    // ~66 megapixels of flat colour: tiny on disk, far over the decode budget.
    const bomb = await sharp({
      create: { width: 12_000, height: 5_500, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png({ compressionLevel: 9 })
      .toBuffer();

    expect(bomb.byteLength).toBeLessThan(MAX_UPLOAD_BYTES);
    const result = await imageNormalizer.normalize(bomb);
    expect(result.ok).toBe(false);
  });

  test("the decoder subprocess is given nothing to reach", async () => {
    // The isolation claim is structural, so it is checked structurally: the
    // worker pulls in no database, cache or http module, and the parent hands
    // it PATH and nothing else — no connection string, no key, no token.
    const worker = await Bun.file(
      new URL("./imageNormalizerWorker.ts", import.meta.url).pathname
    ).text();
    expect(worker).not.toMatch(/from\s+["'].*(postgres|redis|mail|jwt|jose)/i);
    expect(worker.match(/^import .*/gm)).toEqual(['import sharp from "sharp";']);

    const parent = await Bun.file(
      new URL("./ImageNormalizer.ts", import.meta.url).pathname
    ).text();
    expect(parent).toMatch(/env:\s*\{\s*PATH:/);
    expect(parent).not.toMatch(/env:\s*(process\.env|\{\s*\.\.\.)/);
  });

  test("a refusal leaves the caller running — the sandbox never faults the backend", async () => {
    const bad = await imageNormalizer.normalize(new TextEncoder().encode("nonsense"));
    expect(bad.ok).toBe(false);

    // The next normal image still crosses the boundary fine.
    const good = await imageNormalizer.normalize(await png(300, 300));
    expect(good.ok).toBe(true);
  });
});
