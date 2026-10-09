import { performance } from "node:perf_hooks";
import {
  ReviewSchema,
  type Attempt,
  type FailureCode,
  type Manifest,
  type Review,
  type Scenario,
} from "./contract";
import { fixtureReview } from "./fixtures";

export interface Provider {
  name: Attempt["provider"];
  review(input: Manifest, signal: AbortSignal): Promise<unknown>;
}
export type GatewayResult =
  | { ok: true; review: Review; attempts: Attempt[] }
  | { ok: false; code: FailureCode; attempts: Attempt[] };
class DeadlineError extends Error {}
class UnavailableError extends Error {}

/** Local adapters only. Nothing in this module calls a network or reads credentials. */
export function fixtureProviders(
  scenario: Scenario,
  round: number,
): Provider[] {
  return (["Atlas fixture", "Cedar fixture"] as const).map((name, index) => ({
    name,
    async review(input, signal) {
      if (scenario === "timeout" || (scenario === "fallback" && index === 0)) {
        return new Promise((_, reject) => {
          const abort = () => reject(new DeadlineError());
          if (signal.aborted) abort();
          else signal.addEventListener("abort", abort, { once: true });
        });
      }
      if (scenario === "retry" && round === 1) throw new UnavailableError();
      if (scenario === "invalid") return { summary: 123, findings: [] };
      if (scenario === "refusal") return { refusal: true };
      return fixtureReview(input);
    },
  }));
}
async function withDeadline(
  provider: Provider,
  input: Manifest,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider.review(input, controller.signal),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new DeadlineError());
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    controller.abort();
  }
}
export async function routeReview(
  input: Manifest,
  providers: Provider[],
  round: number,
  timeoutMs = 25,
): Promise<GatewayResult> {
  const attempts: Attempt[] = [];
  let last: FailureCode = "unavailable";
  for (const provider of providers.slice(0, 2)) {
    const started = performance.now();
    let outcome: Attempt["outcome"];
    let review: Review | undefined;
    try {
      const raw = await withDeadline(provider, input, timeoutMs);
      if (
        typeof raw === "object" &&
        raw !== null &&
        "refusal" in raw &&
        raw.refusal === true
      )
        outcome = "refusal";
      else {
        const parsed = ReviewSchema.safeParse(raw);
        if (
          !parsed.success ||
          parsed.data.findings.some(
            (finding) =>
              !input.assets.some((asset) => asset.id === finding.assetId),
          )
        )
          outcome = "invalid_output";
        else {
          review = parsed.data;
          outcome = "valid";
        }
      }
    } catch (error) {
      outcome = error instanceof DeadlineError ? "timeout" : "unavailable";
    }
    attempts.push({
      provider: provider.name,
      outcome,
      elapsedMs: Math.round((performance.now() - started) * 1000) / 1000,
      round,
    });
    if (review) return { ok: true, review, attempts };
    last = outcome as FailureCode;
    if (outcome === "refusal") break; // Never silently route around an explicit refusal.
  }
  return { ok: false, code: last, attempts };
}
