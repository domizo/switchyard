import { resolve } from "node:path";
import { createApp } from "./app";
const port = Number(process.env.PORT ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT must be between 1024 and 65535.");
const dataRoot = resolve(process.env.SWITCHYARD_DATA_DIR ?? ".data");
const { server } = createApp(dataRoot, {
  staticRoot: resolve("dist"),
  allowDevOrigin: process.argv.includes("--dev"),
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `Switchyard: http://127.0.0.1:${port} (offline fixtures; data: ${dataRoot})`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
