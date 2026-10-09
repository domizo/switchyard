import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { z } from "zod";
import { CommandSchema, ScenarioSchema } from "../core/contract";
import { sha256 } from "../core/fixtures";
import { FileStore, Problem } from "../core/store";
import { WorkflowEngine } from "../core/workflow";

export function createApp(
  dataRoot: string,
  options: {
    staticRoot?: string;
    allowDevOrigin?: boolean;
    timeoutMs?: number;
  } = {},
) {
  const store = new FileStore(join(dataRoot, "state.json"));
  const engine = new WorkflowEngine(
    store,
    join(dataRoot, "deliveries"),
    options,
  );
  const server = createServer((req, res) => {
    void handle(req, res).catch((error) => {
      if (error instanceof Problem)
        send(res, error.status, { code: error.code, message: error.message });
      else if (error instanceof z.ZodError || error instanceof SyntaxError)
        send(res, 400, {
          code: "invalid_input",
          message: "Request does not match the contract.",
        });
      else
        send(res, 500, {
          code: "internal_error",
          message: "The local operation failed. Check filesystem availability.",
        });
    });
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  async function handle(req: IncomingMessage, res: ServerResponse) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader("Cache-Control", "no-store");
    const port = (server.address() as { port: number }).port;
    const host = req.headers.host ?? "";
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host))
      throw new Problem(403, "host_rejected", "Host is not allowed.");
    const origin = req.headers.origin;
    const permitted = [
      `http://${host}`,
      ...(options.allowDevOrigin ? ["http://127.0.0.1:5173"] : []),
    ];
    if (
      (origin && !permitted.includes(origin)) ||
      (req.method !== "GET" && !origin)
    )
      throw new Problem(
        403,
        "origin_rejected",
        "Use the local same-origin console.",
      );
    const pathname = new URL(req.url ?? "/", `http://${host}`).pathname;
    if (req.method === "GET" && pathname === "/api/runs")
      return send(res, 200, store.list());
    if (req.method === "GET" && pathname === "/api/health")
      return send(res, 200, {
        mode: "offline-fixtures",
        contractVersion: "switchyard.run.v1",
      });
    if (req.method === "POST" && pathname === "/api/runs") {
      const body = z
        .object({ scenario: ScenarioSchema })
        .strict()
        .parse(await readJson(req));
      return send(res, 201, await engine.create(body.scenario, key(req)));
    }
    const match = pathname.match(
      /^\/api\/runs\/([a-f0-9-]{36})(?:\/(commands|bundle|trace))?$/,
    );
    if (match) {
      const id = match[1]!;
      const operation = match[2];
      if (req.method === "GET" && (!operation || operation === "trace"))
        return send(res, 200, store.get(id));
      if (req.method === "POST" && operation === "commands")
        return send(
          res,
          200,
          await engine.command(
            id,
            CommandSchema.parse(await readJson(req)),
            key(req),
          ),
        );
      if (req.method === "GET" && operation === "bundle") {
        const run = store.get(id);
        if (run.status !== "completed" || !run.delivery)
          throw new Problem(
            409,
            "not_delivered",
            "This input has no completed bundle.",
          );
        const files = run.delivery.files.map((file) => {
          if (!/^[a-z0-9.-]+$/.test(file.name))
            throw new Error("Unsafe filename");
          const content = readFileSync(
            join(dataRoot, "deliveries", run.delivery!.directory, file.name),
            "utf8",
          );
          if (sha256(content) !== file.sha256)
            throw new Problem(
              409,
              "bundle_mismatch",
              "Bundle checksum verification failed.",
            );
          return { ...file, content };
        });
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="harbor-v${run.manifest.version}-bundle.json"`,
        );
        return send(res, 200, {
          contractVersion: "switchyard.bundle.v1",
          runId: id,
          inputDigest: run.inputDigest,
          bundleDigest: run.delivery.bundleDigest,
          files,
        });
      }
      throw new Problem(405, "method_not_allowed", "Method not allowed.");
    }
    if (pathname.startsWith("/api/"))
      throw new Problem(404, "not_found", "API route not found.");
    if (req.method !== "GET" || !options.staticRoot)
      throw new Problem(404, "not_found", "Route not found.");
    const root = resolve(options.staticRoot);
    const requested = resolve(root, "." + pathname);
    if (!requested.startsWith(root + sep) && requested !== root)
      throw new Problem(404, "not_found", "Route not found.");
    const file =
      existsSync(requested) && extname(requested)
        ? requested
        : join(root, "index.html");
    if (!existsSync(file))
      throw new Problem(
        404,
        "build_required",
        "Run npm run build before starting the console.",
      );
    const mime: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".svg": "image/svg+xml",
    };
    res.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    res.end(readFileSync(file));
  }
  return { server, store, engine };
}
function send(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(value));
}
function key(req: IncomingMessage): string {
  return z
    .string()
    .regex(/^[a-zA-Z0-9_-]{8,100}$/)
    .parse(req.headers["idempotency-key"]);
}
async function readJson(req: IncomingMessage): Promise<unknown> {
  if (!req.headers["content-type"]?.startsWith("application/json"))
    throw new Problem(415, "json_required", "Use application/json.");
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    const bytes = Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > 8192)
      throw new Problem(413, "body_too_large", "Request exceeds 8 KiB.");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
