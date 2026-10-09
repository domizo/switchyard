import { useEffect, useRef } from "react";
import { scenarios, type Scenario } from "../core/contract";

export function NewReviewDialog({
  scenario,
  busy,
  onScenario,
  onCancel,
  onCreate,
}: {
  scenario: Scenario;
  busy: boolean;
  onScenario: (scenario: Scenario) => void;
  onCancel: () => void;
  onCreate: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal"
      aria-labelledby="new-title"
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        const controls = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            "select:not(:disabled), button:not(:disabled)",
          ),
        ];
        const first = controls[0];
        const last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="new-title">New asset review</h2>
      <p>One original launch kit. Choose a deterministic provider behavior.</p>
      <label htmlFor="scenario">Fixture scenario</label>
      <select
        id="scenario"
        value={scenario}
        onChange={(event) => onScenario(event.target.value as Scenario)}
        autoFocus
        disabled={busy}
      >
        {scenarios.map((item) => (
          <option key={item.id} value={item.id}>
            {item.title}
          </option>
        ))}
      </select>
      <p className="scenario-detail">
        {scenarios.find((item) => item.id === scenario)?.detail}
      </p>
      <div className="actions">
        <button className="button secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button className="button primary" disabled={busy} onClick={onCreate}>
          {busy ? "Running review…" : "Run review"}
        </button>
      </div>
    </dialog>
  );
}
