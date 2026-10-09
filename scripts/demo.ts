import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { WorkflowEngine } from "../src/core/workflow";
import { FileStore } from "../src/core/store";
import type { Run, Scenario } from "../src/core/contract";

const output = resolve(process.argv[2] ?? ".data/demo-cases.jsonl");
const root = mkdtempSync(join(tmpdir(), "switchyard-demo-"));
const engine = new WorkflowEngine(
  new FileStore(join(root, "state.json")),
  join(root, "deliveries"),
);
const cases: {
  caseId: string;
  expected: { status: Run["status"]; failureCode: string | null };
  run: Run;
}[] = [];
const expected: Record<
  string,
  { status: Run["status"]; failureCode: string | null }
> = {
  healthy: { status: "awaiting_approval", failureCode: null },
  fallback: { status: "awaiting_approval", failureCode: null },
  timeout: { status: "failed", failureCode: "timeout" },
  invalid: { status: "failed", failureCode: "invalid_output" },
  refusal: { status: "failed", failureCode: "refusal" },
  retry: { status: "failed", failureCode: "unavailable" },
  "retry-recovered": { status: "awaiting_approval", failureCode: null },
  "completed-bundle": { status: "completed", failureCode: null },
  "approval-invalidated": { status: "awaiting_approval", failureCode: null },
};
const record = (caseId: string, run: Run) =>
  cases.push({
    caseId,
    expected: expected[caseId]!,
    run: structuredClone(run),
  });
try {
  for (const scenario of [
    "healthy",
    "fallback",
    "timeout",
    "invalid",
    "refusal",
    "retry",
  ] as Scenario[]) {
    let run = await engine.create(scenario, `demo-${scenario}`);
    record(scenario, run);
    if (scenario === "retry") {
      run = await engine.command(
        run.id,
        { action: "retry", expectedRevision: run.revision },
        "demo-retry-command",
      );
      record("retry-recovered", run);
    }
    if (scenario === "fallback") {
      run = await engine.command(
        run.id,
        { action: "approve", expectedRevision: run.revision },
        "demo-approval",
      );
      run = await engine.command(
        run.id,
        { action: "deliver", expectedRevision: run.revision },
        "demo-delivery",
      );
      record("completed-bundle", run);
      run = await engine.command(
        run.id,
        { action: "revise", expectedRevision: run.revision },
        "demo-revise",
      );
      record("approval-invalidated", run);
    }
  }
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(
    output,
    cases.map((item) => JSON.stringify(item)).join("\n") + "\n",
  );
  console.log(
    `Exported ${cases.length} actual offline run snapshots to ${output}`,
  );
  console.log(
    "Provider elapsedMs values measure this local execution only. Expected outcomes are regression labels, not independent quality judgments.",
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
