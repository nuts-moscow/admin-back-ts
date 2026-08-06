import { logger } from "../../logger";

/**
 * The isolation boundary in front of the image decoder.
 *
 * Everything untrusted a player sends meets a C parser somewhere; this is where
 * that happens, and it happens in a subprocess that has no network, no secrets
 * and no database reach. Code execution inside a decoder vulnerability lands in
 * an empty box.
 *
 * The caller gets one of two answers. There is no third: a crash, a hang, an
 * over-budget image and a file that is not an image at all are all the same
 * refusal, because none of them is a picture and the difference is of no use to
 * anyone upstream.
 */
export type NormalizeResult =
  | { ok: true; image: Buffer; contentType: "image/webp" }
  | { ok: false; reason: string };

/** Wall-clock ceiling on the whole subprocess. Generous for a photo, fatal for a bomb. */
const TIMEOUT_MS = 5_000;

/** Refuse a body this large before spawning anything: a real avatar is far smaller. */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const WORKER = new URL("./imageNormalizerWorker.ts", import.meta.url).pathname;

export interface ImageNormalizer {
  normalize(input: Uint8Array): Promise<NormalizeResult>;
}

class SandboxedImageNormalizer implements ImageNormalizer {
  async normalize(input: Uint8Array): Promise<NormalizeResult> {
    if (input.byteLength === 0) return { ok: false, reason: "empty" };
    if (input.byteLength > MAX_UPLOAD_BYTES) return { ok: false, reason: "too large" };

    let proc: Bun.Subprocess<"pipe", "pipe", "pipe"> | null = null;
    const timer = { fired: false };
    let killAt: ReturnType<typeof setTimeout> | null = null;

    try {
      proc = Bun.spawn(["bun", "run", WORKER], {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        // No secrets, no connection strings, no credentials — the child is given
        // nothing it could exfiltrate or reuse. PATH only, so `bun` resolves.
        env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      });

      // The timeout is enforced out here rather than trusted to the child: a
      // wedged decoder frees the worker at our ceiling, not at its convenience.
      killAt = setTimeout(() => {
        timer.fired = true;
        proc?.kill();
      }, TIMEOUT_MS);

      proc.stdin.write(input);
      await proc.stdin.end();

      const [stdout, exitCode] = await Promise.all([
        new Response(proc.stdout).arrayBuffer(),
        proc.exited,
      ]);

      if (timer.fired) return { ok: false, reason: "timeout" };
      if (exitCode !== 0) {
        const stderr = await new Response(proc.stderr).text();
        logger?.info({ exitCode, stderr: stderr.slice(0, 200) }, "[ImageNormalizer] refused");
        return { ok: false, reason: "not an image" };
      }
      if (stdout.byteLength === 0) return { ok: false, reason: "not an image" };

      return { ok: true, image: Buffer.from(stdout), contentType: "image/webp" };
    } catch (err) {
      // A sandbox that fails to start is a refusal too — never a backend fault.
      logger?.error({ err }, "[ImageNormalizer] sandbox failed");
      return { ok: false, reason: "not an image" };
    } finally {
      if (killAt) clearTimeout(killAt);
      proc?.kill();
    }
  }
}

export const imageNormalizer: ImageNormalizer = new SandboxedImageNormalizer();
