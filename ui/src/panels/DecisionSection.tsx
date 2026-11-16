import { api } from "../api";
import { promptDialog } from "../dialogs";
import { Section } from "../fields";
import { StatusBadge } from "../DecisionsPage";
import { DECISION_KIND_INFO } from "../types";
import type { Common } from "./common";

/** The decisions about an element or relationship, and a button to record a new one (DEC-050). */
export function DecisionSection({ id, name, state, mutate, onOpenDecision }: Pick<Common, "state" | "mutate" | "onOpenDecision"> & { id: string; name: string }) {
  const about = state.decisions.filter((d) => d.affects.includes(id));
  const record = async () => {
    const title = await promptDialog({ title: `Record a decision about ${name}`, placeholder: "e.g. Keep it on the relational database", confirmLabel: "Create" });
    if (!title?.trim()) return;
    let made: string | null = null;
    const ok = await mutate(async () => {
      made = (await api.createDecision({ title: title.trim(), affects: [id] })).id;
    });
    if (ok && made) onOpenDecision(made);
  };
  return (
    <Section
      title="Decisions"
      count={about.length}
      testId="sec-decisions"
      footer={
        !state.readOnly && (
          <button className="add" onClick={() => void record()} data-testid="decision-record-here">
            + Record a decision
          </button>
        )
      }
    >
      {about.length === 0 ? (
        <p className="panel-note">No decision is about this yet.</p>
      ) : (
        <ul className="dec-mini">
          {about.map((d) => (
            <li key={d.file}>
              <button className="link" onClick={() => onOpenDecision(d.id)} title={`${DECISION_KIND_INFO[d.kind]?.label ?? d.kind} decision`} data-testid={`panel-decision-${d.id}`}>
                {d.id} {d.title}
              </button>
              <StatusBadge status={d.status} />
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
