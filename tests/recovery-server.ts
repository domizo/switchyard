import { createApp } from "../src/server/app";
const { server } = createApp(process.argv[2]!, {
  timeoutMs: Number(process.argv[3] ?? 25),
});
server.listen(0, "127.0.0.1", () =>
  console.log(`READY:${(server.address() as { port: number }).port}`),
);
