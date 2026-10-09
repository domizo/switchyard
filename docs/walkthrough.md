# Switchyard technical walkthrough

[English](walkthrough.md) | [日本語](walkthrough.ja.md)

Switchyard processes synthetic creative assets through validation, provider review, human approval and local delivery. Atlas and Cedar return deterministic fixtures; no live model is called.

## Processing flow

| Component              | Responsibility                                                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/contract.ts` | Defines input, review, approval, delivery and portable trace schemas. Evidence IDs link findings to known assets.                       |
| `src/core/workflow.ts` | Enforces state transitions and approval on the server. Approval belongs to one input version and digest; changing input invalidates it. |
| `src/core/gateway.ts`  | Bounds provider attempts and deadlines. Timeout, invalid response and unavailability allow fallback; explicit refusal stops routing.    |
| `src/core/store.ts`    | Persists checkpoints and command receipts. Revision checks reject stale updates; receipts deduplicate local commands.                   |
| `src/core/delivery.ts` | Creates local files after approval and verifies their SHA-256 hashes before download.                                                   |

The React console composes a run list, review surface and native creation dialog. UI controls reflect server state; the server validates every transition independently.

## Design decisions

| Decision                                | Rationale and boundary                                                                                                                                                                   |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate application and evaluator      | Switchyard handles effects and decisions; Fieldcheck independently inspects the portable JSONL output contract. The gateway has one current consumer and remains inside the application. |
| Human approval after a validated review | Structured output proves shape and evidence linkage, not factual correctness or release intent. Approval is bound to the input version and digest.                                       |
| Explicit retry after interruption       | A review interrupted by process termination resumes from saved input through a new review command. Persisted approval can resume delivery.                                               |
| Local command deduplication             | Receipts deduplicate state transitions. Provider calls can repeat after restart; external delivery would need an idempotent destination or transactional outbox.                         |

## Reproducible verification

The [README demo](../README.md#a-90-second-demo) exercises fallback, approval, delivery, changed-input invalidation and outage recovery. `tests/restart.test.ts` kills a real Node process while review is pending, starts a new process, retries the saved input, kills it after approval, then starts again and delivers once. These tests cover process interruption, not power loss or distributed recovery. Unknown evidence IDs and refusal/abort semantics are also covered by the test suite; results are recorded in [verification](verification.md).

An asset content change alters its asset hash and the manifest digest. That digest is part of the approval boundary, so approval for the old input cannot authorize delivery of the changed assets.

## Extension boundaries

A new provider adapter would use the `Provider` interface and preserve refusal and abort semantics. Replacing file persistence with SQLite or Postgres would need to preserve revision checks, command deduplication and approval binding. A GCP deployment would additionally need authentication, transactional state storage, durable queues/workers, artifact storage and operational monitoring. These extensions have not been implemented or tested.

Fixture durations measure local code execution, not live inference speed or model quality. Further architecture details are in [architecture and trade-offs](architecture.md).
