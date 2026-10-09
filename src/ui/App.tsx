import { useEffect, useRef, useState } from "react";
import {
  scenarios,
  statusLabel,
  type Command,
  type Run,
  type Scenario,
} from "../core/contract";
import { api } from "./api";
import { Icon } from "./Icon";
import { ReviewView } from "./ReviewView";
import { NewReviewDialog } from "./NewReviewDialog";

export function App() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [info, setInfo] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("fallback");
  const pendingKey = useRef<{ fingerprint: string; key: string } | null>(null);
  const active = runs.find((run) => run.id === selected) ?? runs[0];
  useEffect(() => {
    let mounted = true;
    void api
      .list()
      .then((value) => {
        if (mounted) setRuns(value);
      })
      .catch((cause) => {
        if (mounted) setError(String(cause.message));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);
  function commandKey(fingerprint: string) {
    if (pendingKey.current?.fingerprint !== fingerprint)
      pendingKey.current = { fingerprint, key: crypto.randomUUID() };
    return pendingKey.current.key;
  }
  function upsert(run: Run) {
    setRuns((current) =>
      current.some((item) => item.id === run.id)
        ? current.map((item) => (item.id === run.id ? run : item))
        : [run, ...current],
    );
    setSelected(run.id);
  }
  async function create() {
    setBusy(true);
    setError(null);
    try {
      const run = await api.create(scenario, commandKey(`create:${scenario}`));
      upsert(run);
      pendingKey.current = null;
      setShowNew(false);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create the review.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function act(action: Command["action"]) {
    if (!active) return;
    setBusy(true);
    setError(null);
    try {
      let run = await api.command(
        active,
        action,
        commandKey(`${active.id}:${active.revision}:${action}`),
      );
      upsert(run);
      pendingKey.current = null;
      if (action === "approve" && run.status === "approved") {
        run = await api.command(
          run,
          "deliver",
          commandKey(`${run.id}:${run.revision}:deliver`),
        );
        upsert(run);
        pendingKey.current = null;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The action failed.");
      try {
        setRuns(await api.list());
      } catch {
        /* Preserve the last visible checkpoint during a disconnect. */
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <header>
        <a className="brand" href="/" aria-label="Switchyard home">
          <Icon name="branch" />
          Switchyard
        </a>
        <nav aria-label="Main">
          <button
            className={!info ? "nav-active" : ""}
            onClick={() => setInfo(false)}
          >
            Review desk
          </button>
          <button
            className={info ? "nav-active" : ""}
            onClick={() => setInfo(true)}
          >
            How it works
          </button>
        </nav>
        <span className="offline-label">Offline fixtures</span>
      </header>
      <aside>
        <h2>Release runs</h2>
        <button
          className="button primary new-review"
          onClick={() => {
            setShowNew(true);
            setInfo(false);
          }}
          disabled={busy}
        >
          <Icon name="plus" />
          New review
        </button>
        <div className="run-list">
          {runs.map((run) => (
            <button
              className={`run-item ${active?.id === run.id ? "selected" : ""}`}
              key={run.id}
              onClick={() => {
                setSelected(run.id);
                setInfo(false);
              }}
            >
              <strong>Harbor / launch kit</strong>
              <span>
                <i className={`status-dot ${run.status}`} />
                {statusLabel[run.status]}
              </span>
              <small>
                Fixture:{" "}
                {scenarios.find((item) => item.id === run.scenario)?.title}
              </small>
              <small className="run-version">
                v{run.manifest.version} · {run.id.slice(0, 8)}
              </small>
            </button>
          ))}
        </div>
        <p className="provenance">Synthetic assets only</p>
      </aside>
      <main aria-busy={busy}>
        {error ? (
          <div className="request-error" role="alert">
            <strong>Local request failed</strong>
            <p>{error}</p>
            <button
              className="text-button"
              onClick={() => {
                setError(null);
                void api
                  .list()
                  .then(setRuns)
                  .catch((cause) => setError(String(cause.message)));
              }}
            >
              Refresh runs
            </button>
          </div>
        ) : null}
        {info ? (
          <HowItWorks />
        ) : loading ? (
          <div className="empty">
            <h1>Opening the release desk…</h1>
          </div>
        ) : active ? (
          <ReviewView
            key={active.id}
            run={active}
            busy={busy}
            act={(action) => void act(action)}
          />
        ) : (
          <div className="empty">
            <div className="empty-branch">
              <Icon name="branch" />
            </div>
            <h1>A deliberate path to release.</h1>
            <p>
              Inspect synthetic assets, observe provider failures,
              <br />
              and approve one input version before local delivery.
            </p>
            <button className="button primary" onClick={() => setShowNew(true)}>
              Start a review <Icon name="arrow" />
            </button>
            <div className="empty-details">
              <span>01 / Evidence</span>
              <span>02 / Human decision</span>
              <span>03 / Verified bundle</span>
            </div>
            <p className="empty-note">
              Works without API keys. Your first run starts with a timeout and
              recovery.
            </p>
          </div>
        )}
      </main>
      {showNew ? (
        <NewReviewDialog
          scenario={scenario}
          busy={busy}
          onScenario={setScenario}
          onCancel={() => setShowNew(false)}
          onCreate={() => void create()}
        />
      ) : null}
    </div>
  );
}
function HowItWorks() {
  return (
    <article className="explanation">
      <h1>One input. One decision.</h1>
      <p className="lead">
        Switchyard makes the boundary between AI review and human authorization
        visible.
      </p>
      <h2>Validate first</h2>
      <p>
        The server verifies asset hashes and motion metadata before requesting a
        structured review. Every finding references an asset in the current
        manifest.
      </p>
      <h2>Observe failure</h2>
      <p>
        Atlas and Cedar are fixture adapters. Timeout and invalid output permit
        bounded fallback; explicit refusal stops routing. Durations measure
        local code execution, never model performance.
      </p>
      <h2>Bind approval to evidence</h2>
      <p>
        Approval stores the input version and SHA-256 digest. Loading version 2
        clears the approval server-side. Old revisions cannot authorize new
        input.
      </p>
      <h2>Resume deliberately</h2>
      <p>
        The server persists review-start and approval checkpoints. A process
        interruption becomes a visible retry state on restart. Idempotency keys
        deduplicate local commands; they do not promise exactly-once delivery to
        external systems.
      </p>
      <h2>Deliver locally</h2>
      <p>
        The bundle contains three original assets, a manifest, the pre-delivery
        audit trail, and checksum list. Downloads verify the actual bytes. No
        live providers, external publishing, authentication system, or cloud
        deployment are implemented.
      </p>
      <p className="japanese">
        このデモは架空の素材と決定的な応答を使用します。入力の変更で承認が無効になり、再起動後も記録された状態から再開できます。実際の企業案件・顧客・モデル品質を示すものではありません。
      </p>
    </article>
  );
}
