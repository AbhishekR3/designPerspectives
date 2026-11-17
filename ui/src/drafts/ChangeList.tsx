/** The list of changes against the compared version, their field details, and the read-only panel of a removed object. */
import { CHANGE_COLORS, CHANGE_LABEL } from "../colourOverlays";
import { KIND_LABEL, DECISION_KIND_INFO, type DecisionKind, type ChangeSet, type DiagramEdge, type DiagramNode, type FieldChange, type ObjectChange } from "../types";

const TYPE_LABEL: Record<string, string> = { elements: "Elements", relationships: "Relationships", flows: "Flows", decisions: "Decisions", settings: "Settings" };

/** Every change, grouped by type. Clicking one opens the diagram that shows it (a decision: the decision). */
export function ChangeList({ changes, onPick }: { changes: ChangeSet; onPick?(c: ObjectChange): void }) {
  const groups = (["elements", "relationships", "flows", "decisions", "settings"] as const).filter((g) => changes[g]?.length);
  if (!groups.length && !changes.code.length) return <p className="empty-note">No changes{changes.summary.layout ? ` (only ${changes.summary.layout} layout changes)` : ""}.</p>;
  return (
    <div className="change-list" data-testid="change-list">
      {groups.map((g) => (
        <div key={g}>
          <h4>
            {TYPE_LABEL[g]} <span className="muted">{changes[g].length}</span>
          </h4>
          <ul>
            {changes[g].map((c) => (
              <li key={`${c.type}-${c.id}`}>
                <button
                  className="link change-item"
                  disabled={!onPick || (!c.homeKey && !(c.type === "decision" && c.change !== "removed"))}
                  onClick={() => onPick?.(c)}
                  title={c.fields.map((f) => f.label).join(", ") || undefined}
                  data-testid={`change-${c.id}`}
                >
                  <span className="dot" style={{ background: CHANGE_COLORS[c.change] }} />
                  <span className="change-name">{c.name}</span>
                  <span className="muted small">
                    {kindLabel(c)} · {CHANGE_LABEL[c.change].toLowerCase()}
                    {c.fields.length > 0 && `: ${c.fields.map((f) => f.label.toLowerCase()).join(", ")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {changes.code.length > 0 && (
        <div data-testid="code-changes">
          <h4>
            Code{" "}
            <span className="muted">
              {changes.summary.code} file{changes.summary.code === 1 ? "" : "s"}
            </span>
          </h4>
          <ul>
            {changes.code.map((c) => (
              <li key={c.ownerId || "none"}>
                <button
                  className="link change-item"
                  disabled={!onPick || !c.homeKey}
                  onClick={() => onPick?.({ id: c.ownerId, type: "setting", kind: "code", name: c.ownerName, change: "changed", fields: [], homeKey: c.homeKey })}
                  data-testid={`code-change-${c.ownerId || "none"}`}
                >
                  <span className="dot" style={{ background: CHANGE_COLORS.inner }} />
                  <span className="change-name">{c.ownerName}</span>
                  <span className="muted small">
                    {c.files.map((f) => `${f.path.split("/").pop()} ${CHANGE_LABEL[f.change].toLowerCase()}`).join(", ")}
                    {c.imports.length > 0 && ` · ${c.imports.length} import${c.imports.length === 1 ? "" : "s"} ${[...new Set(c.imports.map((i) => i.change))].join("/")}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function kindLabel(c: ObjectChange): string {
  if (c.type === "element") return KIND_LABEL[c.kind as keyof typeof KIND_LABEL] ?? c.kind;
  if (c.type === "relationship") return "Relationship";
  if (c.type === "flow") return "Flow";
  if (c.type === "decision") return `${DECISION_KIND_INFO[c.kind as DecisionKind]?.label ?? c.kind} decision`;
  return "Setting";
}

/** Field-by-field changes of one object, shown at the top of its panel. */
export function ChangeDetails({ change, against }: { change: ObjectChange; against: string }) {
  return (
    <div className={`change-box ${change.change}`} data-testid="change-details" style={{ ["--chip" as string]: CHANGE_COLORS[change.change] }}>
      <div className="change-box-head">
        <span className="dot" style={{ background: CHANGE_COLORS[change.change] }} />
        {CHANGE_LABEL[change.change]} <span className="muted">compared with {against}</span>
      </div>
      {change.fields.map((f) => (
        <FieldDiff key={f.field} f={f} />
      ))}
    </div>
  );
}

function FieldDiff({ f }: { f: FieldChange }) {
  if (f.field === "other") return <div className="small muted">Other stored data changed.</div>;
  return (
    <div className="field-diff small">
      <div className="muted">{f.label}</div>
      <div className="before" title="Before">
        {show(f.before)}
      </div>
      <div className="after" title="After">
        {show(f.after)}
      </div>
    </div>
  );
}

function show(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return "—";
    if (v.every((x) => typeof x === "string")) return v.join(", ");
    return v
      .map((x) =>
        typeof x === "object" && x
          ? Object.values(x)
              .filter((y) => typeof y === "string" || typeof y === "number")
              .join(" · ")
          : String(x),
      )
      .join("; ");
  }
  if (typeof v === "object") {
    const entries = Object.entries(v as Record<string, unknown>);
    return entries.length ? entries.map(([k, x]) => `${k}: ${String(x)}`).join(", ") : "—";
  }
  return String(v);
}

/** A box or line that only the compared version has. */
export function GhostPanel({ node, edge, change, against }: { node?: DiagramNode; edge?: DiagramEdge; change?: ObjectChange; against: string }) {
  return (
    <div className="panel-body" data-testid="ghost-panel">
      <div className="panel-kind">{node ? KIND_LABEL[node.kind] : "Relationship"} · not in this version</div>
      <h2 className="panel-title">{node ? node.name : edge?.description || "Relationship"}</h2>
      {node?.description && <p>{node.description}</p>}
      {(node?.technologies.length ?? 0) > 0 && <p className="muted small">{node!.technologies.join(", ")}</p>}
      <p className="muted small">
        {change?.change === "removed"
          ? `Removed: it exists in ${against} but not in the version you are looking at.`
          : `Not on this diagram any more (it is still in the model, shown on another diagram).`}
      </p>
    </div>
  );
}
