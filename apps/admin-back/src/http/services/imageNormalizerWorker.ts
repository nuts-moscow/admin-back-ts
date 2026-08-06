/**
 * The decoder, and nothing else.
 *
 * This file is the entry point of a subprocess spawned by `ImageNormalizer`.
 * It is deliberately the only place `sharp` — and through it libvips, a C
 * library with a CVE history that has been exploited in the wild — is
 * imported. The backend is one process holding the tournament clock, the cash
 * desk and the database credentials; an in-process decoder exploit reaches all
 * of them. In here there is nothing to reach: the parent strips the
 * environment, and this process opens no socket and no database handle.
 *
 * Protocol: raw bytes on stdin, the normalized WebP on stdout, exit 0. Any
 * failure is exit non-zero with a short reason on stderr. The parent turns
 * every non-zero outcome — crash, timeout, over-budget, unreadable file — into
 * the same refusal, so the caller never has to tell them apart.
 */
import sharp from "sharp";

/** Side of the square we publish. Anything larger is a waste of a round avatar. */
const SIDE = 256;

/**
 * The decode budget, counted in pixels the header claims rather than bytes on
 * disk: a decompression bomb is small on disk and enormous once decoded, so the
 * file size would be the wrong thing to bound.
 */
const MAX_INPUT_PIXELS = 40_000_000;

function fail(reason: string): never {
  process.stderr.write(reason);
  process.exit(1);
}

const input = Buffer.from(await Bun.stdin.arrayBuffer());
if (input.byteLength === 0) fail("empty");

try {
  const output = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, animated: false })
    .rotate()
    .resize(SIDE, SIDE, { fit: "cover", position: "centre", withoutEnlargement: false })
    .webp({ quality: 82 })
    .toBuffer();
  process.stdout.write(output);
  process.exit(0);
} catch (err) {
  fail(err instanceof Error ? err.message : "decode failed");
}
