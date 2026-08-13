/**
 * Legal documents a player must consent to at registration. The version is the
 * document's effective date; bumping it forces new registrations to consent to
 * the new text and leaves the old consents on record. Keep the slugs in sync
 * with the player-web `data/legal.ts`.
 */
export interface RequiredLegalDoc {
  readonly slug: string;
  readonly version: string;
}

export const REQUIRED_LEGAL_DOCS: readonly RequiredLegalDoc[] = [
  { slug: "consent-pd", version: "2026-02-01" },
  { slug: "acknowledgment", version: "2026-02-01" },
];

/**
 * True when `given` covers every required document at its current version.
 * `given` is the client-submitted list of accepted (slug, version) pairs.
 */
export function consentsSatisfyRequirements(
  given: ReadonlyArray<{ slug: string; version: string }>
): boolean {
  return REQUIRED_LEGAL_DOCS.every((req) =>
    given.some((g) => g.slug === req.slug && g.version === req.version)
  );
}

/**
 * Reads the client-submitted list of accepted (slug, version) pairs, or null
 * if it is not one. Parsing only: whether the pairs *satisfy* the requirements
 * is a separate question, asked by whoever is gating on it.
 */
export function parseConsents(raw: unknown): Array<{ slug: string; version: string }> | null {
  if (!Array.isArray(raw)) return null;
  const out: Array<{ slug: string; version: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return null;
    const { slug, version } = item as Record<string, unknown>;
    if (typeof slug !== "string" || typeof version !== "string") return null;
    out.push({ slug, version });
  }
  return out;
}
