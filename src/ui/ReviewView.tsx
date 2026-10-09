import { useState } from "react";
import type { Command, Run } from "../core/contract";
import { Icon } from "./Icon";

export function ReviewView({
  run,
  busy,
  act,
}: {
  run: Run;
  busy: boolean;
  act: (action: Command["action"]) => void;
}) {
  const [assetId, setAssetId] = useState<string | null>(null);
  const approved = !!run.approval;
  const reviewed = !!run.review;
  const steps = [
    {
      title: "Validate",
      done: run.checks.every((check) => check.passed),
      detail: "Complete",
    },
    {
      title: "AI review",
      done: reviewed,
      detail:
        run.status === "failed"
          ? "Failed"
          : reviewed
            ? "Complete"
            : "In progress",
    },
    {
      title: "Approval",
      done: approved,
      detail: approved
        ? "Granted"
        : run.status === "rejected"
          ? "Rejected"
          : reviewed
            ? "Pending"
            : "Blocked",
    },
    {
      title: "Delivery",
      done: !!run.delivery,
      detail: run.delivery ? "Complete" : approved ? "Ready" : "Blocked",
    },
  ];
  const selectedAsset = run.manifest.assets.find(
    (asset) => asset.id === assetId,
  );
  return (
    <>
      <div className="title-row">
        <div>
          <h1>{run.manifest.title}</h1>
          <p>
            Creative asset review <span className="separator">•</span> Input
            version {run.manifest.version}
          </p>
        </div>
        <a
          className="button secondary"
          href={`/api/runs/${run.id}/trace`}
          download={`switchyard-${run.id}.json`}
        >
          <Icon name="download" />
          Export trace
        </a>
      </div>
      <ol className="steps" aria-label="Release workflow">
        {steps.map((step, i) => (
          <li key={step.title}>
            <span
              className={`step-dot ${step.done ? "done" : i === 2 && reviewed && !approved ? "pending" : ""}`}
            >
              {step.done ? <Icon name="check" /> : "•"}
            </span>
            <div>
              <span className="step-number">0{i + 1}</span>
              <strong>{step.title}</strong>
              <small>{step.detail}</small>
            </div>
          </li>
        ))}
      </ol>
      <div className="workspace-grid">
        <section className="panel evidence">
          <h2>Evidence</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Checksum</th>
                  <th>Checks</th>
                </tr>
              </thead>
              <tbody>
                {run.manifest.assets.map((asset) => (
                  <tr key={asset.id}>
                    <td>
                      <button
                        className="text-button asset-name"
                        onClick={() => setAssetId(asset.id)}
                      >
                        {asset.name}
                      </button>
                    </td>
                    <td>
                      <code title={asset.sha256}>
                        {asset.sha256.slice(0, 10)}…
                      </code>
                    </td>
                    <td>
                      <span className="check-result">
                        <span className="mini-check">
                          <Icon name="check" />
                        </span>
                        {run.checks.find((check) => check.assetId === asset.id)
                          ?.passed
                          ? "Matched"
                          : "Failed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedAsset ? (
            <div className="asset-preview">
              <div>
                <strong>{selectedAsset.name}</strong>
                <button
                  className="text-button"
                  onClick={() => setAssetId(null)}
                >
                  Close preview
                </button>
              </div>
              <pre>{selectedAsset.content}</pre>
            </div>
          ) : null}
          <h2 className="findings-title">Review findings</h2>
          {run.review ? (
            <ol className="findings">
              {run.review.findings.map((finding, index) => (
                <li key={`${finding.assetId}-${index}`}>
                  <span className="finding-number">{index + 1}</span>
                  <div>
                    <p>{finding.message}</p>
                    <button
                      className="text-button"
                      onClick={() => setAssetId(finding.assetId)}
                    >
                      {
                        run.manifest.assets.find(
                          (asset) => asset.id === finding.assetId,
                        )?.name
                      }
                    </button>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">
              A structured review is required before a human decision.
            </p>
          )}
          {run.failure ? (
            <div className="error-box" role="status">
              <h3>
                {run.failure.code === "delivery_failed"
                  ? "Delivery needs attention"
                  : "Review stopped"}
              </h3>
              <code>{run.failure.code}</code>
              <p>{run.failure.message}</p>
              {!["refusal", "input_invalid", "delivery_failed"].includes(
                run.failure.code,
              ) ? (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => act("retry")}
                >
                  Retry review <Icon name="arrow" />
                </button>
              ) : null}
            </div>
          ) : null}
          {run.status === "awaiting_approval" ? (
            <div className="decision">
              <h2>Human decision</h2>
              <p>Approval applies only to this input version.</p>
              <div className="actions">
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => act("approve")}
                >
                  Approve &amp; build bundle
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => act("reject")}
                >
                  Reject release
                </button>
              </div>
            </div>
          ) : null}
          {run.status === "approved" ? (
            <div className="decision">
              <h2>Approved checkpoint</h2>
              <p>This version is approved. Local delivery can resume safely.</p>
              <button
                className="button primary"
                disabled={busy}
                onClick={() => act("deliver")}
              >
                Build local bundle
              </button>
            </div>
          ) : null}
          {run.delivery ? (
            <div className="decision success">
              <h2>Local bundle verified</h2>
              <p>
                {run.delivery.files.length} files with SHA-256 checksums. No
                external delivery occurred.
              </p>
              <a
                className="button primary"
                href={`/api/runs/${run.id}/bundle`}
                download
              >
                Download bundle <Icon name="download" />
              </a>
              <p className="bundle-path">
                <code>.data/deliveries/{run.delivery.directory}</code>
              </p>
            </div>
          ) : null}
          {run.status === "rejected" ? (
            <div className="decision">
              <h2>Release rejected</h2>
              <p>No delivery was created.</p>
            </div>
          ) : null}
          {run.manifest.version === 1 && run.status !== "reviewing" ? (
            <div className="revision-control">
              <p>
                Test the approval boundary: change motion from 6 to 8 seconds.
              </p>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => act("revise")}
              >
                Load input version 2 <Icon name="arrow" />
              </button>
            </div>
          ) : null}
        </section>
        <div className="right-column">
          <section className="panel">
            <h2>Provider trace</h2>
            <div className="trace-list">
              {run.attempts.length ? (
                run.attempts.map((attempt, index) => (
                  <div
                    className={`trace-item ${attempt.outcome === "valid" ? "valid" : ""}`}
                    key={index}
                  >
                    <div className="trace-title">
                      <strong>{attempt.provider}</strong>
                      <span className={`outcome ${attempt.outcome}`}>
                        {attempt.outcome.replace("_", " ")}
                      </span>
                    </div>
                    <p>
                      {attempt.outcome === "valid"
                        ? "Returned a structured review."
                        : attempt.outcome === "timeout"
                          ? "Provider exceeded the local deadline."
                          : attempt.outcome === "refusal"
                            ? "Explicit refusal. Routing stopped."
                            : attempt.outcome === "invalid_output"
                              ? "Response failed schema validation."
                              : "Fixture temporarily unavailable."}
                    </p>
                    <small>
                      Round {attempt.round} · {attempt.elapsedMs.toFixed(2)} ms
                      measured locally
                    </small>
                  </div>
                ))
              ) : (
                <p className="muted">Waiting for provider results.</p>
              )}
            </div>
            <p className="fixture-note">
              Deterministic responses (synthetic).
              <br />
              No live model or network calls.
            </p>
          </section>
          <section className="panel audit">
            <h2>Audit log</h2>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Input</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {run.audit.map((event) => (
                    <tr key={event.seq}>
                      <td>
                        <code>{event.event}</code>
                      </td>
                      <td>v{event.inputVersion}</td>
                      <td>{event.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="audit-foot">
              Revision {run.revision} · {run.id.slice(0, 8)}
            </p>
          </section>
        </div>
      </div>
      <footer>Local delivery only.</footer>
    </>
  );
}
