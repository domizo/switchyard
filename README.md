# Switchyard

[English](README.md) | [日本語](README.ja.md)

An original **local creative-asset release desk**: deterministic evidence checks → typed provider review → human approval → a real checksummed delivery bundle. Built with React, TypeScript and Node.js.

All assets and responses are original synthetic fixtures. No paid APIs, credentials, customer data or external delivery are needed.

## Run in three commands

Node 22.17+ in the 22.x line, or Node 24+. From this directory:

```sh
npm ci --ignore-scripts
npm run build
npm start
```

Open **http://127.0.0.1:4310**. The server binds to loopback. Runtime state and bundles stay in `.data/` (gitignored). Use one server process per data directory.

For development, start `npm run server -- --dev` and `npm run dev` in separate terminals. The Vite console uses port 5173. Installation fetches public npm packages; the demo and tests make no provider calls after setup.

## A 90-second demo

1. **New review → Fallback recovery → Run review.** Atlas exceeds its 25 ms local deadline; Cedar supplies a validated fixture response. Inspect an evidence-linked finding.
2. **Approve & build bundle.** The server commits approval first, then creates six local files. Download the verified JSON bundle, which contains those files and hashes.
3. **Load input version 2.** Motion changes from 6 to 8 seconds. The server removes approval and blocks delivery until the new input is approved.
4. Create **Recoverable outage**, inspect `unavailable`, then **Retry review**. Recovery is a documented deterministic scenario.

Timeout, invalid response and refusal can also be selected. Refusal stops routing and has no retry bypass. See [the architecture and trade-offs](docs/architecture.md), [contract](docs/contract.md), and [technical walkthrough](docs/walkthrough.md).

## Verify

```sh
npm run check          # type checks, lint, 37 unit/integration tests, production build
npx playwright install chromium  # optional official browser setup for UI tests
npm run test:e2e       # 5 full browser workflows against the built app
npm run demo          # writes 9 actual offline snapshots to .data/demo-cases.jsonl
```

Browser installation is not needed to run the app. The local verification used an existing cached Chromium via `CHROMIUM_EXECUTABLE_PATH`; CI installs the matching Playwright browser in its runner. On 2026-10-09, [GitHub Actions](https://github.com/domizo/switchyard/actions/runs/37884056652) passed on Ubuntu with Node 22.17.0 and 24: 37 unit/integration tests and 5 browser workflows per version, plus the schema-drift check. [Verification evidence](docs/verification.md) separates local results from remote CI.

To evaluate a fresh exchange with the independent Fieldcheck checkout:

```sh
npm run demo -- ../fieldcheck/fixtures/baseline.jsonl
cd ../fieldcheck
python3 fixtures/make_negative_controls.py
python3 -m fieldcheck fixtures/baseline.jsonl
```

## Implemented / simulated / not implemented

**Implemented:** schema validation and evidence references; bounded routing and abort deadlines; persisted commands and checkpoints; optimistic revisions; server-side approval invalidation; local bundle files, SHA-256 checksums, byte-verified download; restart recovery tests; accessible responsive UI; CI workflow files.

**Simulated:** the Atlas and Cedar providers, their failures, and the recovery after an explicit retry. Fixture timing measures local code execution. It does not measure live inference or model quality.

**Not implemented or verified:** live provider adapters, multi-user authentication, cloud execution, GCP/iOS integration, distributed workers, power-loss durability, accessibility across all assistive technologies, load testing or production operations. This is a scoped demo, not a production-ready claim.

A project license has not been selected.
