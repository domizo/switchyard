import { randomUUID } from "node:crypto";
import type { Command, Run, Scenario } from "./contract";
import {
  fixtureManifest,
  manifestDigest,
  sha256,
  validateManifest,
} from "./fixtures";
import { fixtureProviders, routeReview, type Provider } from "./gateway";
import { buildBundle } from "./delivery";
import { FileStore, Problem } from "./store";

type EngineOptions = {
  timeoutMs?: number;
  providers?: (scenario: Scenario, round: number) => Provider[];
};
const messages = {
  timeout: "All eligible fixtures exceeded the deadline.",
  invalid_output: "Provider output failed the structured response contract.",
  refusal: "The provider refused this request. Routing stopped.",
  unavailable:
    "Both fixtures are unavailable. Retry to replay the recovery scenario.",
  interrupted:
    "The process stopped during review. Retry from the persisted input.",
  input_invalid: "Manifest validation failed. Approval is blocked.",
  delivery_failed:
    "Local bundle creation failed. Retry delivery from the approved checkpoint.",
};
export class WorkflowEngine {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    readonly store: FileStore,
    readonly deliveryRoot: string,
    private readonly options: EngineOptions = {},
  ) {
    for (const run of store.list())
      if (run.status === "reviewing") {
        run.status = "failed";
        run.failure = { code: "interrupted", message: messages.interrupted };
        run.revision++;
        this.event(run, "review.interrupted", "retry required");
        store.save(run);
      }
  }
  private serial<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private event(run: Run, event: string, result: string) {
    run.audit.push({
      seq: run.audit.length + 1,
      at: new Date().toISOString(),
      event,
      inputVersion: run.manifest.version,
      inputDigest: run.inputDigest,
      result,
    });
  }
  private async review(run: Run): Promise<Run> {
    run.checks = validateManifest(run.manifest);
    if (
      run.checks.some((check) => !check.passed) ||
      manifestDigest(run.manifest) !== run.inputDigest
    ) {
      run.status = "failed";
      run.failure = { code: "input_invalid", message: messages.input_invalid };
      run.revision++;
      this.event(run, "manifest.checked", "failed");
      this.store.save(run);
      return run;
    }
    run.status = "reviewing";
    run.failure = null;
    run.round++;
    this.event(run, "review.started", `round ${run.round}`);
    this.store.save(run);
    const result = await routeReview(
      run.manifest,
      (this.options.providers ?? fixtureProviders)(run.scenario, run.round),
      run.round,
      this.options.timeoutMs,
    );
    run.attempts.push(...result.attempts);
    for (const attempt of result.attempts)
      this.event(
        run,
        "provider.attempt",
        `${attempt.provider}: ${attempt.outcome}`,
      );
    if (result.ok) {
      run.review = result.review;
      run.status = "awaiting_approval";
      this.event(run, "approval.requested", "waiting");
    } else {
      run.status = "failed";
      run.failure = { code: result.code, message: messages[result.code] };
      this.event(run, "review.failed", result.code);
    }
    run.revision++;
    this.store.save(run);
    return run;
  }
  create(scenario: Scenario, key: string): Promise<Run> {
    return this.serial(async () => {
      const fingerprint = sha256(JSON.stringify({ create: scenario }));
      const previous = this.store.replay(key, fingerprint);
      if (previous) return previous;
      const manifest = fixtureManifest();
      const run: Run = {
        contractVersion: "switchyard.run.v1",
        id: randomUUID(),
        scenario,
        revision: 1,
        status: "reviewing",
        createdAt: new Date().toISOString(),
        manifest,
        inputDigest: manifestDigest(manifest),
        checks: validateManifest(manifest),
        review: null,
        attempts: [],
        round: 0,
        failure: null,
        approval: null,
        delivery: null,
        audit: [],
      };
      this.event(run, "manifest.checked", "passed");
      this.store.save(run, { key, fingerprint });
      return this.review(run);
    });
  }
  command(id: string, command: Command, key: string): Promise<Run> {
    return this.serial(async () => {
      const fingerprint = sha256(JSON.stringify({ id, ...command }));
      const previous = this.store.replay(key, fingerprint);
      if (previous) return previous;
      const run = this.store.get(id);
      if (run.revision !== command.expectedRevision)
        throw new Problem(
          409,
          "stale_revision",
          "This run changed. Refresh before acting.",
        );
      switch (command.action) {
        case "retry":
          if (
            run.status !== "failed" ||
            ["refusal", "input_invalid", "delivery_failed"].includes(
              run.failure?.code ?? "",
            )
          )
            throw new Problem(
              409,
              "invalid_transition",
              "This review cannot be retried.",
            );
          run.revision++;
          run.status = "reviewing";
          this.store.save(run, { key, fingerprint });
          return this.review(run);
        case "approve":
          if (
            run.status !== "awaiting_approval" ||
            !run.review ||
            validateManifest(run.manifest).some((check) => !check.passed) ||
            manifestDigest(run.manifest) !== run.inputDigest
          )
            throw new Problem(
              409,
              "invalid_transition",
              "Only a validated review can be approved.",
            );
          run.approval = {
            inputVersion: run.manifest.version,
            inputDigest: run.inputDigest,
            at: new Date().toISOString(),
          };
          run.status = "approved";
          run.failure = null;
          this.event(run, "approval.granted", "approved");
          run.approval.at = run.audit.at(-1)!.at;
          break;
        case "reject":
          if (run.status !== "awaiting_approval")
            throw new Problem(
              409,
              "invalid_transition",
              "Only a pending review can be rejected.",
            );
          run.status = "rejected";
          this.event(run, "approval.rejected", "rejected");
          break;
        case "revise":
          if (run.manifest.version !== 1 || run.status === "reviewing")
            throw new Problem(
              409,
              "invalid_transition",
              "The demo provides only input versions 1 and 2.",
            );
          run.manifest = fixtureManifest(2);
          run.inputDigest = manifestDigest(run.manifest);
          run.checks = validateManifest(run.manifest);
          run.approval = null;
          run.delivery = null;
          run.review = null;
          run.failure = null;
          run.round = 0;
          run.status = "reviewing";
          run.revision++;
          this.event(run, "input.revised", "approval invalidated");
          this.store.save(run, { key, fingerprint });
          return this.review(run);
        case "deliver":
          if (run.status !== "approved")
            throw new Problem(
              409,
              "invalid_transition",
              "Delivery requires approval for this input.",
            );
          try {
            run.delivery = buildBundle(run, this.deliveryRoot);
            run.status = "completed";
            run.failure = null;
            this.event(run, "delivery.created", "local bundle verified");
          } catch {
            run.failure = {
              code: "delivery_failed",
              message: messages.delivery_failed,
            };
            this.event(run, "delivery.failed", "approved checkpoint retained");
          }
          break;
      }
      run.revision++;
      this.store.save(run, { key, fingerprint });
      return run;
    });
  }
}
