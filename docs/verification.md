# Verified locally on 2026-10-09

Environment: macOS arm64; Node 22.17.0; npm 11.4.2. Public npm registry versions were checked during setup. TypeScript 6.0.3 was selected for compatibility with typescript-eslint's supported range. `package-lock.json` locks the installed set. No machine-wide configuration changed.

| Check                         | Observed result                                           |
| ----------------------------- | --------------------------------------------------------- |
| `npm run typecheck`           | Passed                                                    |
| `npm run lint`                | Passed                                                    |
| `npm test`                    | 37 tests passed in 4 files                                |
| `npm run build`               | Passed; client JS 323.27 kB / 98.42 kB gzip at this build |
| `npm run test:e2e`            | 5 passed                                                  |
| `npm run demo`                | 9 actual offline run snapshots exported                   |
| Dependency installation audit | 0 reported npm vulnerabilities at installation time       |

The restart integration test starts a real child Node server with a long fixture deadline, observes its persisted reviewing checkpoint, kills the process, starts another server, retries, approves, kills that process, starts a third server and delivers from the persisted approval. This tests process interruption, not power loss or distributed recovery.

The first sandbox test invocation could not bind loopback sockets (`EPERM`). The full passing run used an authorized execution outside that restriction. The host-security test uses a raw Node HTTP client because Node fetch normalized the supplied Host header. No security behavior was loosened to make tests pass.

## Browser proof

The in-app browser was used first. The automated Playwright suite then used the existing cached Chromium build 1243 with `CHROMIUM_EXECUTABLE_PATH`; no new browser was installed on this Mac. Default Playwright 1.64.0 expects build 1248, so that exact bundled browser and other engines are not locally verified. CI is configured to install its matching Chromium.

| In-app browser check                  | Result                                                                |
| ------------------------------------- | --------------------------------------------------------------------- |
| Identity                              | Title `Switchyard · Local release desk`, URL `http://127.0.0.1:4310/` |
| Meaningful render / framework overlay | Content rendered; no framework error overlay                          |
| Console health                        | No application error/warning entries on the checked screen            |
| Fallback                              | Atlas timeout → Cedar valid → human decision                          |
| Delivery                              | Approve → six real files → verified bundle                            |
| Version change                        | Completed v1 → revised v2 → old approval and download removed         |
| Error / retry                         | Both unavailable → explicit retry → valid round 2                     |
| Responsive                            | 1536 × 1045 and 390 × 844; no document horizontal overflow            |

The in-app viewport screenshot API cropped the displayed visible surface at the larger override; full-page screenshots captured the complete layout. DOM width checks showed no document overflow. Supporting screenshots live in the parent workspace's `evidence/`, outside the Git checkout.

Playwright also checks evidence preview, actual download completion, distinct timeout/invalid/refusal states, refusal without retry bypass, mobile rejection after reload, and native-dialog Escape/focus wrapping. A keyboard focus-wrap issue was found and fixed, then all five tests passed.

## Visual fidelity ledger

Compared the generated concept and complete browser screenshot directly: cool gray background/white surfaces, black title and cobalt controls; left release rail; four-step workflow strip; evidence table/linked findings/approval region; provider trace and audit column. Those structures and tokens are implemented consistently.

Intentional functional deviations: only actual created runs appear, avoiding the concept's decorative Ridge/Mesa examples; three evidence-linked findings are shown; measured local durations have explicit fixture context; input revision and recovery controls are added. On mobile the release rail becomes a horizontal list and the two content columns stack. The concept is a design reference, not a product screenshot.

## Remote CI on 2026-10-09

[GitHub Actions run 37888537230](https://github.com/domizo/switchyard/actions/runs/37888537230) passed for commit `46c048bb2b2c6be2c791ba3bdf663ef67ce68da9` on 2026-10-09. The repository is owned by `domizo` and remains private. This records the verified source revision; subsequent documentation or license changes require their own [workflow run](https://github.com/domizo/switchyard/actions/workflows/ci.yml).

| Ubuntu job   | Observed result                                                                                                |
| ------------ | -------------------------------------------------------------------------------------------------------------- |
| Node 22.17.0 | Typecheck, lint and build passed; 37 unit/integration tests; 5 Playwright workflows; 9 demo snapshots exported |
| Node 24      | Same checks passed; 37 unit/integration tests; 5 Playwright workflows; 9 demo snapshots exported               |
| Contract     | Generated schema matched the committed schema                                                                  |

Both browser jobs installed and passed with Playwright's matching Chromium build 1248. Job conclusions and test counts were checked through the authenticated GitHub connector, including job logs. CI validates the offline implementation; it does not measure live-model quality or production performance.

## Remaining limits

Firefox/WebKit, all assistive technology combinations, load, live providers, multi-user authorization, interprocess concurrency, cloud deployment and power-loss durability are untested or unimplemented.
