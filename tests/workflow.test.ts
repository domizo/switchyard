import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FileStore } from "../src/core/store";
import { WorkflowEngine } from "../src/core/workflow";
import { buildBundle } from "../src/core/delivery";
import { sha256 } from "../src/core/fixtures";
import type { Command, Run } from "../src/core/contract";

let root: string;
let engine: WorkflowEngine;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "switchyard-unit-"));
  engine = new WorkflowEngine(
    new FileStore(join(root, "state.json")),
    join(root, "deliveries"),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const act = (
  run: Run,
  action: Command["action"],
  key: string = crypto.randomUUID(),
) => engine.command(run.id, { action, expectedRevision: run.revision }, key);
describe("durable workflow", () => {
  it("revalidates persisted input before a retry calls any provider", async () => {
    let run = await engine.create("retry", "create-key");
    const attempts = run.attempts.length;
    run.manifest.assets[0]!.content += "modified";
    engine.store.save(run);
    run = await act(run, "retry");
    expect(run.failure?.code).toBe("input_invalid");
    expect(run.attempts).toHaveLength(attempts);
  });
  it("requires server-side approval before delivery", async () => {
    const run = await engine.create("healthy", "create-key");
    await expect(act(run, "deliver")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
  it("builds real files and verifies all checksums", async () => {
    let run = await engine.create("healthy", "create-key");
    run = await act(run, "approve");
    run = await act(run, "deliver");
    expect(run.status).toBe("completed");
    for (const file of run.delivery!.files)
      expect(
        sha256(
          readFileSync(
            join(root, "deliveries", run.delivery!.directory, file.name),
          ),
        ),
      ).toBe(file.sha256);
  });
  it("retains approval after delivery failure and retries from it", async () => {
    let run = await engine.create("healthy", "create-key");
    run = await act(run, "approve");
    writeFileSync(join(root, "blocked"), "file");
    engine = new WorkflowEngine(engine.store, join(root, "blocked"));
    run = await act(run, "deliver");
    expect(run.status).toBe("approved");
    expect(run.failure?.code).toBe("delivery_failed");
    engine = new WorkflowEngine(engine.store, join(root, "deliveries"));
    run = await act(run, "deliver");
    expect(run.status).toBe("completed");
  });
  it("invalidates approval when the input changes", async () => {
    let run = await engine.create("healthy", "create-key");
    run = await act(run, "approve");
    const oldDigest = run.inputDigest;
    run = await act(run, "revise");
    expect(run.inputDigest).not.toBe(oldDigest);
    expect(run.approval).toBeNull();
    expect(run.status).toBe("awaiting_approval");
    await expect(act(run, "deliver")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
  it("rejects an old revision after input changes", async () => {
    const old = await engine.create("healthy", "create-key");
    await act(old, "revise");
    await expect(act(old, "approve")).rejects.toMatchObject({
      code: "stale_revision",
    });
  });
  it("rejects altered bytes even if cached checks were valid", async () => {
    const run = await engine.create("healthy", "create-key");
    run.manifest.assets[0]!.content += "modified";
    engine.store.save(run);
    await expect(act(run, "approve")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
  it("rejects stale approval at the delivery boundary", async () => {
    let run = await engine.create("healthy", "create-key");
    run = await act(run, "approve");
    run.approval!.inputDigest = "0".repeat(64);
    expect(() => buildBundle(run, join(root, "deliveries"))).toThrow(
      "Approval does not match",
    );
  });
  it("deduplicates concurrent creation with one key", async () => {
    const [a, b] = await Promise.all([
      engine.create("healthy", "same-key"),
      engine.create("healthy", "same-key"),
    ]);
    expect(a.id).toBe(b.id);
    expect(engine.store.list()).toHaveLength(1);
  });
  it("rejects reused command keys with changed input", async () => {
    await engine.create("healthy", "same-key");
    await expect(engine.create("timeout", "same-key")).rejects.toMatchObject({
      code: "key_collision",
    });
  });
  it("deduplicates a persisted command across restart", async () => {
    const run = await engine.create("healthy", "create-key");
    const approved = await act(run, "approve", "approve-key");
    engine = new WorkflowEngine(
      new FileStore(join(root, "state.json")),
      join(root, "deliveries"),
    );
    const replayed = await act(run, "approve", "approve-key");
    expect(replayed.revision).toBe(approved.revision);
    expect(
      replayed.audit.filter((event) => event.event === "approval.granted"),
    ).toHaveLength(1);
  });
  it("recovers an explicit fixture outage on retry", async () => {
    let run = await engine.create("retry", "create-key");
    expect(run.failure?.code).toBe("unavailable");
    run = await act(run, "retry");
    expect(run.status).toBe("awaiting_approval");
    expect(run.round).toBe(2);
  });
  it("does not bypass refusal with retry", async () => {
    const run = await engine.create("refusal", "create-key");
    await expect(act(run, "retry")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
  it("rejection creates no bundle and cannot be approved", async () => {
    let run = await engine.create("healthy", "create-key");
    run = await act(run, "reject");
    expect(run.delivery).toBeNull();
    await expect(act(run, "approve")).rejects.toMatchObject({
      code: "invalid_transition",
    });
  });
  it("fails closed on corrupt persistence", () => {
    writeFileSync(join(root, "state.json"), '{"version":2}');
    expect(() => new FileStore(join(root, "state.json"))).toThrow();
  });
  it("detects modified existing delivery bytes on replay", async () => {
    let run = await engine.create("healthy", "create-key");
    run = await act(run, "approve");
    const delivery = buildBundle(run, join(root, "deliveries"));
    writeFileSync(
      join(root, "deliveries", delivery.directory, "harbor-notes.txt"),
      "changed",
    );
    expect(() => buildBundle(run, join(root, "deliveries"))).toThrow(
      "different bytes",
    );
  });
});
