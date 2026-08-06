import { describe, expect, test } from 'bun:test';

/**
 * The signup page's shape, asserted against its source.
 *
 * These are not stylistic checks. A password manager binds what it saved to a
 * particular form element, and on iOS it is the only party that knows the
 * password — the player never saw it. If the two steps share a form again, the
 * confirmation submit reads to the manager as a correction of the first one and
 * the six-digit code replaces the password in the keychain, leaving the account
 * unreachable to its owner while the database is perfectly fine.
 *
 * There is no way to assert this against a real keychain from a test, so what
 * is pinned here is the markup the manager reads.
 */
// The page lives in the sibling app; the assertion lives here because this is
// where the workspace's tests actually run — player-web has no test setup.
const SOURCE = await Bun.file(
  new URL('../../../../player-web/app/register/page.tsx', import.meta.url).pathname
).text();

/** The confirmation step's markup: everything after the claim form closes. */
const PROVE_STEP = SOURCE.slice(SOURCE.indexOf('onSubmit={onProve}'));
const CLAIM_STEP = SOURCE.slice(
  SOURCE.indexOf('onSubmit={onClaim}'),
  SOURCE.indexOf('onSubmit={onProve}')
);

describe('the signup page as a password manager reads it', () => {
  test('the two steps are separate form elements', () => {
    // One <form> per step, each with its own submit handler — not one form
    // whose children are swapped.
    expect(SOURCE).toMatch(/<form onSubmit=\{onClaim\}/);
    expect(SOURCE).toMatch(/<form onSubmit=\{onProve\}/);
    expect(SOURCE.match(/<form /g)).toHaveLength(2);
    expect(SOURCE).not.toMatch(/onSubmit=\{step === 'claim' \? onClaim : onProve\}/);
  });

  test('the confirmation step carries nothing a manager reads as a password', () => {
    expect(PROVE_STEP).not.toMatch(/type="password"/);
    expect(PROVE_STEP).not.toMatch(/autoComplete="(new-|current-)?password"/);
  });

  test('the code is marked one-time — the hint that tells a manager not to keep it', () => {
    expect(PROVE_STEP).toMatch(/autoComplete="one-time-code"/);
  });

  test('the address is marked username beside the password it belongs to', () => {
    // `email` alone leaves the manager guessing which account the strong
    // password is for; `username` is the pairing it actually reads.
    expect(CLAIM_STEP).toMatch(/autoComplete="username"/);
    expect(CLAIM_STEP).toMatch(/autoComplete="new-password"/);
  });
});
