import { describe, expect, test } from "bun:test";
import { buildAllowedHeaders } from "./cors";

describe("buildAllowedHeaders", () => {
  test("appends Idempotency-Key when the configured list omits it", () => {
    expect(buildAllowedHeaders("Content-Type, Authorization")).toBe(
      "Content-Type, Authorization, Idempotency-Key"
    );
  });

  test("does not duplicate when already present (case-insensitive)", () => {
    expect(buildAllowedHeaders("Content-Type, idempotency-key")).toBe(
      "Content-Type, idempotency-key"
    );
  });

  test("trims and drops empty entries", () => {
    expect(buildAllowedHeaders(" Content-Type ,, Authorization ")).toBe(
      "Content-Type, Authorization, Idempotency-Key"
    );
  });
});
