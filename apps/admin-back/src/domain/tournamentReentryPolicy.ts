/** Default max re-entries per player when the client omits `maxReentries`. */
export const DEFAULT_MAX_REENTRIES = 5;

/**
 * Effective cap on re-entries per player for API/UI.
 * Freeze-out always yields 0; otherwise the structure's max (≥ 0).
 */
export function effectiveAllowedReentryCount(
  freezeOutEnabled: boolean,
  maxReentries: number
): number {
  return freezeOutEnabled ? 0 : maxReentries;
}

/**
 * When true, initial entry payment must be Free (Cache/CreditCard disallowed). Re-entries unchanged.
 */
export function isEntryFreeOnly(structure: {
  entryFreeOnly?: boolean;
} | null): boolean {
  return structure?.entryFreeOnly === true;
}
