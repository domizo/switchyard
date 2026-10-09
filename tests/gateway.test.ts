import { describe, expect, it } from "vitest";
import {
  fixtureManifest,
  fixtureReview,
  manifestDigest,
  validateManifest,
} from "../src/core/fixtures";
import {
  fixtureProviders,
  routeReview,
  type Provider,
} from "../src/core/gateway";

describe("deterministic evidence", () => {
  it("checks all original bytes and motion metadata", () => {
    expect(
      validateManifest(fixtureManifest()).every((check) => check.passed),
    ).toBe(true);
  });
  it("detects a content change without a matching checksum", () => {
    const manifest = fixtureManifest();
    manifest.assets[0]!.content += "tamper";
    expect(validateManifest(manifest)[0]!.passed).toBe(false);
  });
  it("detects duplicate identities", () => {
    const manifest = fixtureManifest();
    manifest.assets[1]!.id = manifest.assets[0]!.id;
    expect(validateManifest(manifest).every((check) => !check.passed)).toBe(
      true,
    );
  });
  it("binds a digest to versioned input", () => {
    expect(manifestDigest(fixtureManifest())).not.toBe(
      manifestDigest(fixtureManifest(2)),
    );
    expect(manifestDigest(fixtureManifest())).toBe(
      manifestDigest(fixtureManifest()),
    );
  });
});
describe("provider gateway", () => {
  it("uses the first valid provider", async () => {
    const result = await routeReview(
      fixtureManifest(),
      fixtureProviders("healthy", 1),
      1,
    );
    expect(result.ok).toBe(true);
    expect(result.attempts).toHaveLength(1);
  });
  it("cancels a timed-out adapter and falls back", async () => {
    const result = await routeReview(
      fixtureManifest(),
      fixtureProviders("fallback", 1),
      1,
    );
    expect(result.ok).toBe(true);
    expect(result.attempts.map((attempt) => attempt.outcome)).toEqual([
      "timeout",
      "valid",
    ]);
  });
  it.each(["timeout", "invalid", "refusal"] as const)(
    "distinguishes %s from other failures",
    async (scenario) => {
      const result = await routeReview(
        fixtureManifest(),
        fixtureProviders(scenario, 1),
        1,
      );
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(result.code).toBe(
          scenario === "invalid" ? "invalid_output" : scenario,
        );
      expect(result.attempts).toHaveLength(scenario === "refusal" ? 1 : 2);
    },
  );
  it("rejects schema-valid findings with unknown evidence", async () => {
    const review = fixtureReview(fixtureManifest());
    review.findings[0]!.assetId = "unknown";
    const provider: Provider = {
      name: "Atlas fixture",
      review: async () => review,
    };
    const result = await routeReview(fixtureManifest(), [provider], 1);
    expect(result.ok).toBe(false);
    expect(result.attempts[0]!.outcome).toBe("invalid_output");
  });
  it("enforces a deadline even if an adapter ignores abort", async () => {
    const provider: Provider = {
      name: "Atlas fixture",
      review: () => new Promise(() => undefined),
    };
    const result = await routeReview(fixtureManifest(), [provider], 1, 5);
    expect(result.attempts[0]!.outcome).toBe("timeout");
  });
  it("never attempts more than two providers", async () => {
    const providers = fixtureProviders("retry", 1);
    const result = await routeReview(
      fixtureManifest(),
      [...providers, ...providers],
      1,
    );
    expect(result.attempts).toHaveLength(2);
  });
  it("does not surface internal provider error contents", async () => {
    const provider: Provider = {
      name: "Atlas fixture",
      review: async () => {
        throw new Error("sensitive internal detail");
      },
    };
    expect(
      JSON.stringify(await routeReview(fixtureManifest(), [provider], 1)),
    ).not.toContain("sensitive");
  });
});
