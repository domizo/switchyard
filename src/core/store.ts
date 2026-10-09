import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { RunSchema, type Run } from "./contract";

const StateSchema = z
  .object({
    version: z.literal(1),
    runs: z.array(RunSchema).max(100),
    receipts: z
      .array(
        z
          .object({
            key: z.string(),
            fingerprint: z.string(),
            runId: z.string().uuid(),
          })
          .strict(),
      )
      .max(2000),
  })
  .strict();
type State = z.infer<typeof StateSchema>;
export class Problem extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** One process owns the file; all mutations are serialized by WorkflowEngine. */
export class FileStore {
  private state: State;
  constructor(private readonly path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.state = existsSync(path)
      ? StateSchema.parse(JSON.parse(readFileSync(path, "utf8")))
      : { version: 1, runs: [], receipts: [] };
  }
  list(): Run[] {
    return structuredClone(this.state.runs);
  }
  get(id: string): Run {
    const run = this.state.runs.find((item) => item.id === id);
    if (!run) throw new Problem(404, "not_found", "Run not found.");
    return structuredClone(run);
  }
  replay(key: string, fingerprint: string): Run | undefined {
    const receipt = this.state.receipts.find((item) => item.key === key);
    if (!receipt) return undefined;
    if (receipt.fingerprint !== fingerprint)
      throw new Problem(
        409,
        "key_collision",
        "This command key was used with different input.",
      );
    return this.get(receipt.runId);
  }
  save(run: Run, receipt?: { key: string; fingerprint: string }): void {
    const next = structuredClone(this.state);
    const index = next.runs.findIndex((item) => item.id === run.id);
    if (index === -1) {
      if (next.runs.length >= 100)
        throw new Problem(
          409,
          "capacity",
          "Local demo capacity reached (100 runs).",
        );
      next.runs.unshift(run);
    } else next.runs[index] = run;
    if (receipt) {
      if (next.receipts.length >= 2000)
        throw new Problem(409, "capacity", "Local command capacity reached.");
      next.receipts.push({ ...receipt, runId: run.id });
    }
    const validated = StateSchema.parse(next);
    const temporary = `${this.path}.tmp`;
    const fd = openSync(temporary, "w", 0o600);
    try {
      writeFileSync(fd, JSON.stringify(validated, null, 2));
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temporary, this.path);
    this.state = validated; // Memory changes only after the durable file is replaced.
  }
}
