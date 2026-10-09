import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { expect, it } from "vitest";
import type { Run } from "../src/core/contract";

async function launch(
  root: string,
  deadline = 25,
): Promise<{ child: ChildProcess; url: string }> {
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/recovery-server.ts", root, String(deadline)],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  return new Promise((resolve, reject) => {
    let output = "";
    child.on("error", reject);
    child.on("exit", (code) =>
      reject(new Error(`Child exited before ready: ${code}; ${output}`)),
    );
    child.stderr?.on("data", (chunk) => {
      output += String(chunk);
    });
    child.stdout?.on("data", (chunk) => {
      output += String(chunk);
      const ready = output.match(/READY:(\d+)/);
      if (ready) resolve({ child, url: `http://127.0.0.1:${ready[1]}` });
    });
  });
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  child.kill("SIGKILL");
  await exited;
}
it("recovers review and approval after actual process termination and restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "switchyard-restart-"));
  const children: ChildProcess[] = [];
  try {
    const first = await launch(root, 5000);
    children.push(first.child);
    const pending = fetch(first.url + "/api/runs", {
      method: "POST",
      headers: {
        Origin: first.url,
        "Content-Type": "application/json",
        "Idempotency-Key": "restart-create",
      },
      body: JSON.stringify({ scenario: "fallback" }),
    }).catch(() => undefined);
    let interrupted: Run | undefined;
    for (let i = 0; i < 200; i++) {
      if (existsSync(join(root, "state.json"))) {
        const state = JSON.parse(
          readFileSync(join(root, "state.json"), "utf8"),
        ) as { runs: Run[] };
        interrupted = state.runs[0];
        if (interrupted?.status === "reviewing" && interrupted.round === 1)
          break;
      }
      await pause(5);
    }
    expect(interrupted?.status).toBe("reviewing");
    await stop(first.child);
    await pending;
    const second = await launch(root);
    children.push(second.child);
    let run = (await (
      await fetch(`${second.url}/api/runs/${interrupted!.id}`)
    ).json()) as Run;
    expect(run.failure?.code).toBe("interrupted");
    expect(
      run.audit.some((event) => event.event === "review.interrupted"),
    ).toBe(true);
    async function command(url: string, run: Run, action: string) {
      return (await (
        await fetch(`${url}/api/runs/${run.id}/commands`, {
          method: "POST",
          headers: {
            Origin: url,
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({ action, expectedRevision: run.revision }),
        })
      ).json()) as Run;
    }
    run = await command(second.url, run, "retry");
    expect(run.status).toBe("awaiting_approval");
    run = await command(second.url, run, "approve");
    expect(run.status).toBe("approved");
    await stop(second.child);
    const third = await launch(root);
    children.push(third.child);
    const persisted = (await (
      await fetch(`${third.url}/api/runs/${run.id}`)
    ).json()) as Run;
    expect(persisted.approval).toEqual(run.approval);
    const delivered = await command(third.url, persisted, "deliver");
    expect(delivered.status).toBe("completed");
    expect(
      delivered.audit.filter((event) => event.event === "approval.granted"),
    ).toHaveLength(1);
  } finally {
    await Promise.all(children.map(stop));
    rmSync(root, { recursive: true, force: true });
  }
});
