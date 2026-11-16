import type { AppState, Relationship } from "./types";

/** A JSON object to compare field by field: the value itself, or the first object of an array. */
export function asRecord(text: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(text);
    const o = Array.isArray(v) ? v[0] : v;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text);
    return /^\s*[[{]/.test(text);
  } catch {
    return false;
  }
}

type Mark = "added" | "changed" | "same";

/** Top-level fields of `cur` against `prev`: which were added or changed, and which were dropped. */
export function compareFields(prev: string | undefined, cur: string): { marks: Map<string, Mark>; removed: string[] } | null {
  const a = prev ? asRecord(prev) : null;
  const b = asRecord(cur);
  if (!a || !b) return null;
  const marks = new Map<string, Mark>();
  for (const k of Object.keys(b)) marks.set(k, !(k in a) ? "added" : JSON.stringify(a[k]) === JSON.stringify(b[k]) ? "same" : "changed");
  return { marks, removed: Object.keys(a).filter((k) => !(k in b)) };
}

const indent = (s: string) => s.replace(/\n/g, "\n  ");

/** One sample payload. JSON is pretty-printed; with `previous`, changed top-level fields are marked. */
export function SamplePayload({ text, previous, testId }: { text: string; previous?: string; testId?: string }) {
  const cmp = compareFields(previous, text);
  const obj = cmp ? asRecord(text) : null;
  const wasArray = cmp ? /^\s*\[/.test(text) : false;
  if (cmp && obj && !wasArray) {
    const keys = Object.keys(obj);
    return (
      <div className="sample" data-testid={testId}>
        <pre className="example">
          {"{\n"}
          {keys.map((k, i) => (
            <span key={k} className={`sample-line ${cmp.marks.get(k)}`} title={cmp.marks.get(k) === "same" ? undefined : `${cmp.marks.get(k) === "added" ? "Added" : "Changed"} by this step`}>
              {`  ${JSON.stringify(k)}: ${indent(JSON.stringify(obj[k], null, 2))}${i < keys.length - 1 ? "," : ""}\n`}
            </span>
          ))}
          {cmp.removed.map((k) => (
            <span key={`-${k}`} className="sample-line removed" title="Removed by this step">
              {`  ${JSON.stringify(k)}\n`}
            </span>
          ))}
          {"}"}
        </pre>
        <FieldSummary marks={cmp.marks} removed={cmp.removed} />
      </div>
    );
  }
  const pretty = isJson(text) ? JSON.stringify(JSON.parse(text), null, 2) : text;
  return (
    <div className="sample" data-testid={testId}>
      <pre className="example">{pretty}</pre>
      {cmp && <FieldSummary marks={cmp.marks} removed={cmp.removed} />}
    </div>
  );
}

function FieldSummary({ marks, removed }: { marks: Map<string, Mark>; removed: string[] }) {
  const of = (m: Mark) => [...marks].filter(([, v]) => v === m).map(([k]) => k);
  const parts: [string, string[]][] = [
    ["removed", removed],
    ["added", of("added")],
    ["changed", of("changed")],
  ];
  const shown = parts.filter(([, ks]) => ks.length);
  if (!shown.length) return <div className="sample-summary muted small">Passes the data on unchanged.</div>;
  return (
    <div className="sample-summary small">
      {shown.map(([label, ks]) => (
        <span key={label} className={`sample-chip ${label}`}>
          {label[0].toUpperCase() + label.slice(1)}: {ks.join(", ")}
        </span>
      ))}
    </div>
  );
}

const formatLabel = (format: string | undefined, text: string) => format || (isJson(text) ? "JSON" : "");

/**
 * The data moving through a relationship: what enters, then what leaves each stage, then where it
 * ends up. Each stage's sample is compared with the one before it, so a reader sees what each
 * stage does to the data. With no samples on the relationship, the examples of flow steps that use
 * it are shown instead.
 */
export function PipelineData({ rel, state, onSelectStage, onBacktrack }: { rel: Relationship; state: AppState; onSelectStage?(stageId: string): void; onBacktrack?(stage: number): void }) {
  const name = (id: string) => state.elements.find((e) => e.id === id)?.name ?? id;
  const hasOwn = Boolean(rel.example) || rel.stages.some((s) => s.example);
  if (!hasOwn) {
    const fromFlows = state.flows.flatMap((f) => f.steps.filter((s) => s.relationshipId === rel.id && s.example).map((s) => ({ flow: f, step: s })));
    if (!fromFlows.length) return <div className="empty-note">No example data yet.{!state.readOnly && " Add a sample below so readers can see what this carries."}</div>;
    return (
      <div className="pipeline-data" data-testid="pipeline-data">
        {fromFlows.map(({ flow, step }, i) => (
          <div key={i} className="pd-step">
            <div className="pd-head">
              <span className="pd-name">{step.response ? "Returned" : "Sent"}</span>
              <span className="muted small">
                in flow “{flow.title}”{step.format ? ` · ${step.format}` : ""}
              </span>
            </div>
            <SamplePayload text={step.example!} />
          </div>
        ))}
      </div>
    );
  }
  let previous: string | undefined;
  const rows: React.ReactNode[] = [];
  rows.push(
    <div key="src" className="pd-step pd-end">
      <div className="pd-head">
        <span className="pd-name">{name(rel.sourceId)}</span>
        <span className="muted small">{rel.stages.length ? "sends" : "sends to " + name(rel.destinationId)}</span>
        {formatLabel(rel.format, rel.example) && <span className="pd-format">{formatLabel(rel.format, rel.example)}</span>}
      </div>
      {rel.example ? <SamplePayload text={rel.example} testId="pd-in" /> : <div className="empty-note small">No sample of what enters.</div>}
    </div>,
  );
  if (rel.example) previous = rel.example;
  rel.stages.forEach((st, i) => {
    rows.push(
      <div key={st.id} className="pd-step" data-testid={`pd-stage-${i}`}>
        <div className="pd-head">
          <span className="pd-num">{i + 1}</span>
          {onSelectStage ? (
            <button className="link pd-name" onClick={() => onSelectStage(st.id)}>
              {st.name}
            </button>
          ) : (
            <span className="pd-name">{st.name}</span>
          )}
          {st.example && formatLabel(st.format, st.example) && <span className="pd-format">{formatLabel(st.format, st.example)}</span>}
          {onBacktrack && (
            <button className="link small pd-back" onClick={() => onBacktrack(i + 1)} title="Backtrack from this stage" data-testid={`pd-backtrack-${i}`}>
              ↶ backtrack
            </button>
          )}
        </div>
        {st.description && <div className="muted small">{st.description}</div>}
        {st.example ? <SamplePayload text={st.example} previous={previous} /> : <div className="empty-note small">No sample of what this stage produces.</div>}
      </div>,
    );
    if (st.example) previous = st.example;
  });
  if (rel.stages.length)
    rows.push(
      <div key="dst" className="pd-step pd-end">
        <div className="pd-head">
          <span className="pd-name">{name(rel.destinationId)}</span>
          <span className="muted small">receives the last sample</span>
        </div>
      </div>,
    );
  return (
    <div className="pipeline-data" data-testid="pipeline-data">
      {rows}
    </div>
  );
}
