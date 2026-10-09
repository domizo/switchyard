# Exchange contract

`src/core/contract.ts` is the TypeScript/Zod source. [run.schema.json](run.schema.json) is its generated JSON Schema 2020-12. Regenerate with `node --import tsx scripts/export-schema.ts`; CI checks that it has not drifted.

`GET /api/runs/:id/trace` returns a `switchyard.run.v1` object. The Python evaluator expects JSONL envelopes:

```json
{"caseId":"fallback","expected":{"status":"awaiting_approval","failureCode":null},"run":{"contractVersion":"switchyard.run.v1","...":"see generated schema"}}
```

The example is abbreviated, not a valid complete run. `npm run demo` creates complete snapshots using actual engine execution and independently declared expected status/failure labels. IDs and wall-clock timestamps vary between executions, as do measured local fixture durations. Content hashes and fixture outcomes are deterministic.

| API | Behavior |
|---|---|
| GET `/api/health` | Reports offline mode and contract version |
| GET `/api/runs` | Current persisted runs |
| POST `/api/runs` | `{scenario}`; creates/replays one fixture review |
| POST `/api/runs/:id/commands` | `{action, expectedRevision}`; actions: retry, approve, deliver, reject, revise |
| GET `/api/runs/:id/trace` | Current full run, including synthetic content and audit |
| GET `/api/runs/:id/bundle` | Byte-verified completed JSON bundle |

Mutations require `Content-Type: application/json`, same local Origin, and an `Idempotency-Key` of 8–100 ASCII letters/digits/underscore/hyphen. Unknown fields are rejected. Revision or transition conflicts return 409; malformed input 400; foreign/missing origin 403; wrong media type 415; oversized body 413. No secrets belong in these requests.

The Fieldcheck repository includes a frozen copy of this schema and independently implemented checks. Its evaluator checks a deliberately bounded synthetic v1 contract; it is not a general JSON Schema engine or signed-log verifier. Compatible changes require both implementations and the fixtures to be reviewed. Breaking changes require a new contract version.
