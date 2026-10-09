import { writeFileSync } from "node:fs";
import { z } from "zod";
import { RunSchema } from "../src/core/contract";
writeFileSync(
  "docs/run.schema.json",
  JSON.stringify(z.toJSONSchema(RunSchema), null, 2) + "\n",
);
console.log("Wrote switchyard.run.v1 JSON Schema (2020-12).");
