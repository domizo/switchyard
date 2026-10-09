import {
  RunSchema,
  type Command,
  type Run,
  type Scenario,
} from "../core/contract";
export async function request(
  path: string,
  body?: unknown,
  commandKey?: string,
): Promise<unknown> {
  const res = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": commandKey ?? crypto.randomUUID(),
          },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const data: unknown = await res.json();
  if (!res.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String(data.message)
        : "The local request failed.";
    throw new Error(message);
  }
  return data;
}
export const api = {
  async list(): Promise<Run[]> {
    return RunSchema.array().parse(await request("/api/runs"));
  },
  async create(scenario: Scenario, key: string): Promise<Run> {
    return RunSchema.parse(await request("/api/runs", { scenario }, key));
  },
  async command(
    run: Run,
    action: Command["action"],
    key: string,
  ): Promise<Run> {
    return RunSchema.parse(
      await request(
        `/api/runs/${run.id}/commands`,
        { action, expectedRevision: run.revision },
        key,
      ),
    );
  },
};
