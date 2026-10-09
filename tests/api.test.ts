import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpRequest } from "node:http";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createApp } from "../src/server/app";
import type { Run } from "../src/core/contract";

let root: string;
let app: ReturnType<typeof createApp>;
let url: string;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), "switchyard-api-"));
  app = createApp(root);
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  url = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
});
afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    app.server.close((error) => (error ? reject(error) : resolve())),
  );
  rmSync(root, { recursive: true, force: true });
});
const post = (
  path: string,
  body: unknown,
  extra: Record<string, string> = {},
) =>
  fetch(url + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: url,
      "Idempotency-Key": crypto.randomUUID(),
      ...extra,
    },
    body: JSON.stringify(body),
  });
it("runs the full API approval and verified download flow", async () => {
  const created = await post("/api/runs", { scenario: "fallback" });
  expect(created.status).toBe(201);
  let run = (await created.json()) as Run;
  expect(run.attempts.map((attempt) => attempt.outcome)).toEqual([
    "timeout",
    "valid",
  ]);
  let response = await post(`/api/runs/${run.id}/commands`, {
    action: "approve",
    expectedRevision: run.revision,
  });
  run = (await response.json()) as Run;
  response = await post(`/api/runs/${run.id}/commands`, {
    action: "deliver",
    expectedRevision: run.revision,
  });
  run = (await response.json()) as Run;
  expect(run.status).toBe("completed");
  const download = await fetch(`${url}/api/runs/${run.id}/bundle`);
  expect(download.status).toBe(200);
  expect((await download.json()).files).toHaveLength(6);
  expect(download.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
});
it("rejects unknown request fields and fixtures", async () => {
  expect(
    (await post("/api/runs", { scenario: "healthy", apiKey: "not-a-secret" }))
      .status,
  ).toBe(400);
  expect((await post("/api/runs", { scenario: "remote" })).status).toBe(400);
});
it("rejects browser mutations from foreign origins", async () => {
  expect(
    (
      await post(
        "/api/runs",
        { scenario: "healthy" },
        { Origin: "https://untrusted.example" },
      )
    ).status,
  ).toBe(403);
});
it("rejects missing origin and unsafe host", async () => {
  const response = await fetch(url + "/api/runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  expect(response.status).toBe(403);
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const request = httpRequest(
      url + "/api/runs",
      { headers: { Host: "untrusted.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    request.on("error", reject);
    request.end();
  });
  expect(status).toBe(403);
});
it("bounds request bytes and requires JSON", async () => {
  expect((await post("/api/runs", { extra: "x".repeat(9000) })).status).toBe(
    413,
  );
  expect(
    (await post("/api/runs", {}, { "Content-Type": "text/plain" })).status,
  ).toBe(415);
});
it("requires a well-formed idempotency key", async () => {
  expect(
    (
      await post(
        "/api/runs",
        { scenario: "healthy" },
        { "Idempotency-Key": "bad" },
      )
    ).status,
  ).toBe(400);
});
it("verifies disk bytes before allowing bundle download", async () => {
  let run = await app.engine.create("healthy", "create-key");
  run = await app.engine.command(
    run.id,
    { action: "approve", expectedRevision: run.revision },
    "approve-key",
  );
  run = await app.engine.command(
    run.id,
    { action: "deliver", expectedRevision: run.revision },
    "deliver-key",
  );
  writeFileSync(
    join(root, "deliveries", run.delivery!.directory, "harbor-notes.txt"),
    "tampered",
  );
  expect((await fetch(`${url}/api/runs/${run.id}/bundle`)).status).toBe(409);
});
